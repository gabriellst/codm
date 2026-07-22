import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { ResumeSubscription } from '@billing/usecases/ResumeSubscription'

export const ResumeSubscriptionControllerInput = z
	.object({
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([
		{
			ctx: { session: { ownerId: 'owner-uuid' } },
		},
	])

export const ResumeSubscriptionControllerOutput = z.void()

@injectable()
export class ResumeSubscriptionController extends Controller<
	typeof ResumeSubscriptionControllerInput,
	typeof ResumeSubscriptionControllerOutput
> {
	// The billing context router prefixes '/billing', so this resolves to POST /billing/subscription/resume.
	readonly path = '/subscription/resume'
	readonly method = 'post'
	readonly description =
		'"Reativar assinatura" — suspend a pending scheduled cancellation, restoring the subscription to normal active state.'
	readonly inputSchema = ResumeSubscriptionControllerInput
	readonly outputSchema = ResumeSubscriptionControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private resumeSubscription: ResumeSubscription) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.resumeSubscription.execute({
			ownerId: request.ctx.session.ownerId,
		})

		return { status: HttpStatusCode.NO_CONTENT }
	}
}
