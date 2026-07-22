import { injectable } from 'tsyringe-neo'
import { Handler } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import { z } from '@template/core-typescript'
import { tryCatchAsync } from '@template/core-typescript'
import { forEachWithConcurrency } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { ChargeRepository, CreditNoteRepository, DisputeRepository, InvoiceRepository } from '@billing/repositories'
import { Charge } from '@billing/entities'

import { PaymentProviderFactory, TwoTickDriftAlert, OperatorAlert } from '@billing/services'
import { LoggingService } from '@template/core-typescript'
import { CreditNoteReason } from '@template/contracts-typescript/wire/enums'

const ChargebackReconcileJobInputSchema = z.object({})

/** Um grupo a vigiar por INVOICE — enumerado a partir de TODA fatura com charge SUCCEEDED na banda
 *  de scan (`listWithSucceededChargeSince`). Diferente do refund detector, chargeback não tem
 *  "expectativa engine" (nunca iniciamos um chargeback) — enumeração é cega por construção, sem
 *  freio de in-flight e sem alerta de "unmonitored" (Decision 6 da spec). */
interface ChargebackWatch {
	ownerId: string
	invoiceId: string
	gatewayTxIds: string[]
}

/**
 * Camada 3 — DETECT-AND-ALERT de drift de chargeback. Molde exato do `RefundReconcileJob`, mas mais
 * simples: chargeback não tem âncora de in-flight (nunca iniciamos um dispute), então não há freio
 * de min-age nem alerta "unmonitored" quando toda plataforma da invoice é capability-unsupported —
 * o job simplesmente pula a fatura em silêncio nesse caso (Decision 6). O job é INCAPAZ de escrever
 * dinheiro por construção: ele nunca sintetiza um credit note nem um evento — quem RECUPERA é o
 * caminho de webhook normal (`ExternalChargeDisputedHandler`); aqui só se DETECTA o que ele não
 * alcança.
 *
 * DOIS REGIMES (T5) no MESMO tick, decididos POR TX (finding [4] — não mais globalmente pela
 * invoice) a partir de `ChargebackStatus.disputeRefs`:
 *
 * - REGIME IDENTIDADE (hoje só Stripe): todo tx que devolve `disputeRefs` alimenta este regime. O
 *   detector faz set-difference entre os refs que o gateway enumera e os refs que o ledger já
 *   conhece — a UNIÃO (finding [6]) de `DisputeRepository.listRefsByInvoiceId` (o agregado `Dispute`,
 *   T2/T3) COM `CreditNoteRepository.listGatewayRefsByInvoiceIdAndReason` (qualquer status, incluindo
 *   REVERSED) — alertando UMA VEZ POR REF desconhecido (claim `chargeback-drift:{ref}`, não
 *   `{invoiceId}`). A união cobre o caso de um dispute cujo webhook JÁ foi processado (CN existe) mas
 *   cujo `Dispute` PROCESS row nunca foi inserido (dado anterior a T2/T3, ou um insert que
 *   falhou/perdeu a corrida) — sem ela esse ref alertaria PARA SEMPRE mesmo já registrado no ledger.
 *   Isso resolve a limitação histórica do regime booleano: um SEGUNDO dispute real na mesma invoice,
 *   aberto depois que o PRIMEIRO já foi ganho e revertido, tem sua PRÓPRIA identidade — nunca fica
 *   indistinguível de um sinal antigo ainda "sticky" no payment-level.
 * - REGIME BOOLEANO (PagarMe/Asaas/MP-por-enquanto): todo tx que NÃO devolve `disputeRefs` E reporta
 *   `chargedBack: true` alimenta este regime — ver o comentário na função `detect` abaixo.
 *
 * Uma invoice MISTA (um tx numa plataforma de identidade, outro numa plataforma booleana) roda os
 * DOIS regimes no MESMO tick, cada um com sua própria claim — o sinal booleano de um tx sem
 * `disputeRefs` nunca é descartado só porque outro tx da mesma invoice suporta identidade.
 *
 * Enumeração: TODA fatura com charge SUCCEEDED na banda `BILLING_CHARGEBACK_SCAN_DAYS` (default 120
 * dias — a janela contratual típica de disputa de cartão, mais larga que a banda de refund porque
 * chargebacks chegam meses depois da charge original). Por invoice, polla `getChargebackStatus` de
 * CADA `gatewayTxId` observado (nunca para no primeiro — precisa acumular `disputeRefs` de todos os
 * tx's, não só medir um booleano).
 *
 * Plataforma unsupported (`PROVIDER_CAPABILITY_UNSUPPORTED`, hoje só PagBank): pula o tx em
 * silêncio (log de debug), segue pros outros tx's da invoice. Se TODOS os tx's da invoice forem
 * unsupported, o job simplesmente não encontra nada a alertar — diferente do refund detector, não
 * existe alerta "unmonitored" aqui, porque chargeback nunca teve uma expectativa do engine para
 * ancorar esse sinal (Decision 6 — alertar toda fatura SUCCEEDED de uma plataforma sem capability
 * seria ruído perpétuo). Falha real de poll (rede/parse, finding [5]): pula APENAS o tx que falhou
 * (warn + continue) — os sinais dos demais tx's da mesma invoice seguem alimentando seus regimes
 * neste MESMO tick; o tx que falhou é re-varrido no próximo (o job é detect-only — falso-negativo é
 * a direção de falha correta, nunca abortar a invoice inteira por causa de UM tx).
 */
@injectable()
export class ChargebackReconcileJob extends Handler<typeof ChargebackReconcileJobInputSchema> {
	readonly name = 'billing.reconcile-chargebacks' as const
	readonly inputSchema = ChargebackReconcileJobInputSchema
	readonly outputSchema = z.void()

	constructor(
		private chargeRepository: ChargeRepository,
		private creditNoteRepository: CreditNoteRepository,
		private disputeRepository: DisputeRepository,
		private invoiceRepository: InvoiceRepository,
		private providerFactory: PaymentProviderFactory,
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
		const since = new Date(now.getTime() - ProductConfig.env.BILLING_CHARGEBACK_SCAN_DAYS * 24 * 60 * 60_000)

		const watches: ChargebackWatch[] = await this.invoiceRepository.listWithSucceededChargeSince({ since })

		this.loggingService.info({
			content: {
				message: 'ChargebackReconcileJob enumerated invoices with a succeeded charge in scan band',
				invoiceCount: watches.length,
				scanDays: ProductConfig.env.BILLING_CHARGEBACK_SCAN_DAYS,
			},
		})

		await forEachWithConcurrency(watches, ChargebackReconcileJob.SWEEP_CONCURRENCY, async watch => {
			const result = await tryCatchAsync(() => this.detect(watch, now))
			if (!result.success) {
				// Um poll falho não starva o resto do sweep (molde dos jobs irmãos) — a invoice inteira é
				// pulada NESTE tick, mas as demais invoices do sweep seguem independentes.
				this.loggingService.warn({
					content: {
						message: 'ChargebackReconcileJob failed to check chargeback drift of invoice',
						invoiceId: watch.invoiceId,
						error: result.error.message,
					},
				})
			}
		})
	}

	private async detect(watch: ChargebackWatch, now: Date): Promise<void> {
		// finding [4]: the two regimes are decided PER TX, not once for the whole invoice. A mixed
		// invoice (one tx on a platform that enumerates disputes by identity, another on a
		// boolean-only platform) must run BOTH regimes independently this same tick — a tx WITHOUT
		// `disputeRefs` still carries a genuine boolean signal that must not be discarded just because
		// a DIFFERENT tx on the same invoice happened to support identity.
		let identityChargedBack: Charge | undefined // first tx that fed the identity regime with chargedBack=true — log only
		let booleanChargedBack: Charge | undefined // first tx that fed the boolean regime with chargedBack=true
		const gatewayRefs: string[] = []

		for (const gatewayTxId of watch.gatewayTxIds) {
			const charge = await this.chargeRepository.findByGatewayTxId(gatewayTxId, watch.invoiceId)
			if (!charge) continue // sem charge → sem plataforma para pollar ESTE tx

			// Poll FORA de qualquer tx (rail tx-discipline).
			const status = await tryCatchAsync(() => this.providerFactory.for(charge.platform).getChargebackStatus(gatewayTxId))
			if (!status.success) {
				if (status.error instanceof BaseError && status.error.name === 'PROVIDER_CAPABILITY_UNSUPPORTED') {
					// Decision 6: plataforma sem capability de poll de chargeback (hoje só PagBank) — pula
					// este tx em silêncio, sem alerta (chargeback nunca teve expectativa do engine para
					// ancorar um sinal de "não dá pra verificar", diferente do refund detector).
					this.loggingService.debug({
						content: {
							message: 'ChargebackReconcileJob platform does not support getChargebackStatus, skipping tx (webhook-only for this platform)',
							platform: charge.platform,
							gatewayTxId,
							invoiceId: watch.invoiceId,
						},
					})
					continue
				}
				// finding [5]: a REAL poll failure (network/parse) on ONE tx must never abort the WHOLE
				// invoice — warn + continue instead of throw. The signals from txs that DID respond still
				// feed their regime this same tick; only THIS tx is skipped, and it re-polls on the next
				// sweep (the job is detect-only — a false negative this tick is the correct failure
				// direction, never a blind throw that starves the healthy txs of the same invoice).
				this.loggingService.warn({
					content: {
						message: 'ChargebackReconcileJob failed to check chargeback drift for tx (skipping this tx this tick, re-swept next)',
						gatewayTxId,
						invoiceId: watch.invoiceId,
						error: status.error.message,
					},
				})
				continue
			}

			// `disputeRefs` presente (T5) ⇔ este tx foi resolvido por uma plataforma que enumera
			// disputes por identidade (Stripe). Acumula de TODOS os tx's da invoice — um dispute pode
			// pertencer a qualquer retry, não só o primeiro chargedback observado — por isso o loop
			// NUNCA para cedo mais (ao contrário do regime booleano de antes, que bastava uma
			// ocorrência): precisamos da lista completa antes do set-difference abaixo.
			if (status.data.disputeRefs !== undefined) {
				gatewayRefs.push(...status.data.disputeRefs)
				if (status.data.chargedBack && !identityChargedBack) identityChargedBack = charge
			} else if (status.data.chargedBack && !booleanChargedBack) {
				// finding [4]: THIS tx does not support identity — its boolean signal feeds the boolean
				// regime below independently of whatever any OTHER tx of this invoice reported.
				booleanChargedBack = charge
			}
		}

		// REGIME IDENTIDADE (T5): a plataforma enumera disputes por id — set-difference entre o que o
		// gateway reporta e o que o ledger já conhece MATA a limitação do regime booleano abaixo: um
		// ref é uma identidade PRÓPRIA, então um dispute NOVO sempre escala mesmo que a invoice já
		// tenha um Dispute WON + CN REVERSED de um ref DIFERENTE — não existe mais "sinal antigo
		// sticky" indistinguível de "dispute novo".
		if (gatewayRefs.length > 0) {
			// finding [6]: "known" is the UNION of the Dispute ledger's own refs AND the CHARGEBACK
			// credit notes' gatewayRefs (any status, including REVERSED) — not the Dispute side alone.
			// A dispute whose webhook was fully processed (its CN already exists) before the Dispute
			// PROCESS row existed — data predating T2/T3, or an `insertIfNew` that raced/missed — must
			// still read as "known" here, or it alerts FOREVER on a ref the ledger actually already
			// recorded. Rollout note: a LEGACY dispute recorded before this ref-convention existed (its
			// CN keyed by the OLD externalId-based gatewayRef, not the current dispute-identity ref) is
			// NOT covered by this union and still produces exactly ONE claim-guarded alert per such ref
			// — bounded (the claim latches it after the first alert), not a repeat storm.
			const knownFromDisputes = await this.disputeRepository.listRefsByInvoiceId(watch.invoiceId)
			const knownFromCreditNotes = await this.creditNoteRepository.listGatewayRefsByInvoiceIdAndReason(
				watch.invoiceId,
				CreditNoteReason.CHARGEBACK,
			)
			const known = new Set([...knownFromDisputes, ...knownFromCreditNotes])
			const unseen = gatewayRefs.filter(ref => !known.has(ref))

			for (const ref of unseen) {
				// Two-tick por REF (não por invoice) — cada dispute tem sua própria claim, então dois
				// disputes reais na mesma invoice alertam independentemente. SEM `pendingBucket`: refs
				// são únicos por dispute (nunca reaproveitados pelo gateway), então uma claim pending seca
				// de um ref só afeta aquele ref — nenhum risco de "drift novo e não-relacionado" colidir
				// com uma claim antiga expirável (ao contrário do regime booleano, cuja claim é por
				// invoice e por isso precisa do bucket mensal).
				await this.twoTickDriftAlert.observe({
					pendingKey: `chargeback-drift-pending:${ref}`,
					alertKey: `chargeback-drift:${ref}`,
					emit: () =>
						this.operatorAlert.emit({
							kind: 'chargeback-drift',
							key: `chargeback-drift:${ref}`,
							runbook:
								're-deliver the dispute webhook from the gateway dashboard (the real event carries the canonical id and books through the normal path).',
							context: {
								invoiceId: watch.invoiceId,
								ownerId: watch.ownerId,
								disputeRef: ref,
								regime: 'identity',
								...(identityChargedBack
									? { gatewayTxId: identityChargedBack.gatewayTxId, amountCents: identityChargedBack.amountCents }
									: {}),
							},
						}),
				})
			}
		}

		// REGIME BOOLEANO (PagarMe/Asaas/MP-por-enquanto): pelo menos UM tx desta invoice não devolveu
		// `disputeRefs` e sinalizou `chargedBack: true` — comportamento movido intacto do código
		// original (mesmo predicado, mesmo bucket mensal, mesma limitação conhecida), agora decidido
		// POR TX (finding [4]) em vez de globalmente pela invoice.
		if (booleanChargedBack) {
			// Predicado de drift (Decision 4): existe QUALQUER credit note CHARGEBACK para a invoice —
			// incluindo REVERSED (um dispute GANHO já viu o fato, não deve re-alertar).
			//
			// LIMITAÇÃO CONHECIDA (indecidível por construção, achado adversarial [1] — NÃO CONSERTAR em
			// código): `getChargebackStatus` é uma capability BOOLEANA — `chargedBack: true/false` — sem
			// identidade por-dispute. Combinado com o fato de alguns gateways reportarem esse sinal como
			// STICKY no payment-level (ex.: PagarMe/Asaas nunca voltam a `false` mesmo após o dispute ser
			// GANHO/revertido), um SEGUNDO dispute real sobre a MESMA invoice, aberto depois que o PRIMEIRO
			// já foi ganho e revertido (existe uma CN CHARGEBACK com status REVERSED), é INDISTINGUÍVEL do
			// estado pós-won: `ledgerSawIt` abaixo já retorna `true` (a CN REVERSED conta, propositalmente —
			// Decision 4, pra não re-alertar o dispute já resolvido), então o job fica em silêncio também
			// para o segundo dispute genuíno. Não há como diferenciar "sinal antigo ainda sticky" de "novo
			// dispute real" com só um booleano — resolver isso exige a plataforma enumerar disputes por
			// identidade (ver o regime identidade acima, hoje só Stripe).
			const ledgerSawIt = await this.creditNoteRepository.existsByInvoiceIdAndReason(watch.invoiceId, CreditNoteReason.CHARGEBACK)

			if (!ledgerSawIt) {
				// Two-tick drift-alert choreography — shared implementation with RefundReconcileJob.
				// Chargeback nunca tem freio de in-flight (não existe expectativa do engine), então TODA
				// invoice segue o caminho de dois ticks completo (sem skipPendingGate): o primeiro tick que
				// observa o gateway sinalizando chargedback-sem-CN toma um claim "pending" e NÃO alerta; só
				// um tick SUBSEQUENTE que ainda observe o mesmo escala pro alerta real. Um webhook de dispute
				// em trânsito que booka o CN entre os dois ticks dissolve o pending sem nunca alertar (a
				// checagem `ledgerSawIt` acima já teria retornado true no segundo tick).
				//
				// `pendingBucket` (mensal, derivado do `now` do tick) dá ao claim pending uma expiração
				// natural — sem ele, um drift que se resolve gateway-side sem NUNCA gerar uma CN (ex.: o
				// dispute é abandonado pelo gateway sem webhook) deixaria o claim pending seco pra sempre;
				// anos depois, um drift novo e não-relacionado na mesma invoice pularia o gate (claim já
				// tomado) e escalaria direto num único tick — falso alarme. RefundReconcileJob NÃO passa
				// bucket (totais de refund são monotônicos — drift só resolve via CN, nunca "some sozinho").
				await this.twoTickDriftAlert.observe({
					pendingKey: `chargeback-drift-pending:${watch.invoiceId}`,
					alertKey: `chargeback-drift:${watch.invoiceId}`,
					pendingBucket: this.monthlyBucket(now),
					emit: () =>
						// The amount quoted is OUR OWN charge row's amountCents (Decision 1) — getChargebackStatus
						// is a pure boolean, never a new money parse off the gateway.
						this.operatorAlert.emit({
							kind: 'chargeback-drift',
							key: `chargeback-drift:${watch.invoiceId}`,
							runbook:
								're-deliver the dispute webhook from the gateway dashboard (the real event carries the canonical id and books through the normal path).',
							context: {
								invoiceId: watch.invoiceId,
								ownerId: watch.ownerId,
								regime: 'boolean',
								gatewayTxId: booleanChargedBack.gatewayTxId,
								amountCents: booleanChargedBack.amountCents,
							},
						}),
				})
			}
		}
	}

	// Monthly bucket (YYYY-MM, UTC) suffixing the pending claim key — see the pendingBucket param doc
	// on TwoTickDriftAlertParams and the comment at the call site above for why this job (unlike
	// RefundReconcileJob) needs one.
	private monthlyBucket(now: Date): string {
		const year = now.getUTCFullYear()
		const month = String(now.getUTCMonth() + 1).padStart(2, '0')
		return `${year}-${month}`
	}
}
