import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { ForgetPanelDevice, ForgetPanelDeviceInputSchema, ForgetPanelDeviceOutputSchema } from '../usecases/ForgetPanelDevice'
import { PanelDeviceMiddleware } from '../middlewares'
import { panelDeviceCookie } from '../utils/panelIdentity'

export const ForgetPanelDeviceControllerInputSchema = z
	.object({
		params: ForgetPanelDeviceInputSchema.pick({ token: true }),
		ctx: z.object({ panelDevice: ForgetPanelDeviceInputSchema.shape.deviceToken }),
	})
	.example([{ params: { token: 'kq3pE1aV0m9xT2yR8wB5nC7dF4gH6jL1sZ0uQ3iO9eA' }, ctx: {} }])
export const ForgetPanelDeviceControllerOutputSchema = ForgetPanelDeviceOutputSchema

/** PUBLIC — "Sair": ends this browser's identity on this group's panel and clears its cookie. */
@injectable()
export class ForgetPanelDeviceController extends Controller<
	typeof ForgetPanelDeviceControllerInputSchema,
	typeof ForgetPanelDeviceControllerOutputSchema
> {
	readonly path = '/panel/g/:token/forget'
	readonly method = 'post' as const
	readonly description = "End this device's identity on a group's panel (public)"
	readonly inputSchema = ForgetPanelDeviceControllerInputSchema
	readonly outputSchema = ForgetPanelDeviceControllerOutputSchema
	override middlewares = [PanelDeviceMiddleware]
	constructor(private useCase: ForgetPanelDevice) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ token: request.params.token, deviceToken: request.ctx.panelDevice })
		return { status: HttpStatusCode.NO_CONTENT, headers: { 'Set-Cookie': panelDeviceCookie(request.params.token) } }
	}
}
