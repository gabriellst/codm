import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetSessionIssues, GetSessionIssuesOutputSchema } from '../usecases/GetSessionIssues'

export const GetSessionIssuesControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ threadId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' } }])
export const GetSessionIssuesControllerOutputSchema = GetSessionIssuesOutputSchema

// T11
@injectable()
export class GetSessionIssuesController extends Controller<
	typeof GetSessionIssuesControllerInputSchema,
	typeof GetSessionIssuesControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.orchestration, McpScope.system]
	readonly path = '/threads/:threadId/issues'
	readonly method = 'get' as const
	readonly description = 'Issues of one thread grouped by status + auto-archive note (T11)'
	readonly inputSchema = GetSessionIssuesControllerInputSchema
	readonly outputSchema = GetSessionIssuesControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: GetSessionIssues) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}
