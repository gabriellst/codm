import { injectable } from 'tsyringe-neo'
import { BaseError, EventHandler, LoggingService } from '@codm/core-typescript'
import { ThreadStopRaisedEvent } from '@codm/contracts-typescript/wire/events'
import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { Id } from '@codm/core-typescript'
import { RaiseStop } from '../usecases/RaiseStop'

/**
 * The stop fact from the terminal engine → a Stop on the thread it belongs to.
 *
 * This branch used to live in `issue/handlers/MaterializeIssueFromExecution`, alongside the three ISSUE
 * facts. It moved with the aggregate (B4, spec decision 4): the consuming context is the one that owns
 * the state the fact changes, and stops are `Thread`'s children now. `MaterializeIssueFromExecution`
 * keeps `opened` / `created` / `completed`, which really are issue facts.
 *
 * `threadId` comes off the payload — the fact has always carried it (that is how thread-scoped SSE
 * consumers key off it directly) — so a stop with no `issueId` routes exactly as well as one with.
 */
@injectable()
export class RecordStopFromExecution extends EventHandler<typeof ThreadStopRaisedEvent> {
	readonly event = ThreadStopRaisedEvent

	constructor(
		private readonly raiseStop: RaiseStop,
		private readonly logging: LoggingService,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		try {
			// `detail` is the agent's OWN words, additive on the frozen event since Fase 6 (§4.4 item (i)) —
			// before it existed this was hardcoded `''` and every Needs-you card rendered the generic title
			// with no body.
			//
			// HUMAN_REQUESTED is the one kind whose title is the text: it is what `AskOperator` raises, and
			// the operator needs to read the QUESTION on the card, not the generic catalog line. The other
			// four kinds leave `title` undefined — `RaiseStop` resolves the generic title from
			// `THREAD_MESSAGES.stopTitle`, with the operator's language in hand, which this handler has no
			// way to know.
			const detail = event.payload.detail
			const title = event.payload.kind === StopKind.HUMAN_REQUESTED && detail.length > 0 ? detail : undefined
			await this.raiseStop.execute({
				stopId: event.payload.stopId || Id.value(),
				threadId: event.payload.threadId,
				issueId: event.payload.issueId,
				kind: event.payload.kind,
				title,
				detail,
			})
		} catch (error) {
			// ONLY the sanctioned no-op outcomes are swallowed (the stop is simply not recorded). Anything
			// else — a DB outage included — must rethrow so the outbox retries instead of silently eating
			// the needs-you signal.
			const swallowed: readonly string[] = ['STOP_CRITERION_DISABLED', 'ISSUE_ARCHIVED', 'ISSUE_NOT_FOUND', 'THREAD_NOT_FOUND']
			if (error instanceof BaseError && swallowed.includes(error.name)) {
				// ENGOLIR NÃO É SUMIR. Em 2026-08-26 dois `integration.thread.stop_raised` foram publicados e
				// processados sem erro, e nenhuma linha apareceu em `stops` — e não havia como saber qual das
				// quatro guardas recusou, porque nenhuma delas dizia nada. O `warn` custa uma linha e é a
				// diferença entre um diagnóstico de segundos e uma reconstrução pelo banco.
				this.logging.warn({
					content: {
						message: 'stop not recorded — a sanctioned guard refused it',
						reason: error.name,
						stopId: event.payload.stopId,
						issueId: event.payload.issueId,
						threadId: event.payload.threadId,
						kind: event.payload.kind,
					},
				})
				return
			}
			// O CAMINHO NÃO SANCIONADO TAMBÉM PRECISA DE RASTRO, e ele é o mais caro de investigar.
			//
			// Um erro fora da lista é relançado para o outbox retentar — e depois de esgotar as tentativas
			// a linha é dead-lettered com `processed_at` CARIMBADO. Quem procura problemas filtrando por
			// `processed_at IS NULL` não encontra nada, e a única evidência fica em `last_error`, onde
			// ninguém olha sem já suspeitar. Foi assim que um `TypeError` no `RaiseStop` manteve todos os
			// stops do desktop invisíveis por duas semanas.
			this.logging.warn({
				content: {
					message: 'stop not recorded — unsanctioned error, rethrowing for outbox retry',
					error: error instanceof Error ? error.message : String(error),
					stopId: event.payload.stopId,
					issueId: event.payload.issueId,
					threadId: event.payload.threadId,
					kind: event.payload.kind,
				},
			})
			throw error
		}
	}
}
