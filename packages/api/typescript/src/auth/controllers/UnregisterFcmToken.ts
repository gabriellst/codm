import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { UnregisterFcmToken, UnregisterFcmTokenInputSchema } from '../usecases/UnregisterFcmToken'

export const UnregisterFcmTokenControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
		}),
		body: UnregisterFcmTokenInputSchema.omit({ userId: true }),
	})
	.example([{ ctx: { user: { id: 'user-123' } }, body: { token: 'fcm-token-abc' } }])

export const UnregisterFcmTokenControllerOutputSchema = z.void()

@injectable()
export class UnregisterFcmTokenController extends Controller<
	typeof UnregisterFcmTokenControllerInputSchema,
	typeof UnregisterFcmTokenControllerOutputSchema
> {
	readonly path = '/me/fcm-tokens'
	readonly method = 'delete' as const
	readonly description = 'Unregister an FCM push token for the current user device'
	readonly inputSchema = UnregisterFcmTokenControllerInputSchema
	readonly outputSchema = UnregisterFcmTokenControllerOutputSchema

	// AuthAccountMiddleware injects ctx.user.id
	override middlewares = [AuthAccountMiddleware]

	constructor(private unregisterFcmToken: UnregisterFcmToken) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.unregisterFcmToken.execute({
			userId: request.ctx.user.id,
			token: request.body.token,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
