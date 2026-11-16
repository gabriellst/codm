import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { GetThreadPanelLink, GetThreadPanelLinkOutputSchema } from '../usecases/GetThreadPanelLink'

export const GetThreadPanelLinkControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ threadId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' } }])
export const GetThreadPanelLinkControllerOutputSchema = GetThreadPanelLinkOutputSchema

/** The panel link of one conversation, for the console to copy (fase 1). */
@injectable()
export class GetThreadPanelLinkController extends Controller<
	typeof GetThreadPanelLinkControllerInputSchema,
	typeof GetThreadPanelLinkControllerOutputSchema
> {
	readonly path = '/threads/:threadId/panel-link'
	readonly method = 'get' as const
	readonly description = "A conversation's panel link (absent until the first push or when not logged in)"
	readonly inputSchema = GetThreadPanelLinkControllerInputSchema
	readonly outputSchema = GetThreadPanelLinkControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private query: GetThreadPanelLink) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}
