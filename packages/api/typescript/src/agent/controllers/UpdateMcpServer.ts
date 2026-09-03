// packages/api/typescript/src/agent/controllers/UpdateMcpServer.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@codm/core-typescript'
import { McpApprovalPolicy } from '@codm/contracts-typescript/wire/enums'
import { CloudSessionMiddleware } from '@shared/middlewares'
import { UpdateMcpServer } from '../usecases/UpdateMcpServer'
import { McpServerConfigSchema } from './RegisterMcpServer'

/**
 * `enabled`/`approvalPolicy` opcionais MAIS, opcionalmente, uma reconfiguração de transporte inteira —
 * a união IMPORTADA de `RegisterMcpServer`, nunca uma segunda declaração dela. Meio transporte não é
 * enviável: ou vem a variante completa, ou não vem nada.
 */
export const UpdateMcpServerControllerInputSchema = z
	.object({
		ctx: z.object({ session: z.object({ ownerId: z.string() }) }),
		params: z.object({ mcpServerId: z.string() }),
		body: z.object({
			enabled: z.boolean().optional(),
			approvalPolicy: z.enum(McpApprovalPolicy).optional(),
			/** Override por ferramenta. `policy: null` remove; ausente não mexe. */
			toolPolicy: z.object({ toolName: z.string().min(1), policy: z.enum(McpApprovalPolicy).nullable() }).optional(),
			config: McpServerConfigSchema.optional(),
		}),
	})
	.example([
		{
			ctx: { session: { ownerId: '019e4d24-6524-7041-9e1c-8108180cdd01' } },
			params: { mcpServerId: '019e4d24-6524-7041-9e1c-8108180cdd0a' },
			body: { approvalPolicy: McpApprovalPolicy.AUTO },
		},
	])
export const UpdateMcpServerControllerOutputSchema = z.void()

@injectable()
export class UpdateMcpServerController extends Controller<
	typeof UpdateMcpServerControllerInputSchema,
	typeof UpdateMcpServerControllerOutputSchema
> {
	readonly path = '/mcp-servers/:mcpServerId'
	readonly method = 'patch' as const
	readonly description = 'Enable, disable, repolicy or reconfigure a registered MCP server'
	readonly inputSchema = UpdateMcpServerControllerInputSchema
	readonly outputSchema = UpdateMcpServerControllerOutputSchema
	override middlewares = [CloudSessionMiddleware]

	constructor(private usecase: UpdateMcpServer) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const { enabled, approvalPolicy, toolPolicy, config } = request.body
		await this.usecase.execute({
			ownerId: request.ctx.session.ownerId,
			mcpServerId: request.params.mcpServerId,
			enabled,
			approvalPolicy,
			toolPolicy,
			...(config ?? {}),
		})
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}
