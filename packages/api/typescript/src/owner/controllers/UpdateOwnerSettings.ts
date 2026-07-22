import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { UpdateOwnerSettings, UpdateOwnerSettingsInputSchema } from '../usecases/UpdateOwnerSettings'

export const UpdateOwnerSettingsControllerInputSchema = z
	.object({
		ctx: z.object({
			session: z.object({ ownerId: z.uuid() }),
		}),
		// ownerId is supplied from ctx.session.ownerId — omitted from the HTTP surface.
		body: UpdateOwnerSettingsInputSchema.omit({ ownerId: true }),
	})
	.example([
		{
			ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
			body: {
				name: 'New Acme',
				pictureUrl: 'https://cdn.example.com/new-logo.png',
				timezone: 'America/Sao_Paulo',
			},
		},
	])

export const UpdateOwnerSettingsControllerOutputSchema = z.void()

@injectable()
export class UpdateOwnerSettingsController extends Controller<
	typeof UpdateOwnerSettingsControllerInputSchema,
	typeof UpdateOwnerSettingsControllerOutputSchema
> {
	readonly path = '/owners/settings'
	readonly method = 'patch' as const
	readonly description = 'Update owner profile settings (name / picture / timezone)'
	readonly inputSchema = UpdateOwnerSettingsControllerInputSchema
	readonly outputSchema = UpdateOwnerSettingsControllerOutputSchema

	override middlewares = [OperatorMiddleware]

	constructor(private updateOwnerSettings: UpdateOwnerSettings) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.updateOwnerSettings.execute({
			ownerId: request.ctx.session.ownerId,
			name: request.body.name,
			pictureUrl: request.body.pictureUrl,
			timezone: request.body.timezone,
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
