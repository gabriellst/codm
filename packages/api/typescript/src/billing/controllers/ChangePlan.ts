import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { ChangePlan, ChangePlanOutputSchema } from '@billing/usecases/ChangePlan'
import { PlanName, SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

export const ChangePlanControllerInput = z
	.object({
		body: z.object({
			planName: z.enum(PlanName),
		}),
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([
		{
			body: { planName: PlanName.PRO },
			ctx: { session: { ownerId: 'owner-uuid' } },
		},
	])

export const ChangePlanControllerOutput = ChangePlanOutputSchema.example([
	{ planName: PlanName.PRO, status: SubscriptionStatus.ACTIVE, effectiveAtPeriodEnd: false },
])

@injectable()
export class ChangePlanController extends Controller<typeof ChangePlanControllerInput, typeof ChangePlanControllerOutput> {
	readonly path = '/subscriptions'
	readonly method = 'patch'
	readonly description = 'Change the plan of the authenticated owner (downgrade to FREE cancels at period end)'
	readonly inputSchema = ChangePlanControllerInput
	readonly outputSchema = ChangePlanControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private changePlan: ChangePlan) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.changePlan.execute({
			ownerId: request.ctx.session.ownerId,
			planName: request.body.planName,
		})

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
