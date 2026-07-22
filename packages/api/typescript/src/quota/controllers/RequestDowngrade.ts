import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { RequestDowngrade, RequestDowngradeOutputSchema } from '@quota/usecases/RequestDowngrade'
import { PlanName, QuotaKey } from '@template/contracts-typescript/wire/enums'

export const RequestDowngradeControllerInput = z
	.object({
		body: z.object({
			planName: z.enum(PlanName),
			keep: z.partialRecord(z.enum(QuotaKey), z.array(z.string())).default({}),
		}),
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([
		{
			body: { planName: PlanName.STARTER, keep: {} },
			ctx: { session: { ownerId: 'owner-uuid' } },
		},
	])

export const RequestDowngradeControllerOutput = RequestDowngradeOutputSchema.example([{ effectiveAtPeriodEnd: true }])

@injectable()
export class RequestDowngradeController extends Controller<
	typeof RequestDowngradeControllerInput,
	typeof RequestDowngradeControllerOutput
> {
	// The quota context router prefixes '/quota', so this resolves to POST /quota/subscription/downgrade.
	readonly path = '/quota/subscription/downgrade'
	readonly method = 'post'
	readonly description =
		'Request a downgrade: validates the kept resources against the target plan, schedules the plan change, and stores the selection — atomically.'
	readonly inputSchema = RequestDowngradeControllerInput
	readonly outputSchema = RequestDowngradeControllerOutput

	// Owner-scoped subscription mutation — same guard chain as the billing ChangePlan/CancelSubscription
	// controllers (the quota context ships no default middlewares — D-5).
	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private requestDowngrade: RequestDowngrade) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.requestDowngrade.execute({
			ownerId: request.ctx.session.ownerId,
			targetPlan: request.body.planName,
			keep: request.body.keep,
		})

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
