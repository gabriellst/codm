import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { PanelActionKind } from '@codm/contracts-typescript/wire/enums'
import { RequestPanelAction, RequestPanelActionInputSchema, RequestPanelActionOutputSchema } from '../usecases/RequestPanelAction'
import { PanelDeviceMiddleware } from '../middlewares'

export const RequestPanelActionControllerInputSchema = z
	.object({
		params: RequestPanelActionInputSchema.pick({ token: true }),
		ctx: z.object({ panelDevice: RequestPanelActionInputSchema.shape.deviceToken }),
		body: RequestPanelActionInputSchema.shape.action,
	})
	.example([
		{
			params: { token: 'kq3pE1aV0m9xT2yR8wB5nC7dF4gH6jL1sZ0uQ3iO9eA' },
			ctx: {},
			body: { kind: PanelActionKind.PAUSE, issueId: '019e4d24-6524-7041-9e1c-8108180cddb0' },
		},
	])
export const RequestPanelActionControllerOutputSchema = RequestPanelActionOutputSchema

/**
 * PUBLIC, but only for an IDENTIFIED device (its cookie) — pause, resume, steer or answer the stop of one
 * issue of this group (fase 2, item 6b). Stored as pending; the daemon executes it as that member within
 * ~15 s and the page polls `GET …/actions/:actionId`.
 */
@injectable()
export class RequestPanelActionController extends Controller<
	typeof RequestPanelActionControllerInputSchema,
	typeof RequestPanelActionControllerOutputSchema
> {
	readonly path = '/panel/g/:token/actions'
	readonly method = 'post' as const
	readonly description = "Ask, as the identified member, for an action on one of the group's issues (public, device cookie)"
	readonly inputSchema = RequestPanelActionControllerInputSchema
	readonly outputSchema = RequestPanelActionControllerOutputSchema
	override middlewares = [PanelDeviceMiddleware]
	constructor(private useCase: RequestPanelAction) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({ token: request.params.token, deviceToken: request.ctx.panelDevice, action: request.body })
		return { status: HttpStatusCode.ACCEPTED, data, headers: { 'Cache-Control': 'no-store' } }
	}
}
