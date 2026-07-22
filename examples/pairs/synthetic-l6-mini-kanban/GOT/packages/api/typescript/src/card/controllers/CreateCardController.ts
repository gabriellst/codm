import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { CreateCard, CreateCardInputSchema, CreateCardOutputSchema } from '../usecases/CreateCard'

export const CreateCardControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ storeId: z.uuid() }) }),
	body: CreateCardInputSchema.omit({ storeId: true }),
})

export const CreateCardControllerOutputSchema = CreateCardOutputSchema

@injectable()
export class CreateCardController extends Controller<
	typeof CreateCardControllerInputSchema,
	typeof CreateCardControllerOutputSchema
> {
	readonly path = '/cards'
	readonly method = 'post' as const
	readonly description = 'Create a card on a kanban board list'
	readonly inputSchema = CreateCardControllerInputSchema
	readonly outputSchema = CreateCardControllerOutputSchema
	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private readonly useCase: CreateCard) { super() }

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({
			storeId: request.ctx.session.storeId,
			...request.body,
		})
		return { status: HttpStatusCode.CREATED, data }
	}
}
