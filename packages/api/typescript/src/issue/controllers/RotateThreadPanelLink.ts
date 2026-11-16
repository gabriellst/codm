import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { RotateThreadPanelLink, RotateThreadPanelLinkOutputSchema } from '../usecases/RotateThreadPanelLink'

export const RotateThreadPanelLinkControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ threadId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' } }])
export const RotateThreadPanelLinkControllerOutputSchema = RotateThreadPanelLinkOutputSchema

/** Replace one conversation's panel link; the old link dies at once. The read lives in `ui`. */
@injectable()
export class RotateThreadPanelLinkController extends Controller<
	typeof RotateThreadPanelLinkControllerInputSchema,
	typeof RotateThreadPanelLinkControllerOutputSchema
> {
	readonly path = '/threads/:threadId/panel-link/rotate'
	readonly method = 'post' as const
	readonly description = "Replace a conversation's panel link"
	readonly inputSchema = RotateThreadPanelLinkControllerInputSchema
	readonly outputSchema = RotateThreadPanelLinkControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: RotateThreadPanelLink) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({ threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}
