// packages/api/typescript/src/agent/entities/McpToolApproval.ts — arquivo final COMPLETO
import { createHash } from 'node:crypto'
import { AggregateRoot, BaseError, z } from '@codm/core-typescript'
import type Z from 'zod'
import { McpApprovalDecision } from '@codm/contracts-typescript/wire/enums'
import type { AgentDomainErrors } from '../errors'

/**
 * A identidade de UMA chamada, para efeito de aprovação.
 *
 * Canonicalizada porque "a mesma chamada" precisa ser DECIDÍVEL: sem ordenar as chaves, o mesmo objeto
 * serializado por dois caminhos produziria hashes diferentes e o replay nunca casaria; sem incluir o
 * servidor e a ferramenta, argumentos iguais em ferramentas diferentes casariam entre si — que é a
 * falha perigosa, não a inconveniente.
 */
export function canonicalCallHash(input: { serverKey: string; toolName: string; args: unknown }): string {
	const canonical = JSON.stringify([input.serverKey, input.toolName, sortDeep(input.args)])
	return createHash('sha256').update(canonical).digest('hex')
}

function sortDeep(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortDeep)
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([k, v]) => [k, sortDeep(v)]),
		)
	return value
}

/**
 * `McpToolApproval` — a decisão do dono sobre UMA chamada de ferramenta externa.
 *
 * Não é log e não é evento: tem transição de estado dirigida por humano (PENDENTE → APPROVED | DENIED)
 * e a invariante de não reabrir decisão. É também o que torna o replay decidível — o proxy grava
 * PENDENTE com o `stopId` que levantou, o handler faz o flip POR `stopId`, e a chamada repetida
 * procura por `(issueId, callHash)`.
 */
export const McpToolApprovalSchema = z.object({
	ownerId: z.uuid(),
	issueId: z.uuid(),
	threadId: z.uuid(),
	serverKey: z.string(),
	toolName: z.string(),
	callHash: z.string(),
	callArguments: z.record(z.string(), z.unknown()),
	decision: z.enum(McpApprovalDecision).optional(),
	stopId: z.uuid(),
	requestedAt: z.date(),
	settledAt: z.date().optional(),
})

export type McpToolApprovalProps = Z.infer<typeof McpToolApprovalSchema>

export class McpToolApproval extends AggregateRoot<typeof McpToolApprovalSchema> {
	static override schema = McpToolApprovalSchema

	static request(data: {
		ownerId: string
		issueId: string
		threadId: string
		serverKey: string
		toolName: string
		args: Record<string, unknown>
		stopId: string
	}): McpToolApproval {
		return new McpToolApproval({
			ownerId: data.ownerId,
			issueId: data.issueId,
			threadId: data.threadId,
			serverKey: data.serverKey,
			toolName: data.toolName,
			callHash: canonicalCallHash({ serverKey: data.serverKey, toolName: data.toolName, args: data.args }),
			callArguments: data.args,
			stopId: data.stopId,
			requestedAt: new Date(),
		})
	}

	get isPending(): boolean {
		return this.decision === undefined
	}

	get grantsExecution(): boolean {
		return this.decision === McpApprovalDecision.APPROVED
	}

	/** Uma decisão já respondida NÃO reabre — nem para o mesmo veredito. */
	settle(decision: McpApprovalDecision): void {
		if (!this.isPending)
			throw new BaseError<AgentDomainErrors>('MCP_APPROVAL_ALREADY_SETTLED', `approval ${this.id.value} is already ${this.decision}`)
		this.decision = decision
		this.settledAt = new Date()
		this.validate()
	}

	/**
	 * PERGUNTAR DE NOVO a mesma chamada — o caminho do dono que mudou de ideia.
	 *
	 * NÃO é o inverso de `settle`, e a diferença é o ponto: `settle` recusa reabrir porque um
	 * veredito não pode virar outro EM SILÊNCIO, pelas costas de quem respondeu. Aqui o dono está
	 * sendo perguntado OUTRA VEZ, explicitamente, e o novo stop é a nova pergunta — a antiga
	 * continua registrada em `issue_stops` com a resposta que recebeu.
	 *
	 * Por que reabrir a linha em vez de inserir outra: o par `(issueId, callHash)` é ÚNICO, porque a
	 * tabela responde "esta chamada pode rodar AGORA?" e essa pergunta tem uma resposta só. Duas
	 * linhas foi exatamente o defeito — a leitura virava loteria e o card do dono multiplicava.
	 */
	reask(stopId: string): void {
		this.decision = undefined
		this.settledAt = undefined
		this.stopId = stopId
		this.requestedAt = new Date()
		this.validate()
	}
}

export interface McpToolApproval extends McpToolApprovalProps {}
