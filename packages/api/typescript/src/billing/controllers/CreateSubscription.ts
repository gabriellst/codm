import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { CreateSubscription } from '@billing/usecases'
import { PlanName } from '@template/contracts-typescript/wire/enums'

export const CreateSubscriptionControllerInput = z
	.object({
		body: z.object({
			planName: z.enum(PlanName),
			consentAccepted: z.boolean(),
		}),
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([
		{
			body: { planName: PlanName.PRO, consentAccepted: true },
			ctx: { session: { ownerId: 'owner-uuid' } },
		},
	])

export const CreateSubscriptionControllerOutput = z
	.object({
		subscriptionId: z.string(),
		// The FIRST invoice this subscribe minted (absent on trials — the clock issues it at trial
		// end). The app tracks exactly this invoice to PAID during activation — no list-diffing.
		engineInvoiceId: z.string().optional(),
		checkoutUrl: z.string().optional(),
	})
	.example([
		{ subscriptionId: 'sub_owner-uuid', engineInvoiceId: 'native:owner-uuid:1783600000000' },
		{
			subscriptionId: 'sub_owner-uuid',
			engineInvoiceId: 'native:owner-uuid:1783600000000',
			checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_123',
		},
	])

@injectable()
export class CreateSubscriptionController extends Controller<
	typeof CreateSubscriptionControllerInput,
	typeof CreateSubscriptionControllerOutput
> {
	readonly path = '/subscriptions'
	readonly method = 'post'
	readonly description = 'Create a subscription for the owner'
	readonly inputSchema = CreateSubscriptionControllerInput
	readonly outputSchema = CreateSubscriptionControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private createSubscription: CreateSubscription) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.createSubscription.execute({
			ownerId: request.ctx.session.ownerId,
			planName: request.body.planName,
			consentAccepted: request.body.consentAccepted,
		})

		return {
			status: HttpStatusCode.CREATED,
			data,
		}
	}
}
