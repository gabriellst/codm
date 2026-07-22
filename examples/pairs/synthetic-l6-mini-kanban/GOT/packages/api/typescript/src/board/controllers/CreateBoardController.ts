import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { CreateBoard, CreateBoardInputSchema, CreateBoardOutputSchema } from '../usecases/CreateBoard'

export const CreateBoardControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ storeId: z.uuid() }) }),
	body: CreateBoardInputSchema.omit({ storeId: true }),
})

export const CreateBoardControllerOutputSchema = CreateBoardOutputSchema

@injectable()
export class CreateBoardController extends Controller<
	typeof CreateBoardControllerInputSchema,
	typeof CreateBoardControllerOutputSchema
> {
	readonly path = '/boards'
	readonly method = 'post' as const
	readonly description = 'Create a new kanban board with ordered lists'
	readonly inputSchema = CreateBoardControllerInputSchema
	readonly outputSchema = CreateBoardControllerOutputSchema
	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private readonly useCase: CreateBoard) { super() }

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({
			storeId: request.ctx.session.storeId,
			...request.body,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
