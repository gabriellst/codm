import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { CreatePage, CreatePageOutputSchema } from '../usecases/CreatePage'

export const CreatePageControllerInputSchema = z.object({
	ctx: z.object({ user: z.object({ id: z.string() }) }),
	body: z.object({
		workspaceId: z.uuid(),
		parentPageId: z.uuid().nullable().optional(),
		title: z.string().min(1),
	}),
})

export const CreatePageControllerOutputSchema = CreatePageOutputSchema

@injectable()
export class CreatePageController extends Controller<
	typeof CreatePageControllerInputSchema,
	typeof CreatePageControllerOutputSchema
> {
	readonly path = '/pages'
	readonly method = 'post' as const
	readonly description = 'Create a new page'
	readonly inputSchema = CreatePageControllerInputSchema
	readonly outputSchema = CreatePageControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private cmd: CreatePage) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.cmd.execute({
			ownerId: request.ctx.user.id,
			workspaceId: request.body.workspaceId,
			parentPageId: request.body.parentPageId,
			title: request.body.title,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
