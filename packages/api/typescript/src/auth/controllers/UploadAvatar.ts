import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares/RequireOwner'
import { UploadAvatar, UploadAvatarOutputSchema } from '../usecases/UploadAvatar'

export const UploadAvatarControllerInputSchema = z.object({
	ctx: z.object({
		user: z.object({ id: z.string() }),
		session: z.object({ ownerId: z.uuid() }),
	}),
})

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

	override middlewares = [AuthAccountMiddleware, RequireOwner]

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
