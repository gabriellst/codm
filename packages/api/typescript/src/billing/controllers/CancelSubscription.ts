import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { CancelSubscription, CancelSubscriptionOutputSchema } from '@billing/usecases/CancelSubscription'
import { SubscriptionStatus } from '@template/contracts-typescript/wire/enums'

export const CancelSubscriptionControllerInput = z
	.object({
		body: z.object({
			// Default false: schedule the cancellation for the end of the current period (access holds until then).
			immediate: z.boolean().optional().default(false),
		}),
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([
		{
			body: { immediate: false },
			ctx: { session: { ownerId: 'owner-uuid' } },
		},
	])

export const CancelSubscriptionControllerOutput = CancelSubscriptionOutputSchema.example([
	{ status: SubscriptionStatus.ACTIVE, cancelAtPeriodEnd: true, canceledAt: '2026-07-07T00:00:00.000Z' },
	{ status: SubscriptionStatus.CANCELED, cancelAtPeriodEnd: false, canceledAt: '2026-07-07T00:00:00.000Z' },
])

@injectable()
export class CancelSubscriptionController extends Controller<
	typeof CancelSubscriptionControllerInput,
	typeof CancelSubscriptionControllerOutput
> {
	// The billing context router prefixes '/billing', so this resolves to POST /billing/subscription/cancel.
	readonly path = '/subscription/cancel'
	readonly method = 'post'
	readonly description =
		'Cancel the authenticated owner subscription. By default the cancellation takes effect at the end of the current paid period (access continues until then); pass { immediate: true } to end access now. Access is DERIVED from the recorded cancellation facts — no engine call.'
	readonly inputSchema = CancelSubscriptionControllerInput
	readonly outputSchema = CancelSubscriptionControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private cancelSubscription: CancelSubscription) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.cancelSubscription.execute({
			ownerId: request.ctx.session.ownerId,
			immediate: request.body.immediate,
		})

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
