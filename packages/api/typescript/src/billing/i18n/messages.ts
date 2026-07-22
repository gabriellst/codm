import { Language } from '@template/contracts-typescript/wire/enums'
import { defineMessages } from '@shared/i18n'
import { ProductConfig } from '@shared/config'
import { DeclineReason, PlanName } from '@template/contracts-typescript/wire/enums'

/**
 * Billing's server-rendered copy: hosted-checkout line items, stored invoice-line description
 * fallbacks, and the dunning email. The PT catalog is the reference shape — adding a key here
 * without its EN sibling is a compile error. Everything the app renders itself (statuses,
 * invoice rows) stays code/structure translated by the frontend locales, NOT here.
 *
 * BRAND-NEUTRAL: the one product-name string is read from `ProductConfig.env.PRODUCT_NAME`
 * (neutral default) — the port hard-codes no brand.
 */
const brand = (): string => ProductConfig.env.PRODUCT_NAME

const PT_MESSAGES = {
	/** What a plan subscription is called — hosted-checkout title AND the SUBSCRIPTION invoice line (same wording, one key). */
	subscriptionLineTitle: (p: { planName: PlanName }) => `Plano ${p.planName}`,
	/** Generic invoice title — checkout line fallback and the no-plan invoice description. */
	invoiceFallbackTitle: (p: { invoiceId: string }) => `Fatura ${p.invoiceId}`,
	/** PRORATION invoice-line description — the mid-cycle upgrade charge. */
	upgradeLineTitle: (p: { planName: PlanName }) => `Upgrade para o plano ${p.planName}`,
	/** Hosted-checkout line-item description under the title (what the purchase IS). */
	checkoutSubscriptionDescription: () => `Assinatura mensal ${brand()} — renovação automática, cancele quando quiser.`,
	checkoutInvoiceDescription: () => `Pagamento de fatura ${brand()}.`,
	/** OVERAGE invoice-line description (stored fallback; the app translates from kind/meter). */
	overageLineDescription: () => 'Excedente de uso',
	dunningSubject: () => `${brand()} - Não conseguimos processar seu pagamento`,
	dunningGreeting: () => 'Olá!',
	dunningIntro: (p: { invoiceId: string }) => `Não conseguimos processar o pagamento da sua fatura (${p.invoiceId}).`,
	/** Shown INSTEAD of the generic cause paragraph when the gateway classified the decline. */
	dunningReasonLine: (p: { code: DeclineReason }) =>
		({
			[DeclineReason.INSUFFICIENT_FUNDS]: 'A operadora do cartão apontou saldo ou limite insuficiente.',
			[DeclineReason.CARD_EXPIRED]: 'A operadora apontou que o cartão está vencido.',
			[DeclineReason.AUTHENTICATION_REQUIRED]: 'A operadora exigiu uma autenticação adicional que não é possível em cobranças automáticas.',
			[DeclineReason.PROCESSING_ERROR]: 'Houve um erro de processamento na operadora — nenhum valor foi cobrado.',
			[DeclineReason.CARD_DECLINED]: 'A operadora do cartão recusou a cobrança.',
		})[p.code],
	dunningCauseGeneric: () => 'Isso pode acontecer por diversos motivos, como cartão vencido, limite insuficiente ou dados desatualizados.',
	dunningBody: () => [
		'Para evitar a interrupção do seu acesso, acesse sua conta e atualize ou tente novamente seu método de pagamento.',
		'Se o problema persistir, entre em contato com nosso suporte.',
	],
	/** Shown when a scheduled retry exists (ISO date). */
	dunningNextRetryLine: (p: { nextRetryAt: string }) => `Tentaremos novamente em ${new Date(p.nextRetryAt).toLocaleDateString('pt-BR')}.`,
	/** Shown instead of dunningNextRetryLine when there's no more scheduled retry (hard decline, or cap reached). */
	dunningNoMoreRetriesLine: () => 'Não faremos mais tentativas automáticas para esta cobrança.',
	dunningAttemptSubject: () => `${brand()} - Nova tentativa de cobrança falhou`,
	dunningAttemptIntro: (p: { invoiceId: string; attemptNo: number }) =>
		`A tentativa ${p.attemptNo} de cobrança da sua fatura (${p.invoiceId}) falhou.`,
	dunningSucceededSubject: () => `${brand()} - Pagamento confirmado`,
	dunningSucceededIntro: (p: { invoiceId: string }) => `Recebemos o pagamento da sua fatura (${p.invoiceId}). Seu acesso está normalizado.`,
	dunningSucceededBody: () => ['Obrigado por regularizar seu pagamento.'],
	dunningFailedSubject: () => `${brand()} - Assinatura cancelada por falta de pagamento`,
	dunningFailedIntro: (p: { invoiceId: string }) =>
		`Não conseguimos processar o pagamento da sua fatura (${p.invoiceId}) dentro do prazo, e sua assinatura foi cancelada.`,
	dunningFailedBody: () => ['Para reativar seu acesso, atualize seu método de pagamento e assine novamente.'],
	signoff: () => 'Atenciosamente,',
	team: () => `Equipe ${brand()}`,
}

export const BILLING_MESSAGES = defineMessages<typeof PT_MESSAGES>({
	[Language.PT_BR]: PT_MESSAGES,
	[Language.EN_US]: {
		subscriptionLineTitle: p => `${p.planName} plan`,
		invoiceFallbackTitle: p => `Invoice ${p.invoiceId}`,
		upgradeLineTitle: p => `Upgrade to the ${p.planName} plan`,
		checkoutSubscriptionDescription: () => `${brand()} monthly subscription — renews automatically, cancel anytime.`,
		checkoutInvoiceDescription: () => `${brand()} invoice payment.`,
		overageLineDescription: () => 'Usage overage',
		dunningSubject: () => `${brand()} - We couldn't process your payment`,
		dunningGreeting: () => 'Hi!',
		dunningIntro: p => `We couldn't process the payment for your invoice (${p.invoiceId}).`,
		dunningReasonLine: p =>
			({
				[DeclineReason.INSUFFICIENT_FUNDS]: 'Your card issuer reported insufficient funds or limit.',
				[DeclineReason.CARD_EXPIRED]: 'Your card issuer reported that the card is expired.',
				[DeclineReason.AUTHENTICATION_REQUIRED]:
					'Your card issuer required additional authentication, which automatic charges cannot perform.',
				[DeclineReason.PROCESSING_ERROR]: 'There was a processing error at the card network — nothing was charged.',
				[DeclineReason.CARD_DECLINED]: 'Your card issuer declined the charge.',
			})[p.code],
		dunningCauseGeneric: () => 'This can happen for several reasons, such as an expired card, an insufficient limit, or outdated details.',
		dunningBody: () => [
			'To avoid losing access, sign in to your account and update or retry your payment method.',
			'If the problem persists, please contact our support team.',
		],
		dunningNextRetryLine: p => `We'll try again on ${new Date(p.nextRetryAt).toLocaleDateString('en-US')}.`,
		dunningNoMoreRetriesLine: () => "We won't make any more automatic attempts for this charge.",
		dunningAttemptSubject: () => `${brand()} - A new charge attempt failed`,
		dunningAttemptIntro: p => `Attempt ${p.attemptNo} to charge your invoice (${p.invoiceId}) failed.`,
		dunningSucceededSubject: () => `${brand()} - Payment confirmed`,
		dunningSucceededIntro: p => `We received the payment for your invoice (${p.invoiceId}). Your access is back to normal.`,
		dunningSucceededBody: () => ['Thank you for settling your payment.'],
		dunningFailedSubject: () => `${brand()} - Subscription canceled due to non-payment`,
		dunningFailedIntro: p =>
			`We couldn't process the payment for your invoice (${p.invoiceId}) within the window, so your subscription was canceled.`,
		dunningFailedBody: () => ['To regain access, update your payment method and subscribe again.'],
		signoff: () => 'Best regards,',
		team: () => `${brand()} Team`,
	},
})
