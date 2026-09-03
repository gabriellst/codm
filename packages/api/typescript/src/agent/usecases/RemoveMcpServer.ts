// packages/api/typescript/src/agent/usecases/RemoveMcpServer.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { BaseError, Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { McpServerRepository } from '../repositories/McpServerRepository'
import type { AgentApplicationErrors } from '../errors'

export const RemoveMcpServerInputSchema = z.object({ ownerId: z.uuid(), mcpServerId: z.string() })
export const RemoveMcpServerOutputSchema = z.void()

@injectable()
export class RemoveMcpServer extends Handler<typeof RemoveMcpServerInputSchema, typeof RemoveMcpServerOutputSchema> {
	readonly name = 'remove_mcp_server' as const
	readonly inputSchema = RemoveMcpServerInputSchema
	readonly outputSchema = RemoveMcpServerOutputSchema

	constructor(private servers: McpServerRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const server = await this.servers.findById(input.mcpServerId, tx)
		if (!server || server.ownerId !== input.ownerId) throw new BaseError<AgentApplicationErrors>('MCP_SERVER_NOT_FOUND')

		return this.withTransaction(tx, async tx => {
			await this.servers.delete(server.id.value, tx)
		})
	}
}
