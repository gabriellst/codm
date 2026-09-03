// packages/api/typescript/src/agent/services/McpUpstreamRegistry/MockMcpUpstreamRegistry.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { McpUpstreamRegistry, type UpstreamCallResult, type UpstreamTool } from './McpUpstreamRegistry'

/**
 * O upstream em memória. Existe para que um teste de integração prove o GATE sem nenhum servidor MCP
 * de terceiro instalado — e `calls` é o contador que torna "não executou" uma medição em vez de uma
 * inferência a partir da ausência de exceção.
 */
@injectable()
export class MockMcpUpstreamRegistry extends McpUpstreamRegistry {
	tools: UpstreamTool[] = []
	readonly calls: { serverKey: string; toolName: string; args: Record<string, unknown> }[] = []
	result: UpstreamCallResult = { content: [{ type: 'text', text: 'ok' }] }

	async listTools(): Promise<UpstreamTool[]> {
		return this.tools
	}

	async call(input: { serverKey: string; toolName: string; args: Record<string, unknown> }): Promise<UpstreamCallResult> {
		this.calls.push({ serverKey: input.serverKey, toolName: input.toolName, args: input.args })
		return this.result
	}

	async shutdown(): Promise<void> {
		// Nothing to release — this registry never owns a process or a connection.
	}
}
