import crypto from 'node:crypto'
import { injectable } from 'tsyringe-neo'
import { Handler, z, Config } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { BillingProfileRepository } from '../repositories'
import { PaymentProviderFactory, CheckoutSessionRecorder } from '../services'
import { CheckoutIntent } from '@template/contracts-typescript/wire/enums'

export const CreateCheckoutSetupSessionInputSchema = z.object({
	ownerId: z.string().min(1),
})

export const CreateCheckoutSetupSessionOutputSchema = z.object({
	url: z.string(),
	sessionRef: z.string(),
	expiresAt: z.date().optional(),
})

/**
 * O "adicionar cartão" avulso da conta, checkout-first: minta uma sessão hospedada intent=setup
 * no provider que decide() rotear (relação de pagamento NOVA — nunca pinada). O vault acontece
 * via webhook (checkout.session.completed), nunca via token do frontend. URL on-demand, nunca
 * persistida.
 */
@injectable()
export class CreateCheckoutSetupSession extends Handler<
	typeof CreateCheckoutSetupSessionInputSchema,
	typeof CreateCheckoutSetupSessionOutputSchema
> {
	readonly name = 'create_checkout_setup_session' as const
	readonly inputSchema = CreateCheckoutSetupSessionInputSchema
	readonly outputSchema = CreateCheckoutSetupSessionOutputSchema

	constructor(
		private providerFactory: PaymentProviderFactory,
		private billingProfiles: BillingProfileRepository,
		private checkoutSessionRecorder: CheckoutSessionRecorder,
	) {
		super()
	}

	protected async handle(input: this['input'], _tx?: Transaction): Promise<this['output']> {
		const provider = await this.providerFactory.decide({ ownerId: input.ownerId })
		const owner = await this.billingProfiles.findByOwnerId(input.ownerId)
		const session = await provider.createCheckoutSession({
			ownerId: input.ownerId,
			owner: owner ?? undefined,
			intent: CheckoutIntent.SETUP,
			successUrl: `${Config.env.APP_URL}/account?checkout=success`,
			cancelUrl: `${Config.env.APP_URL}/account?checkout=canceled`,
			idemKey: `checkout-setup:${input.ownerId}:${crypto.randomUUID()}`,
		})

		// Post-gateway, own tx: record the minted session as a local CheckoutSession + arm its
		// reconcile alarm so a lost completion webhook still resolves in minutes. SETUP intent —
		// no engineInvoiceId.
		await this.checkoutSessionRecorder.record({
			sessionRef: session.sessionRef,
			ownerId: input.ownerId,
			platform: provider.platform,
			intent: CheckoutIntent.SETUP,
			expiresAt: session.expiresAt,
		})

		return { url: session.url, sessionRef: session.sessionRef, expiresAt: session.expiresAt }
	}
}
