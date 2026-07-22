import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { BaseError } from '@template/core-typescript'
import { ProductConfig } from '@shared/config'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'

import { ExternalCheckoutCompletedEvent } from '@billing/events/ExternalCheckoutCompletedEvent'
import { CaptureOrigin } from '@billing/enums/CaptureOrigin'
import type { InterfaceErrors } from '@billing/errors'
import { BillingPlatform, CheckoutIntent, PaymentMethodType } from '@template/contracts-typescript/wire/enums'

export const SandboxCheckoutInputSchema = z
	.object({
		query: z.object({
			sessionRef: z.string().min(1),
			ownerId: z.string().min(1),
			intent: z.enum(CheckoutIntent),
			successUrl: z.string().min(1),
			engineInvoiceId: z.string().min(1).optional(),
			amountCents: z.coerce.number().int().nonnegative().optional(),
		}),
	})
	.example([
		{
			query: {
				sessionRef: 'cs_sandbox_1',
				ownerId: 'owner-uuid',
				intent: CheckoutIntent.PAYMENT,
				successUrl: 'http://localhost:5173/account?checkout=success',
				engineInvoiceId: 'native:owner:1',
				amountCents: 29900,
			},
		},
	])

export const SandboxCheckoutOutputSchema = z.object({ redirected: z.boolean() }).example([{ redirected: true }])

/**
 * A "página hospedada" do sandbox (dev-only, BILLING_SANDBOX=true): navegar até aqui CONFIRMA o
 * checkout — salva o mesmo ExternalCheckoutCompletedEvent que o StripeWebhookMapper produziria
 * (fake money, real choreography: vault + settlement + ativação rodam pelo handler REAL) e 302 de
 * volta ao successUrl. Auto-confirmação instantânea: o "cliente pagou" no clique.
 */
@injectable()
export class SandboxCheckoutController extends Controller<typeof SandboxCheckoutInputSchema, typeof SandboxCheckoutOutputSchema> {
	readonly path = '/sandbox/checkout'
	readonly method = 'get'
	readonly description = 'Sandbox-only fake hosted checkout: confirms the session and redirects back.'
	readonly inputSchema = SandboxCheckoutInputSchema
	readonly outputSchema = SandboxCheckoutOutputSchema

	override skipMiddlewares = [AuthAccountMiddleware]

	async handle(request: this['input']): Promise<this['output']> {
		// assertRequiredSecrets já rejeita BILLING_SANDBOX em produção; este guard é o cinto extra —
		// fora do sandbox o endpoint não existe funcionalmente.
		if (!ProductConfig.env.BILLING_SANDBOX) {
			throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', 'Sandbox checkout is only available with BILLING_SANDBOX=true')
		}

		const { sessionRef, ownerId, intent, successUrl, engineInvoiceId, amountCents } = request.query
		const gatewayTxId = `pi_sandbox_${sessionRef}`

		await this.withTransaction(undefined, async tx => {
			await this.domainEventRepository.save(
				new ExternalCheckoutCompletedEvent({
					entityId: sessionRef,
					ownerId,
					payload: {
						externalId: `evt_sandbox_${sessionRef}`,
						ownerId,
						sessionRef,
						intent,
						platform: BillingPlatform.PAGARME, // o sandbox binda no lugar do PagarMe (registry)
						instrument: {
							type: PaymentMethodType.CARD,
							pmRef: `pm_sandbox_4242`,
							supportsOffSession: true,
							captureOrigin: intent === CheckoutIntent.PAYMENT ? CaptureOrigin.CHECKOUT_PAYMENT : CaptureOrigin.CHECKOUT_SETUP,
							...(intent === CheckoutIntent.PAYMENT ? { originGatewayTxId: gatewayTxId } : {}),
							brand: 'visa',
							last4: '4242',
							expMonth: 12,
							expYear: 2030,
						},
						...(intent === CheckoutIntent.PAYMENT && engineInvoiceId
							? { engineInvoiceId, amountCents: amountCents ?? 0, gatewayTxId }
							: {}),
					},
				}),
				tx,
			)
		})

		return {
			status: HttpStatusCode.MOVED_TEMPORARILY, // 302 — HttpStatusCode has no `FOUND` alias; MOVED_TEMPORARILY is the same 302
			headers: { Location: successUrl },
			data: { redirected: true },
		}
	}
}
