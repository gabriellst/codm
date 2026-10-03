// packages/api/typescript/src/agent/mcp/upstream.ts — arquivo final COMPLETO
import type { McpScope } from '@codm/contracts-typescript/wire/enums'
import type { UpstreamCallResult, UpstreamTool } from '../services/McpUpstreamRegistry'

export type { UpstreamTool }

/** O separador entre a key do servidor e o nome da ferramenta dele, dentro da NOSSA porta. */
export const UPSTREAM_NAME_SEPARATOR = '__'

/** Só o que precisamos do transporte — assinatura mínima para o teste substituir sem subir socket. */
export interface RequestHandling {
	handleRequest(request: Request): Promise<Response>
}

export interface UpstreamBinding {
	scope: McpScope
	tools: readonly UpstreamTool[]
	call(input: { serverKey: string; toolName: string; args: Record<string, unknown> }): Promise<UpstreamCallResult>
}

/** `playwright` + `browser_navigate` → `playwright__browser_navigate`. */
export function upstreamToolName(tool: UpstreamTool): string {
	return `${tool.serverKey}${UPSTREAM_NAME_SEPARATOR}${tool.name}`
}

/**
 * Envolve o transporte da porta para que as ferramentas upstream existam ao lado das geradas.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 * POR QUE O TRANSPORTE E NÃO O SERVIDOR — os três fatos medidos (ver o Step T5.0 do plano):
 * `registerTool` só aceita Zod (`AnySchema = z3.ZodTypeAny | z4.$ZodType`), o zod instalado não tem a
 * inversa de `toJSONSchema`, e `setRequestHandler` SUBSTITUI o handler gerado sem oferecer leitura do
 * antigo. Compor aqui é o único ponto em que o `inputSchema` do upstream atravessa VERBATIM — e um
 * schema convertido por conversor caseiro seria uma degradação silenciosa: o sintoma é o modelo
 * chamando a ferramenta errado, não um erro.
 *
 * O door constrói o transporte com `enableJsonResponse: true`, então a resposta é JSON e não SSE. É
 * essa escolha, já tomada por outro motivo, que torna a fusão do `tools/list` uma leitura de corpo em
 * vez de um parser de stream.
 *
 * O que NÃO acontece aqui: decidir política. Este módulo encaminha; quem decide entre executar e
 * gatear é `approvalPolicy.ts`, chamado pelo `call` que o door injeta.
 * ─────────────────────────────────────────────────────────────────────────────────────────────────
 */
export function withUpstream(inner: RequestHandling, binding: UpstreamBinding): RequestHandling {
	if (binding.tools.length === 0) return inner

	const byName = new Map(binding.tools.map(tool => [upstreamToolName(tool), tool]))

	return {
		async handleRequest(request: Request): Promise<Response> {
			// O corpo é lido UMA vez e a requisição é reconstruída para o transporte interno: um
			// `Request` tem corpo de uso único, e repassar o original já drenado dava 400 no
			// transporte com uma mensagem que não menciona o corpo.
			const raw = await request.text()
			const message = parseJsonObject(raw)
			const method = typeof message?.method === 'string' ? message.method : undefined

			if (method === 'tools/call') {
				const params = message?.params
				const name = params && typeof params === 'object' && 'name' in params && typeof params.name === 'string' ? params.name : undefined
				const tool = name ? byName.get(name) : undefined
				if (tool) {
					const args =
						params &&
						typeof params === 'object' &&
						'arguments' in params &&
						typeof params.arguments === 'object' &&
						params.arguments !== null
							? (params.arguments as Record<string, unknown>)
							: {}
					const result = await binding.call({ serverKey: tool.serverKey, toolName: tool.name, args })
					return Response.json({ jsonrpc: '2.0', id: message?.id ?? null, result })
				}
			}

			const response = await inner.handleRequest(replay(request, raw))
			if (method !== 'tools/list') return response

			const body = parseJsonObject(await response.text())
			const result = body?.result
			if (!body || !result || typeof result !== 'object') return Response.json(body ?? {}, { status: response.status })

			const ours = 'tools' in result && Array.isArray(result.tools) ? result.tools : []
			const mergedResult = {
				...result,
				tools: [
					...ours,
					...binding.tools.map(tool => ({
						name: upstreamToolName(tool),
						description: tool.description,
						// VERBATIM. Ver o docblock.
						inputSchema: tool.inputSchema,
					})),
				],
			}
			return Response.json({ ...body, result: mergedResult }, { status: response.status })
		},
	}
}

function replay(request: Request, body: string): Request {
	return new Request(request.url, { method: request.method, headers: request.headers, body })
}

/** JSON-RPC é um objeto arbitrário na fronteira — `unknown`, nunca `any`, com narrowing em cada leitura. */
function parseJsonObject(raw: string): Record<string, unknown> | undefined {
	try {
		const parsed: unknown = JSON.parse(raw)
		return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined
	} catch {
		return undefined
	}
}
