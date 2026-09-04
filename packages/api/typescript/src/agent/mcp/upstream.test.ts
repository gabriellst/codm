import { describe, it, expect } from 'bun:test'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { McpApprovalPolicy } from '@codm/contracts-typescript/wire/enums'
import { withUpstream, type UpstreamTool } from './upstream'
import { MCP_SERVER_KEY, isCodmTool, wireToolName } from './wire'

const NAVIGATE: UpstreamTool = {
	serverKey: 'playwright',
	name: 'browser_navigate',
	description: 'Navigate to a URL',
	// JSON Schema VERBATIM, como o upstream devolveu. Nada é convertido.
	inputSchema: { type: 'object', properties: { url: { type: 'string', format: 'uri' } }, required: ['url'] },
	approvalPolicy: McpApprovalPolicy.AUTO,
}

function jsonRpc(body: unknown): Request {
	return new Request('http://127.0.0.1/mcp/issue-handling', {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
		body: JSON.stringify(body),
	})
}

describe('withUpstream', () => {
	it('funde as ferramentas upstream no tools/list, namespeadas pela key', async () => {
		const inner = {
			handleRequest: async () =>
				Response.json({ jsonrpc: '2.0', id: 1, result: { tools: [{ name: 'CreateIssue', inputSchema: { type: 'object' } }] } }),
		}
		const wrapped = withUpstream(inner, { scope: McpScope.ISSUE_HANDLING, tools: [NAVIGATE], call: async () => ({ content: [] }) })

		const response = await wrapped.handleRequest(jsonRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
		const body = await response.json()
		const names = body.result.tools.map((t: { name: string }) => t.name)

		expect(names).toContain('CreateIssue')
		expect(names).toContain('playwright__browser_navigate')
	})

	it('passa o inputSchema do upstream verbatim — nada é convertido', async () => {
		const inner = { handleRequest: async () => Response.json({ jsonrpc: '2.0', id: 1, result: { tools: [] } }) }
		const wrapped = withUpstream(inner, { scope: McpScope.ISSUE_HANDLING, tools: [NAVIGATE], call: async () => ({ content: [] }) })

		const body = await (await wrapped.handleRequest(jsonRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))).json()
		expect(body.result.tools[0].inputSchema).toEqual(NAVIGATE.inputSchema)
	})

	it('encaminha o tools/call de um servidor AUTO e devolve o resultado do upstream sem reescrever', async () => {
		let received: { serverKey: string; tool: string; args: unknown } | undefined
		const inner = { handleRequest: async () => Response.json({ jsonrpc: '2.0', id: 1, result: { tools: [] } }) }
		const wrapped = withUpstream(inner, {
			scope: McpScope.ISSUE_HANDLING,
			tools: [NAVIGATE],
			call: async input => {
				received = { serverKey: input.serverKey, tool: input.toolName, args: input.args }
				return { content: [{ type: 'text', text: 'navigated' }] }
			},
		})

		const body = await (
			await wrapped.handleRequest(
				jsonRpc({
					jsonrpc: '2.0',
					id: 7,
					method: 'tools/call',
					params: { name: 'playwright__browser_navigate', arguments: { url: 'https://x.test' } },
				}),
			)
		).json()

		expect(received).toEqual({ serverKey: 'playwright', tool: 'browser_navigate', args: { url: 'https://x.test' } })
		expect(body.result.content[0].text).toBe('navigated')
	})

	it('não intercepta as NOSSAS ferramentas — elas seguem para o servidor gerado', async () => {
		let innerCalls = 0
		const inner = {
			handleRequest: async () => {
				innerCalls += 1
				return Response.json({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'ours' }] } })
			},
		}
		const wrapped = withUpstream(inner, {
			scope: McpScope.ISSUE_HANDLING,
			tools: [NAVIGATE],
			call: async () => {
				throw new Error('não deveria ser chamado')
			},
		})

		await wrapped.handleRequest(jsonRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'CreateIssue', arguments: {} } }))
		expect(innerCalls).toBe(1)
	})

	/**
	 * AC-4 — o nome de fio de uma ferramenta upstream, medido contra o vocabulário do produto.
	 *
	 * A versão anterior deste teste era uma TAUTOLOGIA: montava `mcp__codm__<key>__<tool>` com um
	 * template literal e assertava que a string começava com `mcp__codm__`. Isso é verdade sobre
	 * JavaScript, não sobre o sistema — passaria com `wireToolName` deletado, com o prefixo trocado, e
	 * com o guard anti-double-publish invertido. O que precisa ser exercido são as DUAS funções de
	 * `mcp/wire.ts` que produzem e reconhecem esse nome, porque é o par delas que sustenta a regra: o
	 * acumulador de fatos emite o frame de uma ferramenta NOSSA e nunca um fato (o fato já foi
	 * persistido pelo use case que serviu a chamada), e uma upstream é nossa no fio — ela entra na
	 * mesma declaração, sob a mesma key `codm`.
	 *
	 * É isso que faz o `isCodmTool` importar aqui: se ele NÃO reconhecesse a upstream, uma chamada a
	 * `browser_navigate` viraria um fato de turno espúrio. Se reconhecesse ferramenta de terceiro que
	 * NÃO passou pela nossa porta, o inverso.
	 */
	it('AC-4 — a ferramenta upstream recebe o nome de fio pelo vocabulário do produto, e o guard a reconhece como nossa', async () => {
		const inner = { handleRequest: async () => Response.json({ jsonrpc: '2.0', id: 1, result: { tools: [] } }) }
		const wrapped = withUpstream(inner, { scope: McpScope.ISSUE_HANDLING, tools: [NAVIGATE], call: async () => ({ content: [] }) })

		// O nome REGISTRADO sai da porta, não de um literal — é `withUpstream` quem o compõe.
		const body = await (await wrapped.handleRequest(jsonRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))).json()
		const registered = body.result.tools[0].name as string
		expect(registered).toBe('playwright__browser_navigate')

		const onTheWire = wireToolName(registered)

		// O nome que o CLI vai usar, construído por `wireToolName` e não digitado no teste.
		expect(onTheWire).toBe(`mcp__${MCP_SERVER_KEY}__playwright__browser_navigate`)
		// E reconhecido como NOSSA pelo mesmo guard que o acumulador consulta.
		expect(isCodmTool(onTheWire)).toBe(true)
		// A contraprova, sem a qual a asserção acima passaria com um guard que devolve `true` sempre.
		expect(isCodmTool('mcp__outro-servidor__browser_navigate')).toBe(false)
	})
})
