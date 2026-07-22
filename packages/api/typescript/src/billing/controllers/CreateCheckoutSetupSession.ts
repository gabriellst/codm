import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { CreateCheckoutSetupSession, CreateCheckoutSetupSessionOutputSchema } from '../usecases/CreateCheckoutSetupSession'

export const CreateCheckoutSetupSessionControllerInput = z
	.object({
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([{ ctx: { session: { ownerId: 'owner-uuid' } } }])

export const CreateCheckoutSetupSessionControllerOutput = CreateCheckoutSetupSessionOutputSchema.example([
	{ url: 'https://checkout.stripe.com/c/pay/cs_123', sessionRef: 'cs_123' },
])

@injectable()
export class CreateCheckoutSetupSessionController extends Controller<
	typeof CreateCheckoutSetupSessionControllerInput,
	typeof CreateCheckoutSetupSessionControllerOutput
> {
	readonly path = '/billing/checkout-setup-session'
	readonly method = 'post' as const
	readonly description = 'Mint a hosted-checkout setup session to add a card to the wallet'
	readonly inputSchema = CreateCheckoutSetupSessionControllerInput
	readonly outputSchema = CreateCheckoutSetupSessionControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private createCheckoutSetupSession: CreateCheckoutSetupSession) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.createCheckoutSetupSession.execute({ ownerId: request.ctx.session.ownerId })

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
