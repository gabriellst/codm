import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { GetSessionChat, GetSessionChatOutputSchema } from '../usecases/GetSessionChat'
import { ThreadParam } from '../schemas'

export const GetSessionChatControllerInputSchema = ThreadParam.example([
	{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' } },
])
export const GetSessionChatControllerOutputSchema = GetSessionChatOutputSchema

// T09
@injectable()
export class GetSessionChatController extends Controller<
	typeof GetSessionChatControllerInputSchema,
	typeof GetSessionChatControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system, McpScope.orchestration]
	readonly path = '/threads/:threadId/chat'
	readonly method = 'get' as const
	readonly description = 'Full thread conversation + control-plane state + active stops (T09)'
	readonly inputSchema = GetSessionChatControllerInputSchema
	readonly outputSchema = GetSessionChatControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]
	constructor(private query: GetSessionChat) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}
