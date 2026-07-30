import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { UploadAvatar, UploadAvatarOutputSchema } from '../usecases/UploadAvatar'

export const UploadAvatarControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
			session: z.object({ ownerId: z.uuid() }),
		}),
	})
	.example([{ ctx: { user: { id: 'operator' }, session: { ownerId: '00000000-0000-4000-8000-000000000001' } } }])

export const UploadAvatarControllerOutputSchema = UploadAvatarOutputSchema

@injectable()
export class UploadAvatarController extends Controller<
	typeof UploadAvatarControllerInputSchema,
	typeof UploadAvatarControllerOutputSchema
> {
	readonly path = '/identity/account/avatar'
	readonly method = 'post' as const
	readonly description = 'MOCK. Accept-and-echo multipart avatar upload — returns new pictureUrl'
	readonly inputSchema = UploadAvatarControllerInputSchema
	readonly outputSchema = UploadAvatarControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private command: UploadAvatar) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		return {
			status: HttpStatusCode.OK,
			data: await this.command.execute({
				ownerId: request.ctx.session.ownerId,
				userId: request.ctx.user.id,
			}),
		}
	}
}
