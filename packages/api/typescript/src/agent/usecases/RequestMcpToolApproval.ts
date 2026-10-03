// packages/api/typescript/src/agent/usecases/RequestMcpToolApproval.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { McpToolApproval, canonicalCallHash } from '../entities/McpToolApproval'
import { McpToolApprovalRepository } from '../repositories/McpToolApprovalRepository'
import { DeclareStop } from './DeclareStop'

export const RequestMcpToolApprovalInputSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	serverKey: z.string(),
	toolName: z.string(),
	args: z.record(z.string(), z.unknown()),
})
export const RequestMcpToolApprovalOutputSchema = z.object({ stopId: z.uuid() })

/**
 * O modelo NÃO chama isto — o PROXY chama, em nome dele, ao interceptar uma ferramenta `ASK`.
 *
 * É a diferença entre este caminho e o `RaiseStop`: lá o modelo escolhe pedir aprovação e escolhe o
 * kind, o que faz do gate uma gentileza. Aqui a decisão é do produto, e por isso nenhum campo de
 * identidade vem de argumento — `ownerId`/`issueId`/`threadId` saem do token de run que o door já
 * resolveu.
 *
 * Reaproveita um pedido PENDENTE idêntico em vez de levantar um segundo stop: um modelo que insiste
 * na mesma chamada a cada turno encheria o card Needs-you de perguntas iguais, e o dono responderia
 * uma delas enquanto as outras ficariam abertas para sempre.
 */
@injectable()
export class RequestMcpToolApproval extends Handler<typeof RequestMcpToolApprovalInputSchema, typeof RequestMcpToolApprovalOutputSchema> {
	readonly name = 'request_mcp_tool_approval' as const
	readonly inputSchema = RequestMcpToolApprovalInputSchema
	readonly outputSchema = RequestMcpToolApprovalOutputSchema

	constructor(
		private approvals: McpToolApprovalRepository,
		private declareStop: DeclareStop,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const callHash = canonicalCallHash({ serverKey: input.serverKey, toolName: input.toolName, args: input.args })

		// PENDENTE, e não "qualquer uma": reaproveitar um card que o dono JÁ respondeu seria devolver
		// um stop resolvido, que ele nunca mais vai ver. Esta é a metade do dedup que faz o Needs-you
		// não multiplicar dentro de um mesmo turno.
		const pending = await this.approvals.findPendingByCall(input.issueId, callHash, tx)
		if (pending) return { stopId: pending.stopId }

		// UMA transação para os dois. O stop é a PERGUNTA e a linha é o que a resposta vai encontrar:
		// gravar o stop e falhar ao gravar a linha deixaria um card no Needs-you cuja aprovação não
		// libera nada — e o dono não teria como saber disso.
		return this.withTransaction(tx, async tx => {
			const { stopId } = await this.declareStop.execute(
				{
					ownerId: input.ownerId,
					issueId: input.issueId,
					threadId: input.threadId,
					kind: StopKind.APPROVAL_NEEDED,
					detail: describeCall(input),
				},
				tx,
			)

			// A linha JÁ DECIDIDA do mesmo par é REABERTA, nunca duplicada: `(issueId, callHash)` é
			// único, e a tabela responde "pode rodar agora?" — uma pergunta com uma resposta só. O
			// histórico de que houve um DENY antes fica em `issue_stops`, com a sua resolução.
			const settled = await this.approvals.findByCall(input.issueId, callHash, tx)
			if (settled) {
				settled.reask(stopId)
				await this.approvals.save(settled, tx)
				return { stopId }
			}

			await this.approvals.save(
				McpToolApproval.request({
					ownerId: input.ownerId,
					issueId: input.issueId,
					threadId: input.threadId,
					serverKey: input.serverKey,
					toolName: input.toolName,
					args: input.args,
					stopId,
				}),
				tx,
			)
			return { stopId }
		})
	}
}

/**
 * O limite de pré-visualização dos argumentos no card.
 *
 * Este texto vai para a tela em que o dono decide sob pressão, no meio de um turno do agente. Um
 * `JSON.stringify` cru de um argumento grande (o conteúdo de um arquivo, um payload) vira uma
 * parede que empurra a PERGUNTA para fora da vista — e a pergunta é a única coisa que o card
 * precisa entregar. O hash canônico, que é o que de fato identifica a chamada, não depende disto.
 */
const ARGS_PREVIEW_LIMIT = 300

/** O que substitui um valor sensível no texto do card. Curto de propósito: ele divide espaço com a pergunta. */
const REDACTED = '***'

/**
 * Nomes de argumento cujo VALOR não pode ir para o texto do stop.
 *
 * Casa por PALAVRA, não por substring: a chave é quebrada em camelCase, `snake_case` e `kebab-case`
 * e cada pedaço é comparado com este conjunto. `apiKey` e `access_token` casam; `keyboard` e
 * `monkey` não — que é exatamente o que um `/key/i` solto erraria.
 *
 * `key` está aqui sozinho, e a escolha é assimétrica de propósito. Ele super-mascara: uma ferramenta
 * de key-value store com um argumento `key` legítimo perde o valor no card. O dono ainda vê a
 * ferramenta, o servidor e a FORMA dos argumentos, então a pergunta continua respondível. O erro na
 * outra direção não tem volta: um segredo que escapa fica gravado em duas cópias nossas
 * (`call_arguments` e `issue_stops.detail`), em claro, para sempre.
 */
const SENSITIVE_WORDS = new Set([
	'token',
	'secret',
	'password',
	'passwd',
	'pwd',
	'senha',
	'credential',
	'credentials',
	'auth',
	'authorization',
	'apikey',
	'key',
	'bearer',
	'signature',
	'cookie',
	'session',
])

/** `accessToken` / `access_token` / `access-token` → `['access','token']`. */
function wordsOf(key: string): string[] {
	return key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[\s_\-.]+/)
		.map(w => w.toLowerCase())
		.filter(Boolean)
}

function isSensitiveKey(key: string): boolean {
	return wordsOf(key).some(w => SENSITIVE_WORDS.has(w))
}

/**
 * A cópia dos argumentos que pode ser LIDA por um humano — nunca a que é hasheada.
 *
 * Exportada porque a separação entre "o que o dono vê" e "o que identifica a chamada" é a coisa que
 * um teste precisa poder afirmar sozinha, sem montar um use case inteiro.
 *
 * A recursão desce em objetos e arrays: um segredo aninhado (`{ config: { apiKey } }`) é o caso
 * comum, não a exceção, e um mascaramento raso daria a falsa impressão de cobertura.
 */
export function maskSensitiveArgs(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(maskSensitiveArgs)
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, isSensitiveKey(k) ? REDACTED : maskSensitiveArgs(v)]),
		)
	return value
}

/**
 * O texto que o dono lê no card. Carrega servidor, ferramenta e ARGUMENTOS — sem os argumentos a
 * pergunta é "posso rodar um comando?", que não é uma pergunta que alguém consiga responder.
 *
 * OS ARGUMENTOS SENSÍVEIS SÃO MASCARADOS AQUI, E SÓ AQUI. A assimetria é o desenho inteiro:
 *
 *   - o TEXTO é mascarado, porque ele é persistido em `issue_stops.detail` e renderizado numa tela;
 *   - o `canonicalCallHash` continua sobre os argumentos COMPLETOS, na entidade, intocado.
 *
 * Inverter isso seria pior do que não mascarar nada. Um hash calculado sobre a forma mascarada faria
 * duas chamadas com segredos DIFERENTES colidirem no mesmo `callHash` — e como o par
 * `(issueId, callHash)` é único e responde "esta chamada pode rodar agora?", uma aprovação dada para
 * uma delas passaria a valer para a outra. O mascaramento viraria uma escalada de privilégio.
 */
function describeCall(input: { serverKey: string; toolName: string; args: Record<string, unknown> }): string {
	const serialized = JSON.stringify(maskSensitiveArgs(input.args))
	const preview =
		serialized.length > ARGS_PREVIEW_LIMIT
			? `${serialized.slice(0, ARGS_PREVIEW_LIMIT)}… (${serialized.length} caracteres no total)`
			: serialized
	return `O agente quer executar "${input.toolName}" do servidor MCP "${input.serverKey}" com: ${preview}`
}
