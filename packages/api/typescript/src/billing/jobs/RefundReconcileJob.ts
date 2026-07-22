import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { tryCatchAsync } from '@template/core-typescript'
import { forEachWithConcurrency } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { IdempotencyGuard } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import type { Transaction } from '@template/core-typescript'
import { ChargeRepository, CreditNoteRepository, InvoiceRepository } from '@billing/repositories'

import { PaymentProviderFactory, TwoTickDriftAlert, OperatorAlert } from '@billing/services'
import { InvoiceRefundedEvent, InvoiceRefundedEventSchema } from '@billing/events'
import { LoggingService } from '@template/core-typescript'
import { CreditNoteReason } from '@template/contracts-typescript/wire/enums'

const RefundReconcileJobInputSchema = z.object({})

/**
 * Um grupo a vigiar por INVOICE — enumerado a partir de TODA fatura com charge SUCCEEDED na banda
 * de scan (`listWithSucceededChargeSince`), não mais das expectativas do engine. O drift é medido
 * pelo total agregado da invoice inteira: medir por-tx e comparar contra o Σ REFUND (que é
 * invoice-wide) mascararia um tx B perdido atrás de um CN já bookado pro tx A da mesma invoice
 * (achado adversarial [4]).
 */
interface RefundWatch {
	ownerId: string
	invoiceId: string
	gatewayTxIds: Set<string>
	/** Emissão mais NOVA de InvoiceRefundedEvent para esta invoice dentro da banda de scan, se o
	 * engine (RefundInvoice/RequestRefund) alguma vez emitiu uma — `undefined` quando o refund foi
	 * iniciado só no dashboard do gateway (nenhuma expectativa do engine existe). Drives dois papéis
	 * (Decisions 3/4 da spec): o freio de in-flight (pula o tick enquanto a expectativa é mais nova
	 * que o min-age — um webhook NOSSO ainda em trânsito) e a condição do alerta
	 * refund-unmonitored (só soa quando SABEMOS que um refund está em voo e não conseguimos
	 * verificar — sem expectativa e sem capability não há sinal, então fica em silêncio). */
	latestEmittedAt?: Date
}

/**
 * Camada 3 — DETECT-AND-ALERT de drift de refund. Este job é INCAPAZ de escrever dinheiro por
 * construção: ele compara o total refundado que o gateway reporta (getRefundStatus — totais são
 * seguros num poll cumulativo) com o Σ de credit notes REFUND do ledger e, quando o gateway está à
 * frente (drift > 0), alerta o operador EXATAMENTE UMA VEZ (claim refund-drift:{invoiceId}) com os
 * dois totais e o runbook: re-entregar o webhook pelo dashboard do gateway — o evento real chega
 * com a identidade canônica e booka pelo caminho normal. NUNCA sintetiza
 * ExternalChargeRefundedEvent: um review adversarial provou que auto-bookar a partir de um poll
 * cumulativo double-booka ou estranha refunds (sem identidade por-refund no GET). Quem RECUPERA é
 * a camada 2 (WindowReconcileJob) onde a plataforma lista; aqui só se DETECTA o que ela não
 * alcança.
 *
 * Enumeração (Task T1 — troca da camada 3 para ledger-derived, fecha o gap de dashboard refunds):
 * TODA fatura com charge SUCCEEDED na banda `BILLING_REFUND_DRIFT_SCAN_DAYS`
 * (`InvoiceRepository.listWithSucceededChargeSince`) é vigiada, independente de quem iniciou o
 * refund, **UNION** com toda invoice que carrega uma expectativa InvoiceRefundedEvent do engine
 * dentro da mesma janela de leitura — mesmo quando o charge referido é mais velho que a banda
 * (pós-review adversarial, achado [6]: sem o union, um refund do ENGINE sobre um charge >90d
 * ficava sem vigia nenhum, já que a expectativa virou só o freio de in-flight, nunca fonte de
 * enumeração — ver doc de RefundWatch.latestEmittedAt).
 *
 * Quando NENHUM tx da invoice é medível (toda plataforma envolvida devolve
 * PROVIDER_CAPABILITY_UNSUPPORTED), o job só alerta (claim refund-unmonitored:{invoiceId}) se
 * existir uma expectativa do engine para a invoice — sem expectativa E sem capability não há sinal
 * de que um refund sequer existe; alertar toda fatura SUCCEEDED de uma plataforma sem capability
 * seria ruído puro (Decision 4 da spec). O MESMO alerta (mesma claim key) cobre o caso MISTO
 * medível+unsupported na mesma invoice (achado [8]) — o drift NUNCA é calculado sobre uma medição
 * parcial, porque um CN bookado no tx unsupported pode mascarar drift real no tx medível.
 *
 * Faturas SEM expectativa do engine (refund só de dashboard) não têm o freio de in-flight, então um
 * drift positivo passa por uma persistência de DOIS TICKS antes de virar alerta (achado [7]): o
 * primeiro tick que observa drift toma um claim `refund-drift-pending:{invoiceId}` e não alerta; só
 * um tick SUBSEQUENTE que ainda observe drift escala pro alerta real. Faturas COM expectativa
 * seguem o caminho direto (freio de in-flight já protege contra o falso alarme do webhook em
 * trânsito).
 */
@injectable()
export class RefundReconcileJob extends Handler<typeof RefundReconcileJobInputSchema> {
	readonly name = 'billing.reconcile-refunds' as const
	readonly inputSchema = RefundReconcileJobInputSchema
	readonly outputSchema = z.void()

	constructor(
		private chargeRepository: ChargeRepository,
		private creditNoteRepository: CreditNoteRepository,
		private invoiceRepository: InvoiceRepository,
		private providerFactory: PaymentProviderFactory,
		private idempotencyGuard: IdempotencyGuard,
		private twoTickDriftAlert: TwoTickDriftAlert,
		private operatorAlert: OperatorAlert,
		private loggingService: LoggingService,
	) {
		super()
	}

	/** Polls de gateway em voo por tick — mesmo racional dos sweeps irmãos. */
	private static readonly SWEEP_CONCURRENCY = 5

	async handle(): Promise<void> {
		const now = new Date()
		const since = new Date(now.getTime() - ProductConfig.env.BILLING_REFUND_DRIFT_SCAN_DAYS * 24 * 60 * 60_000)

		// Enumeração (nova fonte) + expectativas do engine (agora só o freio) — UMA consulta cada por
		// tick, nunca N por invoice.
		const [invoicesWithSucceededCharge, expectationEvents] = await Promise.all([
			this.invoiceRepository.listWithSucceededChargeSince({ since }),
			this.domainEventRepository.listByNameSince(InvoiceRefundedEvent.name, since),
		])

		// Indexa a emissão MAIS NOVA por invoice (freio) e os tx's que a expectativa carrega
		// (enumeração union — achado [6]). O freio protege a expectativa mais recente, não a mais
		// velha (achado [5]: gatear pela mais velha deixaria uma segunda expectativa fresca sobre um
		// par já maduro ser pollada de imediato, queimando o claim exatamente-uma-vez contra um
		// webhook ainda em trânsito).
		const latestExpectationByInvoice = new Map<string, Date>()
		const expectationWatchByInvoice = new Map<string, { ownerId: string; gatewayTxIds: Set<string> }>()
		for (const event of expectationEvents) {
			// Narrowing via schema-parse (não `as`) — event.payload chega tipado como `{}` (o generic
			// default de BaseDomainEvent no read genérico do log), o parse valida E tipa de uma vez.
			const parsed = InvoiceRefundedEventSchema.shape.payload.safeParse(event.payload)
			if (!parsed.success || !parsed.data.gatewayTxId) continue // audit-only: invisível ao freio/detector
			const emittedAt = new Date(event.time)
			const existing = latestExpectationByInvoice.get(parsed.data.invoiceId)
			if (!existing || emittedAt > existing) latestExpectationByInvoice.set(parsed.data.invoiceId, emittedAt)

			const watchEntry = expectationWatchByInvoice.get(parsed.data.invoiceId)
			if (watchEntry) {
				watchEntry.gatewayTxIds.add(parsed.data.gatewayTxId)
			} else {
				expectationWatchByInvoice.set(parsed.data.invoiceId, {
					ownerId: parsed.data.ownerId,
					gatewayTxIds: new Set([parsed.data.gatewayTxId]),
				})
			}
		}

		this.loggingService.info({
			content: {
				message: 'RefundReconcileJob enumerated invoices with a succeeded charge in scan band',
				invoiceCount: invoicesWithSucceededCharge.length,
				scanDays: ProductConfig.env.BILLING_REFUND_DRIFT_SCAN_DAYS,
			},
		})

		// Enumeração = UNION da banda (charge-creation-time, 90d) com toda invoice que carrega uma
		// expectativa do engine — uma expectativa SEMPRE vira watch, mesmo quando o charge que ela
		// refere-se é mais velho que a banda (achado [6]: sem isso, um refund do ENGINE sobre um
		// charge >90d fica sem vigia nenhum — a expectativa vira só freio, nunca enumeração). Os tx's
		// da expectativa são somados aos da banda quando a mesma invoice aparece nas duas fontes.
		const bandWatchByInvoice = new Map(invoicesWithSucceededCharge.map(inv => [inv.invoiceId, inv]))
		const allWatchedInvoiceIds = new Set([...bandWatchByInvoice.keys(), ...expectationWatchByInvoice.keys()])

		const watches: RefundWatch[] = [...allWatchedInvoiceIds].map(invoiceId => {
			const band = bandWatchByInvoice.get(invoiceId)
			const expectation = expectationWatchByInvoice.get(invoiceId)
			const gatewayTxIds = new Set<string>([...(band?.gatewayTxIds ?? []), ...(expectation?.gatewayTxIds ?? [])])
			return {
				ownerId: band?.ownerId ?? expectation!.ownerId,
				invoiceId,
				gatewayTxIds,
				latestEmittedAt: latestExpectationByInvoice.get(invoiceId),
			}
		})

		await forEachWithConcurrency(watches, RefundReconcileJob.SWEEP_CONCURRENCY, async watch => {
			const result = await tryCatchAsync(() => this.detect(watch, now))
			if (!result.success) {
				// Um poll falho não starva o resto do sweep (molde dos jobs irmãos) — a invoice inteira
				// é pulada NESTE tick, mas as demais invoices do sweep seguem independentes.
				this.loggingService.warn({
					content: {
						message: 'RefundReconcileJob failed to check refund drift of invoice',
						invoiceId: watch.invoiceId,
						error: result.error.message,
					},
				})
			}
		})
	}

	private async detect(watch: RefundWatch, now: Date): Promise<void> {
		const hasExpectation = watch.latestEmittedAt !== undefined
		if (hasExpectation) {
			// Freio de in-flight (Decision 3): um webhook NOSSO meramente atrasado por minutos não é
			// drift — pollar cedo demais queimaria o claim exatamente-uma-vez num falso alarme. Sem
			// expectativa (refund de dashboard) não há webhook "nosso" a esperar — polla direto.
			const minAge = ProductConfig.env.BILLING_REFUND_RECONCILE_MAX_AGE_HOURS * 60 * 60_000
			if (now.getTime() - watch.latestEmittedAt!.getTime() < minAge) return
		}

		let measuredTotalCents = 0
		const measuredTxIds: string[] = []
		let attemptedCount = 0
		let unsupportedCount = 0

		for (const gatewayTxId of watch.gatewayTxIds) {
			const charge = await this.chargeRepository.findByGatewayTxId(gatewayTxId, watch.invoiceId)
			if (!charge) continue // sem charge → sem plataforma para pollar ESTE tx (não conta como tentativa)

			// Poll FORA de qualquer tx (rail tx-discipline).
			const status = await tryCatchAsync(() => this.providerFactory.for(charge.platform).getRefundStatus(gatewayTxId))
			attemptedCount++
			if (!status.success) {
				if (status.error instanceof BaseError && status.error.name === 'PROVIDER_CAPABILITY_UNSUPPORTED') {
					unsupportedCount++
					continue // este tx é inserível na medição; segue pros outros tx's da invoice
				}
				// Erro REAL de poll (não-capability). Sem tratamento dedicado, isso simplesmente
				// bubbleava e o wrapper de handle() fazia warn+skip TODO tick, para sempre — o operador
				// nunca era alertado de uma expectativa do engine que não consegue ser verificada (achado
				// [5]). Com expectativa madura (mesma condição que ancora refund-unmonitored abaixo) —
				// roteia pro MESMO alerta (mesma claim key `refund-unmonitored:{invoiceId}` →
				// exactly-once preservado), com detail dizendo que o POLL está falhando, não que falta
				// capability. Sem expectativa não há sinal de que um refund existe — mantém o warn+skip
				// deste tick (bubble pro wrapper), igual antes.
				if (hasExpectation) {
					const message = status.error instanceof Error ? status.error.message : String(status.error)
					await this.alertUnmonitored(
						watch,
						`refund status poll is failing for tx ${gatewayTxId} on invoice ${watch.invoiceId}: ${message}.`,
					)
					return
				}
				throw status.error
			}

			measuredTotalCents += status.data.refundedTotalCents
			measuredTxIds.push(gatewayTxId)
		}

		if (attemptedCount === 0) return // nenhum charge encontrado para nenhum tx → nada medível, nada a alertar

		if (unsupportedCount === attemptedCount) {
			// TODOS os tx's tentados são capability-unsupported. Decision 4: só alerta quando SABEMOS
			// que um refund está em voo (existe expectativa do engine) — sem expectativa E sem
			// capability não há sinal de que um refund sequer existe; alertar toda fatura SUCCEEDED de
			// uma plataforma sem capability seria ruído puro (ex.: todo pagamento Asaas Pix/PagBank).
			if (!hasExpectation) return
			await this.alertUnmonitored(watch, `no gateway supports polling refund status for its tx(s) (${[...watch.gatewayTxIds].join(', ')}).`)
			return
		}

		if (unsupportedCount > 0) {
			// Mistura de medível + unsupported na MESMA invoice — achado [8]: comparar o total
			// medido-só-nos-tx-suportados contra o Σ credit notes REFUND da invoice INTEIRA pode
			// mascarar drift real do tx medível atrás de um CN bookado pro tx unsupported (ex.: CN de
			// 500 no tx unsupported zera o "drift" computado mesmo com 500 de drift real no tx
			// medível). Fail-safe: NUNCA calcula drift quando a medição é parcial. Com expectativa
			// (sabemos que um refund está em voo) → mesmo sinal do caso 100%-unsupported. Sem
			// expectativa → não há sinal de que um refund existe; só loga o skip.
			if (!hasExpectation) {
				this.loggingService.warn({
					content: {
						message:
							'RefundReconcileJob skipping drift check — mixed measurable/unsupported tx(s) with no engine expectation to anchor an alert on',
						invoiceId: watch.invoiceId,
						ownerId: watch.ownerId,
						measuredTxIds,
						unsupportedCount,
					},
				})
				return
			}
			await this.alertUnmonitored(
				watch,
				`mixed measurable/unsupported tx(s) on this invoice make drift math unsafe — a credit note booked for the unsupported ` +
					`tx could mask real drift on the measured one (measured: ${measuredTxIds.join(', ') || 'none'}, unmeasurable count: ${unsupportedCount}).`,
			)
			return
		}

		// unsupportedCount === 0 aqui — toda tx da invoice foi medida, o drift é seguro de calcular.
		const credited = await this.creditNoteRepository.sumByInvoiceIdAndReason(watch.invoiceId, CreditNoteReason.REFUND)
		const drift = measuredTotalCents - credited
		if (drift <= 0) return

		// Two-tick drift-alert choreography (docs/BILLING.md → "O contrato de reconciliação",
		// TwoTickDriftAlert) — shared implementation with ChargebackReconcileJob. Persistência de dois
		// ticks (achado [7]): SEM expectativa não há freio de in-flight (o freio do topo do método só
		// existe quando `hasExpectation`), então um webhook de dashboard em trânsito minutos antes do
		// tick diário queimaria o claim exatamente-uma-vez num falso alarme — o primeiro tick que
		// observa drift toma um claim "pending" e NÃO alerta; o alerta real só dispara num tick
		// SUBSEQUENTE que ainda observe drift. `skipPendingGate: hasExpectation` preserva o atalho: COM
		// expectativa o freio de in-flight já protege contra o falso alarme, então pula direto pro claim
		// de alerta.
		await this.twoTickDriftAlert.observe({
			pendingKey: `refund-drift-pending:${watch.invoiceId}`,
			alertKey: `refund-drift:${watch.invoiceId}`,
			skipPendingGate: hasExpectation,
			emit: () =>
				this.operatorAlert.emit({
					kind: 'refund-drift',
					key: `refund-drift:${watch.invoiceId}`,
					runbook:
						're-deliver the refund webhook from the gateway dashboard (the real event carries the canonical id and books through the normal path).',
					context: {
						invoiceId: watch.invoiceId,
						ownerId: watch.ownerId,
						gatewayTxIds: measuredTxIds,
						measuredTotalCents,
						ledgerCreditedCents: credited,
					},
				}),
		})
	}

	/** Alerta compartilhado pelos dois casos "não dá pra verificar automaticamente" (100%-unsupported
	 * e mixed-com-expectativa) — mesma claim key, mesmo runbook, `detail` muda a causa. */
	private async alertUnmonitored(watch: RefundWatch, detail: string): Promise<void> {
		await this.withTransaction(undefined, async (tx: Transaction) => {
			const key = `refund-unmonitored:${watch.invoiceId}`
			if (await this.idempotencyGuard.claim(IdempotencyScope.RECONCILE_STALE_ALERT, key, tx)) {
				this.operatorAlert.emit({
					kind: 'refund-unmonitored',
					key,
					runbook: 'check the gateway dashboard directly, or re-deliver the refund webhook if one is pending.',
					context: {
						invoiceId: watch.invoiceId,
						ownerId: watch.ownerId,
						detail,
					},
				})
			}
		})
	}
}
