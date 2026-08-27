import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { IssueRepository } from '../repositories/IssueRepository'

export const MarkIssueNeedsInputInputSchema = z.object({ issueId: z.uuid(), reason: z.string().optional() })
export const MarkIssueNeedsInputOutputSchema = z.void()

/**
 * O STATUS da issue quando um Stop é levantado sobre ela — a metade que faltava do par.
 *
 * O Stop em si é filho do agregado `Thread` desde B4, e é o `thread` quem grava a linha
 * (`RecordStopFromExecution` → `RaiseStop`). Este use case não duplica nada disso: ele responde a
 * outra pergunta sobre outro estado — "esta issue ainda está trabalhando?" — e a resposta pertence ao
 * contexto que é dono do ciclo de vida dela. Dois consumidores do mesmo integration event, um
 * publicador só, cada um mudando o SEU estado: é o que a regra de B4 pede, não o que ela proíbe.
 *
 * Sem evento de saída. O fato que disparou isto (`integration.thread.stop_raised`) já está no ledger e
 * já tem publicador; mintar um segundo aqui poria a mesma ocorrência duas vezes na fita.
 *
 * IDEMPOTENTE em toda entrada que não seja uma issue `WORKING` viva: id desconhecido, arquivada,
 * já em `NEEDS_INPUT` ou já `COMPLETED` saem sem tocar em nada. O fato é at-least-once (outbox, mais o
 * job repetível de `ReconcileStalledIssues`), então a redelivery é o caso NORMAL, não a exceção — a
 * mesma postura que `CompleteIssue` já adota.
 */
@injectable()
export class MarkIssueNeedsInput extends Handler<typeof MarkIssueNeedsInputInputSchema, typeof MarkIssueNeedsInputOutputSchema> {
	readonly name = 'mark_issue_needs_input' as const
	readonly inputSchema = MarkIssueNeedsInputInputSchema
	readonly outputSchema = MarkIssueNeedsInputOutputSchema

	constructor(private readonly issues: IssueRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const issue = await this.issues.findById(input.issueId)
		// A entidade também recusaria a arquivada (`assertNotArchived` lança) e ignoraria o que não está
		// `WORKING`. O guard está aqui em vez de num try/catch porque um stop sobre uma issue arquivada é
		// um NÃO-EVENTO previsto, e transformar previsto em exceção capturada esconde o imprevisto.
		if (!issue || issue.archived || issue.status !== IssueStatus.WORKING) return
		issue.needsInput(input.reason)
		await this.withTransaction(tx, async tx => {
			await this.issues.save(issue, tx)
		})
	}
}
