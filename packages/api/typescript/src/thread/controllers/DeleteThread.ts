import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { DeleteThread, DeleteThreadOutputSchema } from '../usecases/DeleteThread'
import { ThreadParam } from '../schemas'

export const DeleteThreadControllerInputSchema = ThreadParam.example([
	{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
])
export const DeleteThreadControllerOutputSchema = DeleteThreadOutputSchema

// C-DEL — `DELETE /threads/:threadId` (thread-deletion spec, decision 8). The bare thread path with
// the DELETE verb: the resource being removed IS the thread, so it needs no `/delete` suffix the way
// `/pause` and `/resolve` (which are actions on a thread that stays) do.
@injectable()
export class DeleteThreadController extends Controller<
	typeof DeleteThreadControllerInputSchema,
	typeof DeleteThreadControllerOutputSchema
> {
	readonly path = '/threads/:threadId'
	readonly method = 'delete' as const
	readonly description = 'Apagar uma conversa configurada — soft delete, bloqueado por trabalho vivo (C-DEL)'
	readonly inputSchema = DeleteThreadControllerInputSchema
	readonly outputSchema = DeleteThreadControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: DeleteThread) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
