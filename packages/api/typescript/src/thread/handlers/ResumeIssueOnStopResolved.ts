import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { MailboxItemKind, MailboxTargetKind, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { OpenIssuesReader } from '../services/OpenIssuesReader'
import type { Stop } from '../entities/Thread'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'

/**
 * "Resolvi" has to mean "the agent went back to work" (spec 2026-07-31, decision 2).
 *
 * `thread.stop_resolved` had exactly ONE subscriber — `PublishThreadIntegrationEvents`, which only
 * republishes it. Nothing rescheduled anything, so the console button made the Needs-you card vanish
 * and the issue sat there forever: the UI promised a continuity the backend did not implement. This is
 * the missing subscriber.
 *
 * ### Why here, and why it enqueues instead of calling a use case
 * The fact belongs to `thread` (the Stop is a child of the `Thread` aggregate since B4), so its
 * internal handler lives in `thread`. Writing into the agent mailbox from here is the shape
 * `SteerThread` already uses for the same reason: the mailbox is a QUEUE, not another context's
 * write model, and the dispatcher's per-target lease — not this handler — decides when the turn runs.
 *
 * ### No new `MailboxItemKind` (decision 4)
 * `STEER` already means "a turn on an issue whose prompt is this item's text"
 * (`DrizzleMailboxDispatcher.runIssueWork`), and a resume is exactly that. A `RESUME` kind would be a
 * second name for one behaviour, and the dispatcher would need a branch to treat them identically.
 *
 * ### The three cases that queue NOTHING
 *  - `TAKE_OVER` — by definition the work moved to the human (decision 2, US-2). Rescheduling the
 *    agent here would put it back on a thread the resolution just paused.
 *  - a THREAD-LEVEL stop (no `issueId`) — the orchestrator's needs-approval, raised before any issue
 *    exists. There is no issue to put back to work.
 *  - an issue that is no longer open — completed or archived while the card sat on screen. Read
 *    through the thread's OWN open-issue seam, the same one `SteerIssueTurnController` gates on, so
 *    "is it still ours to schedule" and "what is its key/title" are one question and one query.
 */
@injectable()
export class ResumeIssueOnStopResolved extends EventHandler<typeof ThreadStopResolvedEvent> {
	readonly event = ThreadStopResolvedEvent

	constructor(
		private readonly threads: ThreadRepository,
		private readonly openIssues: OpenIssuesReader,
		private readonly mailbox: MailboxRepository,
	) {
		super()
	}

	async handle(event: this['input']): Promise<void> {
		const { stopId, issueId, threadId, resolution } = event.payload
		if (resolution === StopResolution.TAKE_OVER || !issueId) return

		const open = await this.openIssues.openIssues(threadId)
		const issue = open.find(candidate => candidate.issueId === issueId)
		if (!issue) return

		// The stop is loaded for its OWNER and for what the agent had asked. A resolution whose stop
		// cannot be read is not a resume we can compose honestly, so it is not one we schedule.
		const stop = await this.threads.findStop(stopId)
		if (!stop) return

		// ONE TURN PER ISSUE, whichever path got here first. The mailbox already answers "is a turn
		// coming for this target" and the dispatcher already serializes per target — so when the
		// orchestrator has already steered this issue (decision 1's path, carrying the operator's own
		// words) the console's resolution rides that turn instead of scheduling a second one.
		if (await this.mailbox.hasPending(MailboxTargetKind.ISSUE, issueId)) return

		await this.mailbox.enqueue({
			ownerId: stop.ownerId,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.STEER,
			payload: { issueId, threadId, key: issue.key, title: issue.title, text: this.resumeText(stop, resolution) },
			// THE KEY IS THE STOP, and the choice is the same one `IngestChannelMessage` makes when it
			// keys on the ENTRY: the dedup key is the unique CAUSE of the work, never the target of it.
			// A stop is resolved once, so the at-least-once outbox redelivering this fact re-inserts,
			// conflicts on the unique index and schedules nothing. Keying on the ISSUE instead would be
			// once-per-lifetime — the row survives consumption, so the issue's SECOND stop would silently
			// never resume.
			dedupKey: `resume:${stopId}`,
		})
	}

	/**
	 * The prompt the resumed turn is handed.
	 *
	 * ### The operator's own words are not available on this path, and pretending otherwise would lie
	 * `ResolveStop` takes `{ ownerId, stopId, resolution }` — the resolution is a closed enum
	 * (`StopResolution`) and carries no prose; the only free text on a Stop is `title`/`detail`, which
	 * is what the AGENT wrote when it stopped. So what this can honestly say is: which question was
	 * answered, and which of the applicable answers was chosen. The operator's actual sentence reaches
	 * the issue by the OTHER path — the orchestrator steering with the conversation's own text
	 * (decision 1) — which is why that path exists rather than being folded into this one.
	 */
	private resumeText(stop: Stop, resolution: StopResolution): string {
		const question = stop.detail.trim() || stop.title.trim()
		return [
			`The operator resolved the stop that halted you — they answered ${resolution}.`,
			...(question ? [`What you had asked: ${question}`] : []),
			'Continue this issue from where you stopped.',
		].join('\n')
	}
}
