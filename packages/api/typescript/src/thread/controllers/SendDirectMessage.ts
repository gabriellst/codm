import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import { SendDirectMessage, SendDirectMessageInputSchema, SendDirectMessageOutputSchema } from '../usecases/SendDirectMessage'
import { ThreadParam } from '../schemas'

export const SendDirectMessageControllerInputSchema = ThreadParam.extend({
	body: SendDirectMessageInputSchema.pick({ text: true }),
}).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: { text: 'I will take this one from here' },
	},
])
export const SendDirectMessageControllerOutputSchema = SendDirectMessageOutputSchema.example([
	{ entryId: '019e4d24-6524-7041-9e1c-8108180cddb0' },
])

// C20
@injectable()
export class SendDirectMessageController extends Controller<
	typeof SendDirectMessageControllerInputSchema,
	typeof SendDirectMessageControllerOutputSchema
> {
	readonly path = '/threads/:threadId/direct'
	readonly method = 'post' as const
	readonly description = 'Send a direct message as the operator (only while paused) (C20)'
	readonly inputSchema = SendDirectMessageControllerInputSchema
	readonly outputSchema = SendDirectMessageControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: SendDirectMessage) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, text: request.body.text })
		return { status: HttpStatusCode.CREATED, data }
	}
}
