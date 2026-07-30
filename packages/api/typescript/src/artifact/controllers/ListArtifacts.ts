import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { OperatorMiddleware } from '@auth/middlewares'
import { ListArtifacts, ListArtifactsOutputSchema } from '../usecases/ListArtifacts'

export const ListArtifactsControllerInputSchema = z
	.object({ ctx: z.object({ ownerId: z.uuid() }), params: z.object({ threadId: z.uuid() }) })
	.example([{ ctx: { ownerId: '00000000-0000-4000-8000-000000000001' }, params: { threadId: '019e4d24-6524-7041-9e1c-8108180cddae' } }])
export const ListArtifactsControllerOutputSchema = ListArtifactsOutputSchema

// T13
@injectable()
export class ListArtifactsController extends Controller<
	typeof ListArtifactsControllerInputSchema,
	typeof ListArtifactsControllerOutputSchema
> {
	/** Reachable as an MCP tool under this surface — see `agent/mcp/exposure.ts`. */
	static override readonly mcpScopes = [McpScope.system]
	readonly path = '/threads/:threadId/artifacts'
	readonly method = 'get' as const
	readonly description = 'The non-code outputs of a thread (T13)'
	readonly inputSchema = ListArtifactsControllerInputSchema
	readonly outputSchema = ListArtifactsControllerOutputSchema
	override middlewares = [OperatorMiddleware]
	constructor(private query: ListArtifacts) {
		super()
	}
	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.query.execute({ ownerId: request.ctx.ownerId, threadId: request.params.threadId })
		return { status: HttpStatusCode.OK, data }
	}
}
