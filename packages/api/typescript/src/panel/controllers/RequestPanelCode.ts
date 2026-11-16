import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { RequestPanelCode, RequestPanelCodeInputSchema, RequestPanelCodeOutputSchema } from '../usecases/RequestPanelCode'

export const RequestPanelCodeControllerInputSchema = z
	.object({
		params: RequestPanelCodeInputSchema.pick({ token: true }),
		body: RequestPanelCodeInputSchema.pick({ memberId: true }),
	})
	.example([{ params: { token: 'kq3pE1aV0m9xT2yR8wB5nC7dF4gH6jL1sZ0uQ3iO9eA' }, body: { memberId: 'q8ZK1x0Lr3mT5aVb2cN7dE' } }])
export const RequestPanelCodeControllerOutputSchema = RequestPanelCodeOutputSchema

/** PUBLIC — "send me a code": codm will DM a code to that member's WhatsApp within ~15 s (fase 2, item 6a). */
@injectable()
export class RequestPanelCodeController extends Controller<
	typeof RequestPanelCodeControllerInputSchema,
	typeof RequestPanelCodeControllerOutputSchema
> {
	readonly path = '/panel/g/:token/identify'
	readonly method = 'post' as const
	readonly description = "Ask codm to send a panel identification code to a group member's WhatsApp (public)"
	readonly inputSchema = RequestPanelCodeControllerInputSchema
	readonly outputSchema = RequestPanelCodeControllerOutputSchema
	constructor(private useCase: RequestPanelCode) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ token: request.params.token, memberId: request.body.memberId })
		return { status: HttpStatusCode.ACCEPTED }
	}
}
