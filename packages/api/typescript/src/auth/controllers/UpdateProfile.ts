import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { UpdateProfile, UpdateProfileInputSchema } from '../usecases/UpdateProfile'

export const UpdateProfileControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
		}),
		body: UpdateProfileInputSchema.omit({ userId: true }),
	})
	.example([
		{
			ctx: { user: { id: 'user-123' } },
			body: {
				name: 'Alice',
				pictureUrl: 'https://cdn.example.com/avatar.png',
			},
		},
	])

export const UpdateProfileControllerOutputSchema = z.void()

@injectable()
export class UpdateProfileController extends Controller<
	typeof UpdateProfileControllerInputSchema,
	typeof UpdateProfileControllerOutputSchema
> {
	readonly path = '/me/profile'
	readonly method = 'patch' as const
	readonly description = 'Update current user profile (name, pictureUrl)'
	readonly inputSchema = UpdateProfileControllerInputSchema
	readonly outputSchema = UpdateProfileControllerOutputSchema

	// AuthAccountMiddleware injects ctx.user.id
	override middlewares = [AuthAccountMiddleware]

	constructor(private updateProfile: UpdateProfile) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.updateProfile.execute({
			userId: request.ctx.user.id,
			name: request.body.name,
			pictureUrl: request.body.pictureUrl,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
