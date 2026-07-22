import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { BlockType } from '@template/contracts-typescript/wire/enums'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { AddBlock, AddBlockOutputSchema } from '../usecases/AddBlock'

export const AddBlockControllerInputSchema = z.object({
	ctx: z.object({ user: z.object({ id: z.string() }) }),
	params: z.object({ pageId: z.uuid() }),
	body: z.object({
		type: z.enum(BlockType),
		content: z.string(),
		parentBlockId: z.uuid().nullable().optional(),
	}),
})

export const AddBlockControllerOutputSchema = AddBlockOutputSchema

@injectable()
export class AddBlockController extends Controller<
	typeof AddBlockControllerInputSchema,
	typeof AddBlockControllerOutputSchema
> {
	readonly path = '/pages/:pageId/blocks'
	readonly method = 'post' as const
	readonly description = 'Add a block to a page'
	readonly inputSchema = AddBlockControllerInputSchema
	readonly outputSchema = AddBlockControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private cmd: AddBlock) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.cmd.execute({
			pageId: request.params.pageId,
			type: request.body.type,
			content: request.body.content,
			parentBlockId: request.body.parentBlockId,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
