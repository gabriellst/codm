import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { OpenIssuesReader } from '@thread/services/OpenIssuesReader'
import { ReopenIssue } from '@issue/usecases/ReopenIssue'
import { MailboxRepository } from '../repositories/MailboxRepository'
import type { AgentInterfaceErrors } from '../errors'

export const SteerIssueTurnInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	issueId: z.uuid(),
	/** A entrada do transcript que o orquestrador respondia quando decidiu steerar — a chave de dedup. */
	entryId: z.uuid().optional(),
	text: z.string().trim().min(1),
})
export const SteerIssueTurnOutputSchema = z.object({ issueId: z.uuid(), queued: z.boolean() })

/**
 * Redireciona trabalho para uma issue desta thread — reabrindo-a quando já concluiu.
 *
 * ### Por que isto é um use case e não ficou no controller
 * Reabrir e enfileirar precisam commitar JUNTOS. Um controller não abre transação (só `Handler` tem
 * `withTransaction`), e sem transação existiriam dois estados impossíveis de explicar depois: uma
 * issue em `WORKING` sem nada na fila (o agente nunca acorda, e a console mostra trabalho que não
 * existe) ou um `STEER` enfileirado contra uma issue ainda `COMPLETED` (o turno roda e falha ao
 * concluir de novo). O `SteerThread` vizinho já resolve o mesmo problema do mesmo jeito.
 *
 * ### A recusa é deliberadamente cega
 * `steerableIssue` devolve `undefined` tanto para "não é desta thread" quanto para "está arquivada", e
 * este método transforma os dois no MESMO erro com a MESMA mensagem. Responder diferente diria ao
 * chamador se um uuid existe — e o chamador aqui é um modelo de linguagem com um token de run.
 */
@injectable()
export class SteerIssueTurn extends Handler<typeof SteerIssueTurnInputSchema, typeof SteerIssueTurnOutputSchema> {
	readonly name = 'steer_issue_turn' as const
	readonly inputSchema = SteerIssueTurnInputSchema
	readonly outputSchema = SteerIssueTurnOutputSchema

	constructor(
		private readonly openIssues: OpenIssuesReader,
		private readonly reopenIssue: ReopenIssue,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const target = await this.openIssues.steerableIssue(input.threadId, input.issueId)
		if (!target) {
			throw new BaseError<AgentInterfaceErrors>('AGENT_RUN_SCOPE_MISMATCH', 'no steerable issue with that id on this thread')
		}

		return this.withTransaction(tx, async tx => {
			// Só reabre o que NÃO está trabalhando: chamar `reopen()` numa issue em `WORKING` levantaria
			// `ISSUE_NOT_REOPENABLE` e derrubaria um steer perfeitamente válido de trabalho em andamento,
			// que é o caso mais comum deste endpoint. A pergunta vem pronta do reader — este contexto não
			// olha o ciclo de vida da issue, só o que fazer antes de enfileirar.
			if (target.needsReopen) {
				await this.reopenIssue.execute({ ownerId: input.ownerId, issueId: input.issueId }, tx)
			}

			const queued = await this.mailbox.enqueue(
				{
					ownerId: input.ownerId,
					targetKind: MailboxTargetKind.ISSUE,
					targetId: input.issueId,
					kind: MailboxItemKind.STEER,
					payload: { issueId: input.issueId, threadId: input.threadId, key: target.key, title: target.title, text: input.text },
					// Dois steers de dois turnos são dois itens; o mesmo turno repetido é um só.
					dedupKey: `steer:${input.entryId ?? input.issueId}:${input.issueId}`,
				},
				tx,
			)

			return { issueId: input.issueId, queued }
		})
	}
}
