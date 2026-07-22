import type { BillingWebhookSource } from '@billing/enums'
import type { ExternalBillingEvent } from '@billing/services/BillingWebhookMapper'

/** Fatura aberta envelhecida da plataforma — o alvo das fontes de SONDA dirigida. Derivada do
 *  ledger pelo job (nunca da coluna de status). */
export interface OpenInvoiceCandidate {
	ownerId: string
	engineInvoiceId: string
	/** O tx conhecido quando existe uma charge não-terminal associada — ausente, a sonda ainda tenta por reference/engineInvoiceId. */
	gatewayTxId?: string
}

export interface GatewayCollectInput {
	window: { since: Date; until: Date }
	openInvoices: OpenInvoiceCandidate[]
}

/** `listed` = quantos objetos/eventos o vendor devolveu na consulta (observabilidade AC-6);
 *  `events` = os que mapearam para fatos que reconhecemos (recognized = events.length). */
export interface GatewayCollectResult {
	listed: number
	events: ExternalBillingEvent[]
}

/**
 * Uma fonte de reconciliação por plataforma: pergunta ao gateway o que aconteceu (janela) ou o que
 * aconteceu com estas faturas (sonda) e devolve os MESMOS eventos External* que o webhook produziria
 * — construídos reusando o mapper da própria plataforma sobre um Request sintético vendor-shaped
 * (precedente SandboxPaymentProvider). Default: `{listed: 0, events: []}` — plataforma sem
 * capability/configuração fica coberta só pela camada 1 + alerta, NUNCA um throw.
 */
export abstract class GatewayEventSource {
	abstract readonly source: BillingWebhookSource

	/** Whether `WindowReconcileJob` must fetch `openInvoices` (via
	 *  `InvoiceRepository.listOpenForReconciliation`) before calling `collectMissedEvents` for this
	 *  source. Default `false` — WINDOW sources (Pagar.me, Stripe, Asaas, MercadoPago) answer "what
	 *  happened in the last window" and ignore `openInvoices` entirely, so the job skips the
	 *  candidates query for them. PROBE sources (PagBank) answer "what happened to THESE invoices"
	 *  and override this to `true` — without it they'd receive an empty `openInvoices` array and
	 *  have nothing to probe. */
	readonly requiresOpenInvoices: boolean = false

	async collectMissedEvents(_input: GatewayCollectInput): Promise<GatewayCollectResult> {
		return { listed: 0, events: [] }
	}

	/** Helper compartilhado: envelopa um payload vendor-shaped num Request sintético para reusar o
	 *  mapper real da plataforma (o verifier NÃO roda — a chamada foi nossa, outbound autenticada). */
	protected syntheticRequest(body: unknown): Request {
		return new Request('http://internal/billing/reconcile', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		})
	}
}
