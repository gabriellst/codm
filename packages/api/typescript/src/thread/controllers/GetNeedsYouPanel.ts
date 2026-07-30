import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codedm/core-typescript'
import { McpScope } from '@codedm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { GetNeedsYouPanel, GetNeedsYouPanelOutputSchema } from '../usecases/GetNeedsYouPanel'

export const GetNeedsYouPanelControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ threadId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' } }])
export const GetNeedsYouPanelControllerOutputSchema = GetNeedsYouPanelOutputSchema

// T14
@injectable()
export class GetNeedsYouPanelController extends Controller<
	typeof GetNeedsYouPanelControllerInputSchema,
	typeof GetNeedsYouPanelControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/threads/:threadId/needs-you'
	readonly method = 'get' as const
	readonly description = 'Active stops on a thread with per-kind resolution actions (T14)'
	readonly inputSchema = GetNeedsYouPanelControllerInputSchema
	readonly outputSchema = GetNeedsYouPanelControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: GetNeedsYouPanel) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}
