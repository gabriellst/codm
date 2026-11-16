import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares'
import { RotatePanelLink, RotatePanelLinkOutputSchema } from '../usecases/RotatePanelLink'

export const RotatePanelLinkControllerInputSchema = z
	.object({
		ctx: z.object({ session: z.object({ ownerId: z.uuid() }) }),
		params: z.object({ threadId: z.uuid() }),
	})
	.example([
		{ ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cddae' } }, params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddaf' } },
	])
export const RotatePanelLinkControllerOutputSchema = RotatePanelLinkOutputSchema

/** Replace a group's panel link; the old one stops working at once. */
@injectable()
export class RotatePanelLinkController extends Controller<
	typeof RotatePanelLinkControllerInputSchema,
	typeof RotatePanelLinkControllerOutputSchema
> {
	readonly path = '/panel/groups/:threadId/rotate'
	readonly method = 'post' as const
	readonly description = "Replace a group's panel link token"
	readonly inputSchema = RotatePanelLinkControllerInputSchema
	readonly outputSchema = RotatePanelLinkControllerOutputSchema
	override middlewares = [AuthAccountMiddleware]
	constructor(private useCase: RotatePanelLink) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({ ownerId: request.ctx.session.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}
