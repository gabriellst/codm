import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codedm/core-typescript'
import { OperatorMiddleware } from '@auth/middlewares'
import {
	ConfigureMentionGate,
	ConfigureMentionGateInputSchema,
	ConfigureMentionGateOutputSchema,
} from '../usecases/ConfigureThreadSettings'
import { ThreadParam } from '../schemas'

export const ConfigureMentionGateControllerInputSchema = ThreadParam.extend({
	body: ConfigureMentionGateInputSchema.pick({ mentionGate: true }),
}).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: { mentionGate: { enabled: true, tag: '@dev' } },
	},
])
export const ConfigureMentionGateControllerOutputSchema = ConfigureMentionGateOutputSchema

// C12
@injectable()
export class ConfigureMentionGateController extends Controller<
	typeof ConfigureMentionGateControllerInputSchema,
	typeof ConfigureMentionGateControllerOutputSchema
> {
	readonly path = '/threads/:threadId/mention-gate'
	readonly method = 'put' as const
	readonly description = 'Configure the mention gate (respond only when a @tag is written) (C12)'
	readonly inputSchema = ConfigureMentionGateControllerInputSchema
	readonly outputSchema = ConfigureMentionGateControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private useCase: ConfigureMentionGate) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, mentionGate: request.body.mentionGate })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
