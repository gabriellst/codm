import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '../middlewares/RequireOwner'
import { EnableOwner, EnableOwnerOutputSchema } from '../usecases/EnableOwner'

export const EnableOwnerControllerInputSchema = z
	.object({
		ctx: z.object({
			user: z.object({ id: z.string() }),
			session: z.object({ ownerId: z.uuid() }),
		}),
	})
	.example([
		{
			ctx: { user: { id: 'user-123' }, session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
		},
	])

export const EnableOwnerControllerOutputSchema = EnableOwnerOutputSchema.example([
	{ ownerId: '019e4d24-6524-7041-9e1c-8108180cddae', isDisabled: false },
])

@injectable()
export class EnableOwnerController extends Controller<typeof EnableOwnerControllerInputSchema, typeof EnableOwnerControllerOutputSchema> {
	readonly path = '/owners/enable'
	readonly method = 'post' as const
	readonly description = 'Re-enable a previously disabled owner (C20 EnableOwner; OWNER only)'
	readonly inputSchema = EnableOwnerControllerInputSchema
	readonly outputSchema = EnableOwnerControllerOutputSchema

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private enableOwner: EnableOwner) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.enableOwner.execute({
			ownerId: request.ctx.session.ownerId,
			enabledByUserId: request.ctx.user.id,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
