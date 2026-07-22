import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { CancelScheduledDowngrade } from '@billing/usecases/CancelScheduledDowngrade'

export const CancelScheduledDowngradeControllerInput = z
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

export const CancelScheduledDowngradeControllerOutput = z.void()

@injectable()
export class CancelScheduledDowngradeController extends Controller<
	typeof CancelScheduledDowngradeControllerInput,
	typeof CancelScheduledDowngradeControllerOutput
> {
	// The billing context router prefixes '/billing', so this resolves to POST /billing/subscription/cancel-scheduled-downgrade.
	readonly path = '/subscription/cancel-scheduled-downgrade'
	readonly method = 'post'
	readonly description =
		'"Manter plano atual" — drop a pending scheduled downgrade before it takes effect. A no-op if nothing is scheduled.'
	readonly inputSchema = CancelScheduledDowngradeControllerInput
	readonly outputSchema = CancelScheduledDowngradeControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private cancelScheduledDowngrade: CancelScheduledDowngrade) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.cancelScheduledDowngrade.execute({
			ownerId: request.ctx.session.ownerId,
		})

		return { status: HttpStatusCode.NO_CONTENT }
	}
}
