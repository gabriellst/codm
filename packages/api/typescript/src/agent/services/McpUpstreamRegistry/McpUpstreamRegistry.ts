// packages/api/typescript/src/agent/services/McpUpstreamRegistry/McpUpstreamRegistry.ts — arquivo final COMPLETO
import type { McpApprovalPolicy } from '@codm/contracts-typescript/wire/enums'

/** Uma ferramenta que um servidor de terceiro publicou. O `inputSchema` é JSON Schema VERBATIM. */
export interface UpstreamTool {
	serverKey: string
	name: string
	description?: string
	inputSchema: unknown
	approvalPolicy: McpApprovalPolicy
}

/** O resultado de um `tools/call` upstream, no formato que o MCP já define. */
export interface UpstreamCallResult {
	content: unknown[]
	isError?: boolean
}

/**
 * O daemon como CLIENTE MCP — a metade que este produto nunca teve.
 *
 * Um serviço de aplicação, não de domínio: fala com processos e sockets, e é justamente por isso que
 * existe atrás de um contrato abstrato. `MockMcpUpstreamRegistry` é o que permite a um teste de
 * integração provar o gate sem nenhum servidor de terceiro instalado na máquina do CI.
 *
 * `shutdown` não é higiene opcional. Os servidores STDIO deixam de ser filhos do CLI do provedor e
 * passam a ser filhos DESTE processo — a inversão que o docblock de `ProcessTree` descreve — então
 * quem não os derruba, vaza.
 */
export abstract class McpUpstreamRegistry {
	/** As ferramentas de todos os servidores HABILITADOS deste dono, já namespeadas por `serverKey`. */
	abstract listTools(ownerId: string): Promise<UpstreamTool[]>
	/** Encaminha uma chamada. NÃO decide política — quem decide é `mcp/approvalPolicy.ts`. */
	abstract call(input: { ownerId: string; serverKey: string; toolName: string; args: Record<string, unknown> }): Promise<UpstreamCallResult>
	/** Derruba todo processo/conexão que este registry ainda detém. Idempotente. */
	abstract shutdown(): Promise<void>
	/**
	 * Esquecer o que sabemos de um servidor — a conexão viva e as ferramentas cacheadas.
	 *
	 * Existe porque o cache aqui é por CHAVE, e a chave não muda quando a configuração muda. Sem uma
	 * porta de invalidação, editar `command`/`env` continuava servindo o processo velho até o daemon
	 * reiniciar: o dono corrige a configuração, salva, e nada acontece — sem erro nenhum, que é a
	 * pior forma de falhar. Desabilitar ou remover tinha o gêmeo disso: a chamada passava a ser
	 * recusada (o `call` re-checa `enabled`), mas o PROCESSO seguia vivo.
	 */
	abstract evict(ownerId: string, serverKey: string): Promise<void>
}
