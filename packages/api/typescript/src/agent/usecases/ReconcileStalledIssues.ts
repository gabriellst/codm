import { injectable } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { StalledIssueReader } from '../services/StalledIssueReader'
import { AgentRunStopRaisedEvent } from '../events/AgentRunStopRaisedEvent'
import { FactSource } from '../enums'

export const ReconcileStalledIssuesInputSchema = z.object({})
export const ReconcileStalledIssuesOutputSchema = z.object({ stalledIssueIds: z.array(z.uuid()) })

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
 * ### O que é emitido, e por que reusa o vocabulário existente
 * `HUMAN_REQUESTED` com `source: INFERRED`. O par diz exatamente o que aconteceu — "precisa de humano, e
 * não foi o agente que pediu" — e é para essa distinção que `FactSource` existe: "quantas issues
 * fecharam por inferência?" continua sendo um `SELECT`. Um `StopKind` novo custaria um contrato
 * congelado mais uma migração do `CHECK` de `issue_stops.kind` para dizer o que o `source` já diz.
 *
 * ### Idempotência sem registro de "já avisei"
 * Ela vem do PREDICADO. O fato emitido leva a issue a `NEEDS_INPUT` (via
 * `MarkIssueNeedsInputFromStop`), e uma issue fora de `WORKING` não aparece na varredura seguinte. Até
 * o outbox despachar, a segunda metade do predicado (evento pendente para a issue) já a exclui — a
 * mesma linha que impede o falso positivo impede o stop duplicado.
 *
 * A CADÊNCIA mora aqui, ao lado do que ela agenda, como em `AutoArchiveCompletedIssues`. Um minuto: o
 * predicado é um `SELECT` sobre um SQLite local, e o que se compra com ele é o teto de espera do
 * operador — o incidente que originou isto custou 1h22.
 */
@injectable()
export class ReconcileStalledIssues extends Handler<typeof ReconcileStalledIssuesInputSchema, typeof ReconcileStalledIssuesOutputSchema> {
	readonly name = 'reconcile_stalled_issues' as const
	readonly inputSchema = ReconcileStalledIssuesInputSchema
	readonly outputSchema = ReconcileStalledIssuesOutputSchema

	static readonly repeat = { every: 60 * 1000 }

	static readonly DETAIL = 'a execução terminou sem conclusão — nada estava em andamento quando a varredura passou'

	constructor(private readonly stalled: StalledIssueReader) {
		super()
	}

	protected async handle(_input: this['input'], tx?: Transaction): Promise<this['output']> {
		const orphans = await this.stalled.stalledIssues()
		if (orphans.length === 0) return { stalledIssueIds: [] }

		await this.withTransaction(tx, async tx => {
			for (const orphan of orphans) {
				await this.domainEventRepository.save(
					new AgentRunStopRaisedEvent({
						entityId: orphan.issueId,
						ownerId: orphan.ownerId,
						payload: {
							stopId: uuidv7(),
							issueId: orphan.issueId,
							threadId: orphan.threadId,
							kind: StopKind.HUMAN_REQUESTED,
							detail: ReconcileStalledIssues.DETAIL,
							source: FactSource.INFERRED,
						},
					}),
					tx,
				)
			}
		})

		return { stalledIssueIds: orphans.map(orphan => orphan.issueId) }
	}
}
