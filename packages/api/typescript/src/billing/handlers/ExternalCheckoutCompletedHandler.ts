import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { IdempotencyGuard, CommandQueue } from '@template/core-typescript'
import { IdempotencyScope } from '@shared/enums'
import { tryCatchAsync } from '@template/core-typescript'
import { ExternalCheckoutCompletedEvent } from '@billing/events/ExternalCheckoutCompletedEvent'
import { ExternalCardChargeSucceededEvent } from '@billing/events/ExternalCardChargeSucceededEvent'
import { PaymentMethodVaultedEvent } from '@billing/events/PaymentMethodVaultedEvent'
import { PaymentMethod } from '@billing/entities'
import { PaymentMethodRepository, CheckoutSessionRepository } from '@billing/repositories'

import { RECONCILE_CHECKOUT_COMMAND, checkoutReconcileJobId } from '@billing/services'
import { LoggingService } from '@template/core-typescript'
import { CheckoutIntent, CheckoutSessionStatus } from '@template/contracts-typescript/wire/enums'

/**
 * O handler do fato "checkout concluído": vaulta o instrumento (origem + originGatewayTxId) e,
 * quando o checkout PAGOU uma fatura (intent=payment), emite ExternalCardChargeSucceededEvent —
 * o settlement EXISTENTE liquida e ativa (seu gate "sem cartão off-session → no-op" é exatamente
 * o que resolve a corrida payment_intent.succeeded × checkout.session.completed: o settlement do
 * PI cru no-opa sem cartão; o emitido AQUI roda após o vault; o claim INVOICE_SETTLED dedupa os dois).
 * Vault idempotente por sessionRef (CHECKOUT_VAULT) — entrega duplicada é no-op (AC-5).
 *
 * Também fecha o objeto local `CheckoutSession` (T1/T2 accelerator) quando existe: completa a sessão
 * e desarma o alarme de reconcile agendado no mint (T2). Absorvente — uma sessão já COMPLETED (o
 * reconciler sintético, T4, já a completou na própria tx do save do evento sintético) ou EXPIRED
 * apenas pula a transição, NUNCA propaga INVALID_CHECKOUT_SESSION_TRANSITION: os dois orderings
 * (webhook real × sintético) já são resolvidos pelo claim CHECKOUT_VAULT acima, keyed no mesmo
 * sessionRef. Eventos sem sessão local (webhooks de antes da feature) seguem no-op nessa parte —
 * vault/settle abaixo continuam intocados.
 *
 * Fallback por invoice (FIX-F, descope do `PagBankPaymentProvider.getCheckoutSessionStatus`): o
 * webhook do PagBank carrega o id do PEDIDO (`ORDE_…`), nunca o id do CHECKOUT (`CHEC_…`) sob o
 * qual `CheckoutSessionRecorder` gravou a sessão no mint — o vendor não documenta nenhuma
 * referência de volta entre os dois, então `findBySessionRef(sessionRef)` acima NUNCA casa para
 * PagBank. Quando ausente, tenta correlacionar pela `engineInvoiceId` do payload contra a
 * `CheckoutSession` PENDING da MESMA invoice — só completa/desarma quando a sessão encontrada é da
 * MESMA `platform` do evento (nunca cruza gateway). Vault/settlement seguem o payload do evento em
 * ambos os casos — o fallback só decide QUAL sessão local fechar.
 */
@injectable()
export class ExternalCheckoutCompletedHandler extends EventHandler<typeof ExternalCheckoutCompletedEvent> {
	readonly event = ExternalCheckoutCompletedEvent

	constructor(
		private idempotencyGuard: IdempotencyGuard,
		private paymentMethods: PaymentMethodRepository,
		private checkoutSessions: CheckoutSessionRepository,
		private commandQueue: CommandQueue,
		private loggingService: LoggingService,
	) {
		super()
	}

	/**
	 * Disarm the session's pending-reconcile alarm on its terminal transition — EXACT mold of
	 * `ChargeSettler.disarmReconcile`. Under the transactional driver (Postgres) the cancel joins the
	 * SAME tx as the COMPLETED flip; under a broker driver (BullMQ) it's Redis I/O that must NEVER
	 * fail/stall the money transaction it runs inside, so it's fired best-effort and swallowed on
	 * error. Either way it's an optimization, not a correctness guard — a fired alarm safely no-ops
	 * on a non-PENDING session (T4's reconciler guard).
	 */
	private async disarmReconcile(sessionRef: string, t: Transaction): Promise<void> {
		if (this.commandQueue.transactional) {
			await this.commandQueue.cancelCommand(RECONCILE_CHECKOUT_COMMAND, checkoutReconcileJobId(sessionRef), t)
			return
		}
		const result = await tryCatchAsync(() =>
			this.commandQueue.cancelCommand(RECONCILE_CHECKOUT_COMMAND, checkoutReconcileJobId(sessionRef)),
		)
		if (!result.success) {
			this.loggingService.warn({
				content: {
					message: 'ExternalCheckoutCompletedHandler: best-effort reconcile-alarm cancel failed (broker driver)',
					sessionRef,
					error: result.error.message,
				},
			})
		}
	}

	async handle(event: this['input']): Promise<void> {
		const { sessionRef, intent, platform, instrument, engineInvoiceId, amountCents, gatewayTxId } = event.payload
		const ownerId = event.payload.ownerId

		await this.withTransaction(undefined, async (tx: Transaction) => {
			// Um vault por sessão de checkout — redelivery/replay não duplica o método.
			if (!(await this.idempotencyGuard.claim(IdempotencyScope.CHECKOUT_VAULT, sessionRef, tx))) return

			// Local CheckoutSession (T1/T2) — absent for webhooks minted before the feature, a
			// legitimate no-op. Only transition from PENDING: a session already COMPLETED (the
			// reconciler's synthetic event, T4, completed it directly) or EXPIRED must not throw.
			let session = await this.checkoutSessions.findBySessionRef(sessionRef, tx)

			// PagBank completion fallback by invoice (FIX-F, descope of the removed
			// getCheckoutSessionStatus poll — see PagBankPaymentProvider's class doc): PagBank's paid
			// webhook carries the ORDER id (`ORDE_…`), never the CHECKOUT id (`CHEC_…`)
			// CheckoutSessionRecorder recorded the session under at mint — the vendor gives no
			// documented back-reference between the two, so `findBySessionRef(sessionRef)` above can
			// NEVER match a PagBank session. The only remaining correlation is the engine invoice id,
			// which both the mint (`CheckoutSession.engineInvoiceId`) and this settlement fact
			// (`payload.engineInvoiceId`) carry. Guarded to the SAME platform as the event so a
			// cross-gateway invoice collision can never complete the wrong session.
			if (!session && engineInvoiceId) {
				const pendingByInvoice = await this.checkoutSessions.findPendingByInvoiceId(engineInvoiceId, tx)
				if (pendingByInvoice && pendingByInvoice.platform === platform) session = pendingByInvoice
			}

			if (session && session.status === CheckoutSessionStatus.PENDING) {
				session.complete()
				await this.checkoutSessions.save(session, tx)
				// Disarm by the SESSION's own sessionRef (its alarm jobId) — never the event's
				// `sessionRef`, which for the fallback path above is a DIFFERENT id (`ORDE_…`) than the
				// one the alarm was armed under (`CHEC_…`).
				await this.disarmReconcile(session.sessionRef, tx)
			}

			// Vault OPCIONAL (capability cardVaulting): CHECKOUT-ONLY providers pagam pela página
			// hospedada sem devolver credencial — liquida-se abaixo sem vault; renovações degradam
			// para o fluxo manual. Com instrument: mesmo shape do vault site existente (novo cartão
			// vira o default). Mandato: consentimento aceito no subscribe/checkout (webhook, sem HTTP).
			if (instrument) {
				await this.paymentMethods.clearDefault(ownerId, tx)
				const pm = PaymentMethod.create({
					ownerId,
					platform,
					instrument,
					mandate: { acceptedAt: new Date(), ip: null, userAgent: null, consentVersion: null },
				})
				await this.paymentMethods.save(pm, tx)
				await this.domainEventRepository.save(
					new PaymentMethodVaultedEvent({
						entityId: pm.id.value,
						ownerId,
						payload: { ownerId, pmRef: instrument.pmRef },
					}),
					tx,
				)
			}

			// intent=payment: o checkout JÁ cobrou (CIT com mandato). Emite o fato de settlement para
			// o caminho existente liquidar a fatura e ativar a assinatura — nunca liquide aqui.
			// `!== undefined` (não truthy): valor AUSENTE = mapper não resolveu → deixa o
			// payment_intent.succeeded cru liquidar; zero LEGÍTIMO ainda liquida (o deriver é
			// amount-independent — pago = ∃ charge SUCCEEDED).
			if (intent === CheckoutIntent.PAYMENT && engineInvoiceId && gatewayTxId && amountCents !== undefined) {
				await this.domainEventRepository.save(
					new ExternalCardChargeSucceededEvent({
						entityId: engineInvoiceId,
						ownerId,
						payload: {
							externalId: `${sessionRef}:settle`, // dedup distinto do evt_ do PI cru
							ownerId,
							engineInvoiceId,
							amountCents,
							gatewayTxId,
							// CHECKOUT-ONLY: sem instrument/carteira, o settle ainda precisa saber qual
							// gateway capturou — para o charge fact e para um eventual dup-refund.
							platform,
						},
					}),
					tx,
				)
			}
		})
	}
}
