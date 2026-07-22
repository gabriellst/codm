import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { PreviewPlanChange, PreviewPlanChangeOutputSchema } from '@billing/usecases/PreviewPlanChange'
import { PlanName } from '@template/contracts-typescript/wire/enums'

export const PreviewPlanChangeControllerInput = z
	.object({
		query: z.object({
			targetPlan: z.enum(PlanName),
		}),
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([
		{
			query: { targetPlan: PlanName.PRO },
			ctx: { session: { ownerId: 'owner-uuid' } },
		},
	])

export const PreviewPlanChangeControllerOutput = PreviewPlanChangeOutputSchema.example([
	{ amountDueNowCents: 12345, nextCycleCents: 29900 },
])

@injectable()
export class PreviewPlanChangeController extends Controller<
	typeof PreviewPlanChangeControllerInput,
	typeof PreviewPlanChangeControllerOutput
> {
	readonly path = '/plan-change/preview'
	readonly method = 'get'
	readonly description = "Preview the billing impact of switching the authenticated owner's subscription to a target plan"
	readonly inputSchema = PreviewPlanChangeControllerInput
	readonly outputSchema = PreviewPlanChangeControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private previewPlanChange: PreviewPlanChange) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.previewPlanChange.execute({
			ownerId: request.ctx.session.ownerId,
			targetPlan: request.query.targetPlan,
		})

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
