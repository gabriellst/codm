// packages/api/typescript/src/agent/services/McpUpstreamRegistry/MockMcpUpstreamRegistry.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { McpUpstreamRegistry, type McpProbeResult, type UpstreamCallResult, type UpstreamTool } from './McpUpstreamRegistry'

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

	/**
	 * FALHAS DECLARADAS, por `serverKey` → motivo.
	 *
	 * Existe porque AUSÊNCIA e FALHA deixaram de ser a mesma coisa. Antes o mock só sabia simular "esse
	 * servidor não aparece no achatado", que era o único resultado observável quando `safeListTools`
	 * engolia a exceção. Agora o motivo sobe junto, e uma suíte que queira provar isso precisa poder
	 * DIZER qual servidor falhou e com que texto — senão o caminho de erro fica sem cobertura, que é
	 * exatamente a lacuna que deixou o `reachable` ambíguo passar despercebido.
	 */
	readonly failures = new Map<string, string>()

	/**
	 * Servidores que CONECTAM e publicam ZERO ferramentas — o caso legítimo que era indistinguível de
	 * "quebrado" antes desta mudança, e que o mock não sabia expressar: sem ferramentas semeadas, o
	 * servidor simplesmente não aparecia no mapa, exatamente como um que falhou.
	 *
	 * Sem esta declaração, um teste do caso "vazio" prova menos do que promete — ele mede ausência, não
	 * sucesso-sem-conteúdo.
	 */
	readonly connectedButEmpty = new Set<string>()

	/** Agrupa as ferramentas semeadas por `serverKey`, e respeita as falhas declaradas. */
	async listToolsByServer(): Promise<Map<string, McpProbeResult>> {
		const byServer = new Map<string, McpProbeResult>()
		for (const tool of this.tools) {
			const existing = byServer.get(tool.serverKey)
			const tools = existing?.ok ? [...existing.tools, tool] : [tool]
			byServer.set(tool.serverKey, { ok: true, tools })
		}
		for (const serverKey of this.connectedButEmpty) if (!byServer.has(serverKey)) byServer.set(serverKey, { ok: true, tools: [] })
		// A falha declarada GANHA da lista semeada: um servidor não pode estar quebrado e publicando.
		for (const [serverKey, error] of this.failures) byServer.set(serverKey, { ok: false, error })
		return byServer
	}

	async call(input: { serverKey: string; toolName: string; args: Record<string, unknown> }): Promise<UpstreamCallResult> {
		this.calls.push({ serverKey: input.serverKey, toolName: input.toolName, args: input.args })
		return this.result
	}

	async shutdown(): Promise<void> {
		// Nothing to release — this registry never owns a process or a connection.
	}

	async evict(): Promise<void> {
		// Nothing to release — this registry never owns a process or a connection to evict.
	}

	/**
	 * O veredito que a próxima sonda vai devolver. Campo, e não parâmetro de construtor com default:
	 * o container constrói este mock e o `design:paramtypes` do tsyringe tentaria resolver o tipo do
	 * parâmetro como TOKEN — o mesmo defeito silencioso que `MockMcpConfigDiscovery` documenta.
	 *
	 * Sucesso por padrão, devolvendo `tools`: a sonda é caminho feliz na maioria das suítes, e quem
	 * testa a falha declara a falha.
	 */
	probeResult: McpProbeResult | undefined

	async probe(): Promise<McpProbeResult> {
		return this.probeResult ?? { ok: true, tools: this.tools }
	}
}
