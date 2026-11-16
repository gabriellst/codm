import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { GetPanelBoard, GetPanelBoardInputSchema, GetPanelBoardOutputSchema } from '../usecases/GetPanelBoard'

export const GetPanelBoardControllerInputSchema = z
	.object({ params: GetPanelBoardInputSchema })
	.example([{ params: { token: 'kq3pE1aV0m9xT2yR8wB5nC7dF4gH6jL1sZ0uQ3iO9eA' } }])
export const GetPanelBoardControllerOutputSchema = GetPanelBoardOutputSchema

/** PUBLIC — no session: the group link token IS the access. */
@injectable()
export class GetPanelBoardController extends Controller<
	typeof GetPanelBoardControllerInputSchema,
	typeof GetPanelBoardControllerOutputSchema
> {
	readonly path = '/panel/g/:token/board'
	readonly method = 'get' as const
	readonly description = "A group's issue board, by its panel link token (public)"
	readonly inputSchema = GetPanelBoardControllerInputSchema
	readonly outputSchema = GetPanelBoardControllerOutputSchema
	constructor(private query: GetPanelBoard) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ token: request.params.token })
		return { status: HttpStatusCode.OK, data }
	}
}
