import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import {
	ConfigureThinkingIndicator,
	ConfigureThinkingIndicatorInputSchema,
	ConfigureThinkingIndicatorOutputSchema,
} from '../usecases/ConfigureThreadSettings'
import { ThreadParam } from '../schemas'

export const ConfigureThinkingIndicatorControllerInputSchema = ThreadParam.extend({
	body: ConfigureThinkingIndicatorInputSchema.pick({ enabled: true }),
}).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: { enabled: false },
	},
])
export const ConfigureThinkingIndicatorControllerOutputSchema = ConfigureThinkingIndicatorOutputSchema

/** Per-thread on/off for the "Pensando" channel placeholder (thinking-indicator spec). */
@injectable()
export class ConfigureThinkingIndicatorController extends Controller<
	typeof ConfigureThinkingIndicatorControllerInputSchema,
	typeof ConfigureThinkingIndicatorControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
	readonly path = '/threads/:threadId/thinking-indicator'
	readonly method = 'put' as const
	readonly description = 'Turn the "Pensando" channel placeholder on or off for this conversation'
	readonly inputSchema = ConfigureThinkingIndicatorControllerInputSchema
	readonly outputSchema = ConfigureThinkingIndicatorControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: ConfigureThinkingIndicator) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, enabled: request.body.enabled })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
