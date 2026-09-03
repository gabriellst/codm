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

/**
 * O texto que o dono lê no card. Carrega servidor, ferramenta e ARGUMENTOS — sem os argumentos a
 * pergunta é "posso rodar um comando?", que não é uma pergunta que alguém consiga responder.
 */
function describeCall(input: { serverKey: string; toolName: string; args: Record<string, unknown> }): string {
	const serialized = JSON.stringify(input.args)
	const preview =
		serialized.length > ARGS_PREVIEW_LIMIT
			? `${serialized.slice(0, ARGS_PREVIEW_LIMIT)}… (${serialized.length} caracteres no total)`
			: serialized
	return `O agente quer executar "${input.toolName}" do servidor MCP "${input.serverKey}" com: ${preview}`
}
