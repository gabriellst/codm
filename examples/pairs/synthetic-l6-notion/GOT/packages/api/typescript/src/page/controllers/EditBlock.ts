import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { EditBlock, EditBlockOutputSchema } from '../usecases/EditBlock'

export const EditBlockControllerInputSchema = z.object({
	ctx: z.object({ user: z.object({ id: z.string() }) }),
	params: z.object({ pageId: z.uuid(), blockId: z.uuid() }),
	body: z.object({
		content: z.string(),
	}),
})

export const EditBlockControllerOutputSchema = EditBlockOutputSchema

@injectable()
export class EditBlockController extends Controller<
	typeof EditBlockControllerInputSchema,
	typeof EditBlockControllerOutputSchema
> {
	readonly path = '/pages/:pageId/blocks/:blockId'
	readonly method = 'patch' as const
	readonly description = 'Edit the content of a block'
	readonly inputSchema = EditBlockControllerInputSchema
	readonly outputSchema = EditBlockControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private cmd: EditBlock) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.cmd.execute({
			pageId: request.params.pageId,
			blockId: request.params.blockId,
			content: request.body.content,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
