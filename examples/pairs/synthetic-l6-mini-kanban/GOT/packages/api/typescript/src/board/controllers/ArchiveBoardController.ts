import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { ArchiveBoard, ArchiveBoardOutputSchema } from '../usecases/ArchiveBoard'

export const ArchiveBoardControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ storeId: z.uuid() }) }),
	params: z.object({ boardId: z.uuid() }),
})

export const ArchiveBoardControllerOutputSchema = ArchiveBoardOutputSchema

@injectable()
export class ArchiveBoardController extends Controller<
	typeof ArchiveBoardControllerInputSchema,
	typeof ArchiveBoardControllerOutputSchema
> {
	readonly path = '/boards/:boardId/archive'
	readonly method = 'patch' as const
	readonly description = 'Archive a kanban board'
	readonly inputSchema = ArchiveBoardControllerInputSchema
	readonly outputSchema = ArchiveBoardControllerOutputSchema
	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private readonly useCase: ArchiveBoard) { super() }

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({
			storeId: request.ctx.session.storeId,
			boardId: request.params.boardId,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
