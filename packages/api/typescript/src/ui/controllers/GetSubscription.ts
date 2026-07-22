import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'

import { GetSubscription, GetSubscriptionOutputSchema } from '../usecases/billing/GetSubscription'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

export const GetSubscriptionControllerInput = z
	.object({
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([{ ctx: { session: { ownerId: 'owner-uuid' } } }])

export const GetSubscriptionControllerOutput = GetSubscriptionOutputSchema.example([
	{
		planName: PlanName.PRO,
		status: SubscriptionStatus.ACTIVE,
		currentPeriodEnd: new Date('2026-07-22T00:00:00Z'),
		cancelAtPeriodEnd: false,
		scheduledPlanName: null,
	},
])

@injectable()
export class GetSubscriptionController extends Controller<typeof GetSubscriptionControllerInput, typeof GetSubscriptionControllerOutput> {
	readonly path = '/ui/billing/subscription'
	readonly method = 'get' as const
	readonly description = 'Get the current access subscription for the authenticated owner'
	readonly inputSchema = GetSubscriptionControllerInput
	readonly outputSchema = GetSubscriptionControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private getSubscription: GetSubscription) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.getSubscription.execute({ ownerId: request.ctx.session.ownerId })

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
