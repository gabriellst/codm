import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, PermissionPosture, StopKind } from '@codm/contracts-typescript/wire/enums'
import { StalledIssueReader, type StalledIssueRef } from '../services/StalledIssueReader'
import { MailboxRepository } from '../repositories/MailboxRepository'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { FactSource } from '../enums'

export const ReconcileStalledIssuesInputSchema = z.object({})
export const ReconcileStalledIssuesOutputSchema = z.object({
	/** Issues the sweep parked with a stop this pass. */
	stalledIssueIds: z.array(z.uuid()),
	/** Issues the sweep sent the one declaration reminder this pass, instead of a stop. */
	remindedIssueIds: z.array(z.uuid()),
})

/**
 * A varredura que fecha a classe de falha "a issue diz que está trabalhando e não está".
 *
 * ### Por que existe UM produtor deste fato, e por que ele é um job
 * A alternativa óbvia — `RunIssueTurn` mintar o fato quando o turno acaba sem declaração — não
 * funciona, por duas razões medidas. Primeiro, o turno **não tem como saber se houve declaração**: ela
 * chega por uma ferramenta MCP que commita fora do fluxo do turno, e o materializador que move o status
 * é assíncrono via outbox, então ler o estado no fim do turno responde a pergunta errada. Segundo, um
 * turno só cobre o caso em que o turno TERMINA — crash, `kill -9` e reinício do daemon deixam a issue
 * presa sem que nenhum código de fim de turno chegue a rodar. A varredura cobre os dois com um
 * mecanismo só, e um produtor único dispensa dedup entre produtores.
 *
 * ### UM LEMBRETE ANTES DA PARADA (fase 0, item 5)
 * Medido numa instalação real: ~75 issues por semana terminavam o turno em prosa — tipicamente "prévia
 * pronta, posso publicar?" — sem declarar nada, e esta varredura estacionava todas com o MESMO texto,
 * sem aviso no canal. Uma issue saudável esperando um ok e uma que morreu no meio ficavam iguais.
 *
 * Agora, quando o turno que se calou foi um turno de verdade, a varredura manda UM steer à sessão da
 * issue pedindo que ela declare em que pé está (concluí / preciso de decisão / preciso de uma
 * resposta). O turno do lembrete é silencioso — não vira `ISSUE_RESULT` (`RunIssueTurn`) — e a sessão
 * ainda tem o contexto quente. Se o lembrete também terminar calado, a passada seguinte estaciona a
 * issue com `DETAIL_AFTER_REMINDER`: aí sim é "parada sem motivo", e o texto diz isso.
 *
 * Uma issue que NUNCA teve turno (aberta sem trabalho na fila) não recebe lembrete — não há sessão para
 * lembrar — e é estacionada como sempre foi.
 *
 * ### O que é emitido, e por que reusa o vocabulário existente
 * `HUMAN_REQUESTED` com `source: INFERRED`. O par diz exatamente o que aconteceu — "precisa de humano, e
 * não foi o agente que pediu" — e é para essa distinção que `FactSource` existe.
 *
 * ### Idempotência sem registro de "já avisei"
 * Ela vem do PREDICADO. O lembrete é um item em voo, e uma issue com item em voo não aparece na
 * varredura; o `dedupKey` dele é o item que se calou, então uma passada repetida não manda outro. A
 * parada leva a issue a `NEEDS_INPUT`, que também sai da varredura.
 *
 * A CADÊNCIA mora aqui, ao lado do que ela agenda. Um minuto: o predicado é um `SELECT` sobre um SQLite
 * local, e o que se compra com ele é o teto de espera do operador.
 */
@injectable()
export class ReconcileStalledIssues extends Handler<typeof ReconcileStalledIssuesInputSchema, typeof ReconcileStalledIssuesOutputSchema> {
	readonly name = 'reconcile_stalled_issues' as const
	readonly inputSchema = ReconcileStalledIssuesInputSchema
	readonly outputSchema = ReconcileStalledIssuesOutputSchema

	static readonly repeat = { every: 60 * 1000 }

	static readonly DETAIL = 'a execução terminou sem conclusão — nada estava em andamento quando a varredura passou'
	static readonly DETAIL_AFTER_REMINDER =
		'a tarefa terminou o turno sem dizer em que pé está, nem depois do lembrete — pode ter parado no meio'

	/**
	 * What the reminder says to the issue's session. The tools are named by purpose: the turn's own
	 * prompt (`IssueWorkAgent.declarationInstruction`) names them, and this is a follow-up in that session.
	 */
	static readonly REMINDER =
		'Your last turn ended without declaring where this issue stands, so nobody can tell whether it is done, ' +
		'waiting on someone, or stuck. Declare it now with the reporting tools, and do not redo any work: ' +
		'finished → mark the issue COMPLETED with a short summary; waiting for a decision or an approval (for ' +
		'example "can I publish?") → raise a stop for it; you need one specific answer → ask the operator. ' +
		'Do not write anything for the group — this reminder is not shown to anyone.'

	constructor(
		private readonly stalled: StalledIssueReader,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}

	protected async handle(_input: this['input'], tx?: Transaction): Promise<this['output']> {
		const orphans = await this.stalled.stalledIssues()
		if (orphans.length === 0) return { stalledIssueIds: [], remindedIssueIds: [] }

		const toRemind = orphans.filter(orphan => orphan.lastConsumedItemId !== null && !orphan.lastTurnWasReminder)
		const toPark = orphans.filter(orphan => !toRemind.includes(orphan))

		await this.withTransaction(tx, async tx => {
			for (const orphan of toRemind) await this.remind(orphan, tx)
			for (const orphan of toPark) {
				await this.domainEventRepository.save(
					new AgentRunStopRaisedEvent({
						entityId: orphan.issueId,
						ownerId: orphan.ownerId,
						payload: {
							stopId: uuidv7(),
							issueId: orphan.issueId,
							threadId: orphan.threadId,
							kind: StopKind.HUMAN_REQUESTED,
							detail: orphan.lastTurnWasReminder ? ReconcileStalledIssues.DETAIL_AFTER_REMINDER : ReconcileStalledIssues.DETAIL,
							source: FactSource.INFERRED,
						},
					}),
					tx,
				)
			}
		})

		return { stalledIssueIds: toPark.map(orphan => orphan.issueId), remindedIssueIds: toRemind.map(orphan => orphan.issueId) }
	}

	/**
	 * AUTO posture, always: the reminder only asks the session to report — nobody triggered it, so nobody's
	 * grant applies. Keyed on the turn that went quiet, so it is sent once per quiet turn.
	 */
	private async remind(orphan: StalledIssueRef, tx: Transaction): Promise<void> {
		await this.mailbox.enqueue(
			{
				ownerId: orphan.ownerId,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: orphan.issueId,
				kind: MailboxItemKind.STEER,
				posture: PermissionPosture.AUTO,
				payload: {
					issueId: orphan.issueId,
					threadId: orphan.threadId,
					key: orphan.key,
					title: orphan.title,
					provider: orphan.provider,
					text: ReconcileStalledIssues.REMINDER,
					declarationReminder: true,
				},
				dedupKey: `declare-reminder:${orphan.issueId}:${orphan.lastConsumedItemId}`,
			},
			tx,
		)
	}
}
