import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { ConfigureStreaming, ConfigureStreamingInputSchema, ConfigureStreamingOutputSchema } from '../usecases/ConfigureThreadSettings'
import { ThreadParam } from '../schemas'

export const ConfigureStreamingControllerInputSchema = ThreadParam.extend({
	body: ConfigureStreamingInputSchema.pick({ enabled: true }),
}).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: { enabled: false },
	},
])
export const ConfigureStreamingControllerOutputSchema = ConfigureStreamingOutputSchema

/** Per-thread on/off for intermediate content cuts (reactions/streaming spec). */
@injectable()
export class ConfigureStreamingController extends Controller<
	typeof ConfigureStreamingControllerInputSchema,
	typeof ConfigureStreamingControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
	readonly path = '/threads/:threadId/streaming'
	readonly method = 'put' as const
	readonly description = 'Turn intermediate content cuts on or off for this conversation'
	readonly inputSchema = ConfigureStreamingControllerInputSchema
	readonly outputSchema = ConfigureStreamingControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: ConfigureStreaming) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, enabled: request.body.enabled })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
