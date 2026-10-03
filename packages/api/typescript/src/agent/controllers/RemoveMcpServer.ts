// packages/api/typescript/src/agent/controllers/RemoveMcpServer.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { RemoveMcpServer } from '../usecases/RemoveMcpServer'

export const RemoveMcpServerControllerInputSchema = z
	.object({
		ctx: z.object({ session: z.object({ ownerId: z.string() }) }),
		params: z.object({ mcpServerId: z.string() }),
	})
	.example([
		{
			ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cdd01' } },
			params: { mcpServerId: '019e4d24-6524-7041-9e1c-8108180cdd0a' },
		},
	])
export const RemoveMcpServerControllerOutputSchema = z.void()

@injectable()
export class RemoveMcpServerController extends Controller<
	typeof RemoveMcpServerControllerInputSchema,
	typeof RemoveMcpServerControllerOutputSchema
> {
	readonly path = '/mcp-servers/:mcpServerId'
	readonly method = 'delete' as const
	readonly description = 'Remove a registered MCP server'
	readonly inputSchema = RemoveMcpServerControllerInputSchema
	readonly outputSchema = RemoveMcpServerControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]

	constructor(private usecase: RemoveMcpServer) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		await this.usecase.execute({ ownerId: request.ctx.session.ownerId, mcpServerId: request.params.mcpServerId })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
