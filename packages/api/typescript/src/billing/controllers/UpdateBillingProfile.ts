import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { injectable } from 'tsyringe-neo'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { Language } from '@template/contracts-typescript/wire/enums'
import { UpdateBillingProfile, UpdateBillingProfileOutputSchema } from '@billing/usecases/UpdateBillingProfile'
import { UpdateBillingProfileBodySchema } from '@billing/schemas'

export const UpdateBillingProfileControllerInput = z
	.object({
		// At-least-one-field cross-field rule lives on the schema (billing/schemas), not here.
		body: UpdateBillingProfileBodySchema,
		ctx: z.object({
			user: z.object({ id: z.string() }),
			session: z.object({ ownerId: z.string() }),
		}),
	})
	.example([
		{
			body: { email: 'financeiro@clinica.com', language: Language.EN_US },
			ctx: { user: { id: 'user-uuid' }, session: { ownerId: 'owner-uuid' } },
		},
	])

export const UpdateBillingProfileControllerOutput = UpdateBillingProfileOutputSchema.example([
	{ name: 'Clínica Sol', email: 'financeiro@clinica.com', document: '11144477735', language: Language.EN_US },
])

@injectable()
export class UpdateBillingProfileController extends Controller<
	typeof UpdateBillingProfileControllerInput,
	typeof UpdateBillingProfileControllerOutput
> {
	readonly path = '/profile'
	readonly method = 'patch'
	readonly description = 'Update the billing identity (name/email/document/language) — responsible user only'
	readonly inputSchema = UpdateBillingProfileControllerInput
	readonly outputSchema = UpdateBillingProfileControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private updateBillingProfile: UpdateBillingProfile) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.updateBillingProfile.execute({
			ownerId: request.ctx.session.ownerId,
			actorUserId: request.ctx.user.id,
			...request.body,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
