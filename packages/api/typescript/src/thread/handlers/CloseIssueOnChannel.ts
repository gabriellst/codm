import { injectable } from 'tsyringe-neo'
import { BaseError, EventHandler, Id, LoggingService } from '@codm/core-typescript'
import { IssueCompletedEvent } from '@codm/contracts-typescript/wire/events'
import { IssueSignalLevel, IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { DeliverIssueSignal } from '../usecases/DeliverIssueSignal'
import { ThreadRepository } from '../repositories/ThreadRepository'

/**
 * How much of the declared summary the closing line carries (spec: "a mensagem de fechamento corta o resumo
 * na formatação"). The tool takes up to 4000 — an account of the work for the console; the group reads one
 * short paragraph, and the whole of it is behind the link.
 */
export const CLOSING_SUMMARY_MAX = 600

/**
 * THE CLOSING (fase 3, item 5) — `integration.issue.completed` → the group's output policy at CLOSING level:
 * "✅ APP-12 · <título> — <resumo>" (an inferred completion, with no summary, reads "concluída") + the final
 * artifact when one was declared + the issue's link, quoting the message that asked for the work.
 *
 * It replaces the orchestrator's answer to an `ISSUE_RESULT`: the end of a turn is no longer the end of the
 * task (it was 6.9 results per issue, measured), the declared completion is — and it is said once.
 *
 * ONCE PER COMPLETION CYCLE. The closing's entry id is derived from the issue and the instant its CYCLE
 * completed — the issue's own `completedAt` when it is already COMPLETED, else this fact's. That instant is
 * the first declaration's (`MaterializeIssueFromExecution` stamps the fact's `completedAt`, and a second
 * completion of a COMPLETED issue is a no-op there), so:
 *  - the same completion delivered twice (a new event id each time) is recorded and sent once;
 *  - a SECOND declaration of the same cycle (the agent called the tool twice, a later turn declared again)
 *    finds the first one's instant and closes nothing more;
 *  - a reopened issue (`reopen()` clears `completedAt`) that completes again is a new cycle: a new closing.
 * The facts reach this handler in order (the integration lane delivers sequentially), so the second
 * declaration's closing always runs after the first one was materialized — or ran here with the same seed.
 *
 * A completion declared by a turn that was answering a person (`answersEntryId`) is that person's reply: it
 * quotes their message, and the turn does not send its own (one message — `RunIssueTurn.reportTurn`). So it
 * can NOT be folded into a closing of the cycle that answered somebody else: a person who wrote while the
 * issue was still working, answered by a turn that ran after the cycle had closed, would hear nothing at all.
 * It is keyed by the cycle while the cycle's closing is still unsaid or already quotes them, and by the
 * cycle + their message otherwise (`signalIdOf`).
 */
@injectable()
export class CloseIssueOnChannel extends EventHandler<typeof IssueCompletedEvent> {
	readonly event = IssueCompletedEvent

	constructor(
		private readonly deliver: DeliverIssueSignal,
		private readonly issues: IssueRepository,
		private readonly threads: ThreadRepository,
		private readonly logging: LoggingService,
	) {
		super()
	}

	/**
	 * Which closing this completion is (see the class doc): the cycle's — unless it answers a person and the
	 * cycle's closing was already said quoting someone else (or no one), then that person's own.
	 */
	private async signalIdOf(issueId: string, cycle: Date, answersEntryId: string | undefined): Promise<string> {
		const cycleClosing = cycleSignalId(issueId, cycle)
		if (!answersEntryId) return cycleClosing
		const said = await this.threads.findEntry(cycleClosing)
		return !said || said.quotedEntryId === answersEntryId ? cycleClosing : cycleSignalId(issueId, cycle, answersEntryId)
	}

	async handle(event: this['input']): Promise<void> {
		const { payload } = event
		const issue = await this.issues.findById(payload.issueId)
		const cycle = issue?.status === IssueStatus.COMPLETED && issue.completedAt ? issue.completedAt : new Date(payload.completedAt)
		try {
			await this.deliver.execute({
				threadId: payload.threadId,
				issueId: payload.issueId,
				level: IssueSignalLevel.CLOSING,
				text: clip(payload.summary ?? ''),
				mainArtifactId: payload.finalArtifactId,
				answersEntryId: payload.answersEntryId,
				signalId: await this.signalIdOf(payload.issueId, cycle, payload.answersEntryId),
			})
		} catch (error) {
			// The conversation or the issue is gone — nowhere to say it; a retry would find them gone too.
			const gone: readonly string[] = ['THREAD_NOT_FOUND', 'ISSUE_NOT_FOUND']
			if (error instanceof BaseError && gone.includes(error.name)) {
				this.logging.warn({ content: { message: 'issue closing dropped', reason: error.name, issueId: payload.issueId } })
				return
			}
			throw error
		}
	}
}

/** The cycle's closing — its instant as ISO, byte-stable whether it came as a Date or as its wire string. */
function cycleSignalId(issueId: string, cycle: Date, answersEntryId?: string): string {
	const seed = ['issue-closing', issueId, cycle.toISOString(), ...(answersEntryId ? [answersEntryId] : [])]
	return Id.fromSeed(...seed).value
}

function clip(summary: string): string {
	const text = summary.trim()
	return text.length > CLOSING_SUMMARY_MAX ? `${text.slice(0, CLOSING_SUMMARY_MAX - 1).trimEnd()}…` : text
}
