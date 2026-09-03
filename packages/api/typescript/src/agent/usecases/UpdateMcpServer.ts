// packages/api/typescript/src/agent/usecases/UpdateMcpServer.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { McpApprovalPolicy, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { McpServerRepository } from '../repositories/McpServerRepository'
import type { AgentApplicationErrors } from '../errors'

export const UpdateMcpServerInputSchema = z.object({
	ownerId: z.uuid(),
	mcpServerId: z.string(),
	enabled: z.boolean().optional(),
	approvalPolicy: z.enum(McpApprovalPolicy).optional(),
	/** `policy: null` remove o override; o campo ausente não mexe em override nenhum. */
	toolPolicy: z.object({ toolName: z.string(), policy: z.enum(McpApprovalPolicy).nullable() }).optional(),
	transport: z.enum(McpTransport).optional(),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	env: z.record(z.string(), z.string()).optional(),
	url: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
})
export const UpdateMcpServerOutputSchema = z.void()

@injectable()
export class UpdateMcpServer extends Handler<typeof UpdateMcpServerInputSchema, typeof UpdateMcpServerOutputSchema> {
	readonly name = 'update_mcp_server' as const
	readonly inputSchema = UpdateMcpServerInputSchema
	readonly outputSchema = UpdateMcpServerOutputSchema

	constructor(private servers: McpServerRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const server = await this.servers.findById(input.mcpServerId, tx)
		if (!server || server.ownerId !== input.ownerId) throw new BaseError<AgentApplicationErrors>('MCP_SERVER_NOT_FOUND')

		if (input.enabled === true) server.enable()
		if (input.enabled === false) server.disable()
		if (input.approvalPolicy) server.setApprovalPolicy(input.approvalPolicy)
		// `toolPolicy: null` significa "remove o override e volta a seguir o servidor" — distinto de
		// ausente, que significa "não mexe".
		if (input.toolPolicy) server.setToolPolicy(input.toolPolicy.toolName, input.toolPolicy.policy ?? undefined)
		if (input.transport)
			server.reconfigure({
				transport: input.transport,
				command: input.command,
				args: input.args,
				env: input.env,
				url: input.url,
				headers: input.headers,
			})

		return this.withTransaction(tx, async tx => {
			await this.servers.save(server, tx)
		})
	}
}
