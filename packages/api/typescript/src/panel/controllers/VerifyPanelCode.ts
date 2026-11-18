import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { VerifyPanelCode, VerifyPanelCodeInputSchema, VerifyPanelCodeOutputSchema } from '../usecases/VerifyPanelCode'
import { panelDeviceCookie } from '../utils/panelIdentity'

export const VerifyPanelCodeControllerInputSchema = z
	.object({
		params: VerifyPanelCodeInputSchema.pick({ token: true }),
		body: VerifyPanelCodeInputSchema.pick({ memberId: true, code: true }),
	})
	.example([
		{
			params: { token: 'kq3pE1aV0m9xT2yR8wB5nC7dF4gH6jL1sZ0uQ3iO9eA' },
			body: { memberId: 'q8ZK1x0Lr3mT5aVb2cN7dE', code: '123456' },
		},
	])
// The device token travels ONLY in the HttpOnly cookie — page script never sees it.
export const VerifyPanelCodeControllerOutputSchema = VerifyPanelCodeOutputSchema.pick({ member: true })

/**
 * PUBLIC — the code the member received on WhatsApp; right → this browser is that member on this
 * group's panel for 30 days (an HttpOnly, Secure, SameSite=Strict cookie scoped to this panel's path).
 */
@injectable()
export class VerifyPanelCodeController extends Controller<
	typeof VerifyPanelCodeControllerInputSchema,
	typeof VerifyPanelCodeControllerOutputSchema
> {
	readonly path = '/panel/g/:token/verify'
	readonly method = 'post' as const
	readonly description = 'Confirm a panel identification code; sets the device cookie (public)'
	readonly inputSchema = VerifyPanelCodeControllerInputSchema
	readonly outputSchema = VerifyPanelCodeControllerOutputSchema
	constructor(private useCase: VerifyPanelCode) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const { deviceToken, member } = await this.useCase.execute({
			token: request.params.token,
			memberId: request.body.memberId,
			code: request.body.code,
		})
		return {
			status: HttpStatusCode.OK,
			data: { member },
			headers: { 'Set-Cookie': panelDeviceCookie(request.params.token, deviceToken), 'Cache-Control': 'no-store' },
		}
	}
}
