import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { GetPanelAction, GetPanelActionInputSchema, GetPanelActionOutputSchema } from '../usecases/GetPanelAction'
import { PanelDeviceMiddleware } from '../middlewares'

export const GetPanelActionControllerInputSchema = z
	.object({
		params: GetPanelActionInputSchema.pick({ token: true, actionId: true }),
		ctx: z.object({ panelDevice: GetPanelActionInputSchema.shape.deviceToken }),
	})
	.example([
		{
			params: { token: 'kq3pE1aV0m9xT2yR8wB5nC7dF4gH6jL1sZ0uQ3iO9eA', actionId: '019e4d24-6524-7041-9e1c-8108180cddc0' },
			ctx: {},
		},
	])
export const GetPanelActionControllerOutputSchema = GetPanelActionOutputSchema

/** PUBLIC, for the device that asked — where a panel action stands (fase 2, item 6b). */
@injectable()
export class GetPanelActionController extends Controller<
	typeof GetPanelActionControllerInputSchema,
	typeof GetPanelActionControllerOutputSchema
> {
	readonly path = '/panel/g/:token/actions/:actionId'
	readonly method = 'get' as const
	readonly description = 'Where a panel action stands — pending, done, refused or expired (public, device cookie)'
	readonly inputSchema = GetPanelActionControllerInputSchema
	readonly outputSchema = GetPanelActionControllerOutputSchema
	override middlewares = [PanelDeviceMiddleware]
	constructor(private query: GetPanelAction) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({
			token: request.params.token,
			deviceToken: request.ctx.panelDevice,
			actionId: request.params.actionId,
		})
		return { status: HttpStatusCode.OK, data, headers: { 'Cache-Control': 'no-store' } }
	}
}
