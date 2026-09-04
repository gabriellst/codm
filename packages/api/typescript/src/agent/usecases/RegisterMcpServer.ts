// packages/api/typescript/src/agent/usecases/RegisterMcpServer.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { McpApprovalPolicy, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { McpServer } from '../entities/McpServer'
import { McpServerRepository } from '../repositories/McpServerRepository'
import type { AgentApplicationErrors } from '../errors'

export const RegisterMcpServerInputSchema = z.object({
	ownerId: z.uuid(),
	key: z.string(),
	transport: z.enum(McpTransport),
	command: z.string().optional(),
	args: z.array(z.string()).optional(),
	env: z.record(z.string(), z.string()).optional(),
	url: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	approvalPolicy: z.enum(McpApprovalPolicy).optional(),
})
export const RegisterMcpServerOutputSchema = z.object({ mcpServerId: z.string() })

/**
 * A colisão de key é checada AQUI e indexada no banco. Não é redundância: a checagem produz o erro
 * NOMEADO que o console mostra, e o índice é o que resolve duas requisições concorrentes — nenhuma das
 * duas sozinha cobre o caso da outra.
 */
@injectable()
export class RegisterMcpServer extends Handler<typeof RegisterMcpServerInputSchema, typeof RegisterMcpServerOutputSchema> {
	readonly name = 'register_mcp_server' as const
	readonly inputSchema = RegisterMcpServerInputSchema
	readonly outputSchema = RegisterMcpServerOutputSchema

	constructor(private servers: McpServerRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const existing = await this.servers.findByKey(input.ownerId, input.key, tx)
		if (existing)
			throw new BaseError<AgentApplicationErrors>('MCP_SERVER_KEY_CONFLICT', `an MCP server with key "${input.key}" is already registered`)

		const server = McpServer.create(input)
		try {
			await this.withTransaction(tx, async tx => {
				await this.servers.save(server, tx)
			})
		} catch (error) {
			// A checagem acima é o caminho NORMAL e continua sendo — ela devolve o erro nomeado sem
			// gastar uma escrita. Este catch é a rede para a CORRIDA: dois cadastros simultâneos da mesma
			// key passam os dois pela leitura e só o índice único os separa, e aí o que chega ao dono
			// seria um erro cru do driver (500) no lugar do 409 que o contrato promete. Janela minúscula,
			// resposta consistente.
			if (error instanceof Error && error.message.includes('agent_mcp_servers.owner_id') && error.message.includes('agent_mcp_servers.key'))
				throw new BaseError<AgentApplicationErrors>(
					'MCP_SERVER_KEY_CONFLICT',
					`an MCP server with key "${input.key}" is already registered`,
				)
			throw error
		}
		return { mcpServerId: server.id.value }
	}
}
