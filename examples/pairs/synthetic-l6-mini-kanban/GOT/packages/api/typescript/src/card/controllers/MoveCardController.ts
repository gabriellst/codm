import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireStoreMember } from '@tenancy/middlewares/RequireStoreMember'
import { MoveCard, MoveCardOutputSchema } from '../usecases/MoveCard'

export const MoveCardControllerInputSchema = z.object({
	ctx: z.object({ session: z.object({ storeId: z.uuid() }) }),
	params: z.object({ cardId: z.uuid() }),
	body: z.object({ toListId: z.uuid() }),
})

export const MoveCardControllerOutputSchema = MoveCardOutputSchema

@injectable()
export class MoveCardController extends Controller<
	typeof MoveCardControllerInputSchema,
	typeof MoveCardControllerOutputSchema
> {
	readonly path = '/cards/:cardId/move'
	readonly method = 'patch' as const
	readonly description = 'Move a card to a different list on the same board'
	readonly inputSchema = MoveCardControllerInputSchema
	readonly outputSchema = MoveCardControllerOutputSchema
	override middlewares = [AuthAccountMiddleware, RequireStoreMember]

	constructor(private readonly useCase: MoveCard) { super() }

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({
			storeId: request.ctx.session.storeId,
			cardId: request.params.cardId,
			toListId: request.body.toListId,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
