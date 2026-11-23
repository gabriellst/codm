import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { GroupOutputMode, McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { ConfigureOutputMode, ConfigureOutputModeInputSchema, ConfigureOutputModeOutputSchema } from '../usecases/ConfigureThreadSettings'
import { ThreadParam } from '../schemas'

export const ConfigureOutputModeControllerInputSchema = ThreadParam.extend({
	body: ConfigureOutputModeInputSchema.pick({ mode: true }),
}).example([
	{
		ctx: { ownerId: '00000000-0000-4000-8000-000000000001' },
		params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' },
		body: { mode: GroupOutputMode.DECISIONS_AND_LIVE },
	},
])
export const ConfigureOutputModeControllerOutputSchema = ConfigureOutputModeOutputSchema

/**
 * How much of what its issues say reaches this group (fase 3, item 2) — decisions only, decisions and
 * previews/closings (the default), or everything. Read back by `GetThreadSettings.outputMode`.
 */
@injectable()
export class ConfigureOutputModeController extends Controller<
	typeof ConfigureOutputModeControllerInputSchema,
	typeof ConfigureOutputModeControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
	readonly path = '/threads/:threadId/output-mode'
	readonly method = 'put' as const
	readonly description = "Choose how much of its tasks' output this conversation's group receives"
	readonly inputSchema = ConfigureOutputModeControllerInputSchema
	readonly outputSchema = ConfigureOutputModeControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private useCase: ConfigureOutputMode) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		await this.useCase.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId, mode: request.body.mode })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
