import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { GetPanelIdentity, GetPanelIdentityInputSchema, GetPanelIdentityOutputSchema } from '../usecases/GetPanelIdentity'
import { PanelDeviceMiddleware } from '../middlewares'

export const GetPanelIdentityControllerInputSchema = z
	.object({
		params: GetPanelIdentityInputSchema.pick({ token: true }),
		ctx: z.object({ panelDevice: GetPanelIdentityInputSchema.shape.deviceToken }),
	})
	.example([{ params: { token: 'kq3pE1aV0m9xT2yR8wB5nC7dF4gH6jL1sZ0uQ3iO9eA' }, ctx: {} }])
export const GetPanelIdentityControllerOutputSchema = GetPanelIdentityOutputSchema

/** PUBLIC — who this browser is on this group's panel (from its device cookie), or nobody. */
@injectable()
export class GetPanelIdentityController extends Controller<
	typeof GetPanelIdentityControllerInputSchema,
	typeof GetPanelIdentityControllerOutputSchema
> {
	readonly path = '/panel/g/:token/me'
	readonly method = 'get' as const
	readonly description = "Who this device is on a group's panel, from its device cookie (public)"
	readonly inputSchema = GetPanelIdentityControllerInputSchema
	readonly outputSchema = GetPanelIdentityControllerOutputSchema
	override middlewares = [PanelDeviceMiddleware]
	constructor(private query: GetPanelIdentity) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ token: request.params.token, deviceToken: request.ctx.panelDevice })
		return { status: HttpStatusCode.OK, data, headers: { 'Cache-Control': 'no-store' } }
	}
}
