import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { RegisterFcmToken, RegisterFcmTokenInputSchema } from '../usecases/RegisterFcmToken'

export const RegisterFcmTokenControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
		}),
		body: RegisterFcmTokenInputSchema.omit({ userId: true }),
	})
	.example([
		{
			ctx: { user: { id: 'user-123' } },
			body: {
				token: 'fcm-token-abc',
				platform: FcmPlatform.IOS,
			},
		},
	])

export const RegisterFcmTokenControllerOutputSchema = z.void()

@injectable()
export class RegisterFcmTokenController extends Controller<
	typeof RegisterFcmTokenControllerInputSchema,
	typeof RegisterFcmTokenControllerOutputSchema
> {
	readonly path = '/me/fcm-tokens'
	readonly method = 'post' as const
	readonly description = 'Register an FCM push token for the current user device'
	readonly inputSchema = RegisterFcmTokenControllerInputSchema
	readonly outputSchema = RegisterFcmTokenControllerOutputSchema

	// AuthAccountMiddleware injects ctx.user.id
	override middlewares = [OperatorMiddleware]

	constructor(private registerFcmToken: RegisterFcmToken) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.registerFcmToken.execute({
			userId: request.ctx.user.id,
			token: request.body.token,
			platform: request.body.platform,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
