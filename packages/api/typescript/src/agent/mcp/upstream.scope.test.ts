// packages/api/typescript/src/agent/mcp/upstream.scope.test.ts — arquivo final COMPLETO
import { describe, it, expect } from 'bun:test'
import { McpScope, McpApprovalPolicy } from '@codm/contracts-typescript/wire/enums'
import { withUpstream, upstreamToolName } from './upstream'
import type { UpstreamTool } from '../services/McpUpstreamRegistry'

/**
 * TASK T6 — o invariante de SEGURANÇA que o caminho feliz do T5 não prova.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * `withUpstream` em si não conhece escopo — quem decide "só issue-handling" é `McpDoorController.
 * buildTransport` (ver o docblock de `door.ts`). O que este arquivo prova é a PROPRIEDADE que torna
 * essa decisão suficiente: mesmo que um binding com ferramentas de terceiro chegasse embrulhando o
 * transporte de outro escopo, uma chamada nomeando uma ferramenta que o binding NÃO carrega nunca é
 * interceptada — ela cai para o servidor gerado, que recusa por não conhecer o nome. Não há um
 * segundo caminho silencioso por onde uma ferramenta de shell escaparia para a superfície que lê
 * texto de terceiro (grupo de WhatsApp, thread) sem jamais ter sido registrada ali.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */

const SHELL: UpstreamTool = {
	serverKey: 'shell',
	name: 'run',
	inputSchema: { type: 'object', properties: { cmd: { type: 'string' } } },
	approvalPolicy: McpApprovalPolicy.AUTO,
}

describe('a fronteira é o escopo, não a lista no cliente', () => {
	it('mesmo se um binding vazasse para outro escopo, uma chamada a ferramenta desconhecida não é interceptada', async () => {
		let innerCalls = 0
		const inner = {
			handleRequest: async () => {
				innerCalls += 1
				return Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Tool shell__run not found' } })
			},
		}
		const wrapped = withUpstream(inner, {
			scope: McpScope.ISSUE_HANDLING,
			tools: [],
			call: async () => {
				throw new Error('não deveria ser chamado')
			},
		})

		const response = await wrapped.handleRequest(
			new Request('http://127.0.0.1/mcp/orchestration', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name: upstreamToolName(SHELL), arguments: { cmd: 'rm -rf /' } },
				}),
			}),
		)

		// Sem a ferramenta no binding, a chamada VAI para o servidor gerado, que não a conhece e recusa.
		expect(innerCalls).toBe(1)
		expect((await response.json()).error.code).toBe(-32602)
	})
})
