import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { ConfigureReactions, ConfigureReactionsInputSchema, ConfigureReactionsOutputSchema } from '../usecases/ConfigureThreadSettings'
import { ThreadParam } from '../schemas'

export const ConfigureReactionsControllerInputSchema = ThreadParam.extend({
	body: ConfigureReactionsInputSchema.pick({ enabled: true }),
}).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: { enabled: false },
	},
])
export const ConfigureReactionsControllerOutputSchema = ConfigureReactionsOutputSchema

/** Per-thread on/off for the 👀/🤖 channel reaction cues (reactions/streaming spec). */
@injectable()
export class ConfigureReactionsController extends Controller<
	typeof ConfigureReactionsControllerInputSchema,
	typeof ConfigureReactionsControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
	readonly path = '/threads/:threadId/reactions'
	readonly method = 'put' as const
	readonly description = 'Turn the 👀/🤖 channel reaction cues on or off for this conversation'
	readonly inputSchema = ConfigureReactionsControllerInputSchema
	readonly outputSchema = ConfigureReactionsControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: ConfigureReactions) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, enabled: request.body.enabled })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
