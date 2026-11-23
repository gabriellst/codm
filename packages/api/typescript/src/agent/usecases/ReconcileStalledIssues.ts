import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { NudgeSource, StopKind } from '@codm/contracts-typescript/wire/enums'
import { StalledIssueReader, type StalledIssueRef } from '../services/StalledIssueReader'
import { NudgeQueue, type NudgeOrdinal } from '../services/NudgeQueue'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { AgentIssueNudgedEvent } from '../events/AgentIssueNudgedEvent'
import { NUDGES_BEFORE_STALL, type NudgePayload } from '../objects/NudgePayload'
import { FactSource } from '../enums'

// The count and the texts live with the one door a nudge goes through (`NudgeQueue`), shared with the supervisor.
export { NUDGES_BEFORE_STALL } from '../objects/NudgePayload'
export { NUDGE_TEXT } from '../services/NudgeQueue'

export const ReconcileStalledIssuesInputSchema = z.object({})
export const ReconcileStalledIssuesOutputSchema = z.object({
	/** Issues the sweep parked with a stop this pass. */
	stalledIssueIds: z.array(z.uuid()),
	/** Issues the sweep nudged this pass (nudge 1 or 2), instead of a stop. */
	nudgedIssueIds: z.array(z.uuid()),
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
 * issue: aí sim é "parada sem motivo", e o texto diz isso.
 *
 * ### ATÉ DOIS EMPURRÕES (fase 5, item 1)
 * O objetivo pede dois: o empurrão 1 é o lembrete acima; o 2 pede que a tarefa termine o passo em que parou e
 * declare (`NUDGE_TEXT`). Só depois do 2 calado vem o `STALLED`, com `DETAIL_AFTER_NUDGES`. A contagem é declarada
 * (`NUDGES_BEFORE_STALL`, `nextNudge`) sobre o último item consumido: "é empurrão" é a coluna `claim_class =
 * REMINDER`, "qual empurrão" o payload declarado (`NudgePayloadSchema`) — nunca o `dedupKey`. Cada empurrão grava
 * `agent.issue.nudged` na transação do enqueue (linha do tempo, contagem do supervisor).
 *
 * **Quem não é empurrado** (lista fechada): stop aberto de qualquer kind (a issue sai de `WORKING`); feedback
 * pedido no último turno (`DeclaredWaitReader` — espera sem prazo, decisão do dono de 20/11); issue OU conversa
 * pausada (`IssueHold`); item em voo de qualquer causa; fato no outbox ainda não despachado; arquivada; concluída.
 *
 * Uma issue que NUNCA teve turno (aberta sem trabalho na fila) não recebe lembrete — não há sessão para
 * lembrar — e é estacionada como sempre foi.
 *
 * ### O que é emitido
 * `STALLED` com `source: INFERRED` (fase 3). Até a fase 3 era `HUMAN_REQUESTED` — o mesmo kind do
 * `AskOperator` —, e as tabelas por kind não distinguiam "parou sem dizer nada" de um pedido de verdade.
 * Com o kind próprio a parada vira um AVISO DE BLOQUEIO no grupo (`LEVEL_OF_STOP`), um por issue
 * (`CAUSE_DEDUPES[STALLED]` é false): a prosa de um turno que não declarou nada nunca termina em silêncio
 * só no painel. As paradas antigas gravadas como `HUMAN_REQUESTED` ficam como estão (histórico).
 *
 * ### Idempotência sem registro de "já avisei"
 * Ela vem do PREDICADO. O empurrão é um item em voo, e uma issue com item em voo não aparece na
 * varredura; o `dedupKey` dele é o episódio e o ordinal, então uma passada repetida não manda outro. A
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
	static readonly DETAIL_AFTER_NUDGES =
		'a tarefa terminou o turno sem dizer em que pé está, nem depois de dois empurrões — pode ter parado no meio'

	constructor(
		private readonly stalled: StalledIssueReader,
		private readonly nudges: NudgeQueue,
	) {
		super()
	}

	protected async handle(_input: this['input'], tx?: Transaction): Promise<this['output']> {
		const orphans = await this.stalled.stalledIssues()
		if (orphans.length === 0) return { stalledIssueIds: [], nudgedIssueIds: [] }

		const plans = orphans.map(orphan => ({ orphan, next: ReconcileStalledIssues.nextNudge(orphan) }))
		const toNudge = plans.flatMap(({ orphan, next }) => (next ? [{ orphan, ...next }] : []))
		const toPark = plans.flatMap(({ orphan, next }) => (next ? [] : [orphan]))

		await this.withTransaction(tx, async tx => {
			for (const nudge of toNudge) await this.nudge(nudge.orphan, nudge.ordinal, nudge.rootItemId, tx)
			for (const orphan of toPark) {
				await this.domainEventRepository.save(
					new AgentRunStopRaisedEvent({
						entityId: orphan.issueId,
						ownerId: orphan.ownerId,
						payload: {
							stopId: uuidv7(),
							issueId: orphan.issueId,
							threadId: orphan.threadId,
							kind: StopKind.STALLED,
							detail: orphan.lastNudge ? ReconcileStalledIssues.DETAIL_AFTER_NUDGES : ReconcileStalledIssues.DETAIL,
							source: FactSource.INFERRED,
						},
					}),
					tx,
				)
			}
		})

		return { stalledIssueIds: toPark.map(orphan => orphan.issueId), nudgedIssueIds: toNudge.map(nudge => nudge.orphan.issueId) }
	}

	/**
	 * THE COUNT, declared (fase 5, item 1), over the turn that went quiet:
	 *  - no turn ever ran → nothing to nudge (no session), the stop;
	 *  - it was anybody's work → nudge 1, rooted on that item;
	 *  - it was nudge n < `NUDGES_BEFORE_STALL` → nudge n + 1 of the same episode;
	 *  - it was the last nudge → the stop, with `DETAIL_AFTER_NUDGES`.
	 */
	static nextNudge(orphan: StalledIssueRef): { ordinal: NudgeOrdinal; rootItemId: string } | undefined {
		if (orphan.lastConsumedItemId === null) return undefined
		if (!orphan.lastNudge) return { ordinal: 1, rootItemId: orphan.lastConsumedItemId }
		if (orphan.lastNudge.ordinal < NUDGES_BEFORE_STALL) {
			return { ordinal: (orphan.lastNudge.ordinal + 1) as NudgeOrdinal, rootItemId: orphan.lastNudge.rootItemId }
		}
		return undefined
	}

	/**
	 * AUTO posture, always: the nudge only asks the session to report (or finish its step) — nobody triggered it, so
	 * nobody's grant applies. `REMINDER` is WHAT it is (the column every reader asks); which nudge it is rides the
	 * declared payload, never the dedup key. Keyed on the episode and the ordinal, so a repeated sweep sends nothing
	 * twice; the fact is written in the same transaction.
	 */
	private async nudge(orphan: StalledIssueRef, ordinal: NudgeOrdinal, rootItemId: string, tx: Transaction): Promise<void> {
		const nudge: NudgePayload['nudge'] & { ordinal: NudgeOrdinal } = { ordinal, rootItemId, source: NudgeSource.RECONCILER }
		await this.nudges.enqueueNudge(orphan, nudge, `nudge:${orphan.issueId}:${rootItemId}:${ordinal}`, tx)
		await this.domainEventRepository.save(
			new AgentIssueNudgedEvent({
				entityId: orphan.issueId,
				ownerId: orphan.ownerId,
				payload: { issueId: orphan.issueId, threadId: orphan.threadId, rootItemId, ordinal, source: NudgeSource.RECONCILER },
			}),
			tx,
		)
	}
}
