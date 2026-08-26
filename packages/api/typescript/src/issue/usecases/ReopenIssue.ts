import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueRepository } from '../repositories/IssueRepository'
import type { ApplicationErrors } from '../errors'

export const ReopenIssueInputSchema = z.object({ ownerId: z.uuid(), issueId: z.uuid() })
export const ReopenIssueOutputSchema = z.void()

/**
 * Devolve uma issue concluída ao trabalho.
 *
 * ### Por que NÃO publica evento
 * `issue/events/index.ts` declara a regra: fatos de execução (opened / completed) são publicados pelo
 * terminal engine e o BC5 REAGE a eles, não os re-publica. `IssueArchivedEvent` existe porque arquivar
 * é fato que este contexto possui. Reabrir chega por comando do operador, pela mesma porta que
 * `ArchiveIssue` e `RestoreIssue` — nenhum dos dois inventa um evento de execução, e este também não.
 *
 * ### Por que aceita `tx`
 * O chamador é `agent/usecases/SteerIssueTurn`, que precisa reabrir e enfileirar o `STEER` na MESMA
 * transação: um steer que commita sempre reabriu, e um que falha nunca deixa a issue em `WORKING` sem
 * trabalho na fila. `Handler.withTransaction` já une-se à transação recebida em vez de abrir outra.
 */
@injectable()
export class ReopenIssue extends Handler<typeof ReopenIssueInputSchema, typeof ReopenIssueOutputSchema> {
	readonly name = 'reopen_issue' as const
	readonly inputSchema = ReopenIssueInputSchema
	readonly outputSchema = ReopenIssueOutputSchema

	constructor(private readonly issues: IssueRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const issue = await this.issues.findById(input.issueId)
		if (!issue || issue.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
		issue.reopen()
		await this.withTransaction(tx, async tx => {
			await this.issues.save(issue, tx)
		})
	}
}
