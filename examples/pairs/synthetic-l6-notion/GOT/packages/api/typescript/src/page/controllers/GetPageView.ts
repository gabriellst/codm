import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { GetPageView, GetPageViewOutputSchema } from '../usecases/GetPageView'

export const GetPageViewControllerInputSchema = z.object({
	ctx: z.object({ user: z.object({ id: z.string() }) }),
	params: z.object({ pageId: z.uuid() }),
})

export const GetPageViewControllerOutputSchema = GetPageViewOutputSchema

@injectable()
export class GetPageViewController extends Controller<
	typeof GetPageViewControllerInputSchema,
	typeof GetPageViewControllerOutputSchema
> {
	readonly path = '/pages/:pageId/view'
	readonly method = 'get' as const
	readonly description = 'Get a page with its full block tree and child pages'
	readonly inputSchema = GetPageViewControllerInputSchema
	readonly outputSchema = GetPageViewControllerOutputSchema

	override middlewares = [AuthAccountMiddleware]

	constructor(private readonly query: GetPageView) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({
			pageId: request.params.pageId,
			ownerId: request.ctx.user.id,
		})
		return { status: HttpStatusCode.OK, data }
	}
}
