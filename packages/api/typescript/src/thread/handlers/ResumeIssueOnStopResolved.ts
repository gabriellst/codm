import { injectable } from 'tsyringe-neo'
import { EventHandler } from '@codm/core-typescript'
import { MailboxClaimClass, MailboxItemKind, MailboxTargetKind, NudgeSource, StopResolution } from '@codm/contracts-typescript/wire/enums'
import { MailboxRepository } from '@agent/repositories/MailboxRepository'
import { NUDGES_BEFORE_STALL, PUBLISH_AUTHORIZED_BY, type NudgePayload } from '@agent/objects'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { OpenIssuesReader } from '../services/OpenIssuesReader'
import type { Stop, Thread } from '../entities/Thread'
import { ThreadStopResolvedEvent } from '../events/ThreadStopResolvedEvent'
import { askCode, labelOfAnswer } from '../utils/askAnswer'
import { ResumeIssuePayloadSchema } from '../objects'

/**
 * Whether a resolution's resume is queued EVEN WHEN the issue already has work pending (fase 3). Total over
 * `StopResolution`. An answer to an ask (a person's, or the default the deadline applied) carries the one
 * thing the session is waiting for: swallowed because another message was in the queue, the issue would go on
 * without it — the worst outcome here. The dedup key is the stop, so it is still queued once. The older
 * resolutions keep riding a turn already coming (`hasPending`) — unless the resolution AUTHORIZES PUBLISHING
 * (`PUBLISH_AUTHORIZED_BY`, fase 4 item 6c): that item is the trigger of the workspace's publish command, and riding
 * another turn would mean the command never runs. Two declared tables, never "APPROVE ⇒ true" in general (which
 * would give every approval a second turn).
 */
const RESUMES_EVEN_WITH_PENDING: Readonly<Record<StopResolution, boolean>> = {
	[StopResolution.RETRY]: false,
	[StopResolution.REVIEW_AND_SEND]: false,
	[StopResolution.APPROVE]: false,
	[StopResolution.DENY]: false,
	[StopResolution.TAKE_OVER]: false,
	[StopResolution.ANSWER]: true,
	[StopResolution.DEFAULT_APPLIED]: true,
	// Fase 5: the supervisor's retry is a nudge — a turn already coming carries the task on just as well.
	[StopResolution.AUTO_RETRY]: false,
}

/**
 * WHAT THE RESUME IS in the queue (fase 5) — total over `StopResolution`. An answer or resolution someone gave
 * is a `DECISION_ANSWER`: claimed first and the trigger the publish command reads. The supervisor's retry is
 * NOT: it is the last nudge of the task's episode, a `REMINDER` — it never jumps ahead of a person's answer
 * and never reaches the publish trigger.
 */
const RESUME_CLAIM_CLASS: Readonly<Record<StopResolution, MailboxClaimClass>> = {
	[StopResolution.RETRY]: MailboxClaimClass.DECISION_ANSWER,
	[StopResolution.REVIEW_AND_SEND]: MailboxClaimClass.DECISION_ANSWER,
	[StopResolution.APPROVE]: MailboxClaimClass.DECISION_ANSWER,
	[StopResolution.DENY]: MailboxClaimClass.DECISION_ANSWER,
	[StopResolution.TAKE_OVER]: MailboxClaimClass.DECISION_ANSWER,
	[StopResolution.ANSWER]: MailboxClaimClass.DECISION_ANSWER,
	[StopResolution.DEFAULT_APPLIED]: MailboxClaimClass.DECISION_ANSWER,
	[StopResolution.AUTO_RETRY]: MailboxClaimClass.REMINDER,
}

/**
 * WHICH NUDGE THE RESUME IS (fase 5) — total over `StopResolution`. Only the supervisor's retry is one: the LAST nudge
 * of the episode (`ordinal = NUDGES_BEFORE_STALL`, decision of 20/11 — one automatic turn per supervisor action), so
 * if that turn goes quiet too the reconciler raises `STALLED` straight away instead of starting a new pair.
 */
const RESUME_NUDGE: Readonly<Record<StopResolution, NudgePayload['nudge'] | undefined>> = {
	[StopResolution.RETRY]: undefined,
	[StopResolution.REVIEW_AND_SEND]: undefined,
	[StopResolution.APPROVE]: undefined,
	[StopResolution.DENY]: undefined,
	[StopResolution.TAKE_OVER]: undefined,
	[StopResolution.ANSWER]: undefined,
	[StopResolution.DEFAULT_APPLIED]: undefined,
	[StopResolution.AUTO_RETRY]: { ordinal: NUDGES_BEFORE_STALL, source: NudgeSource.SUPERVISOR },
}

/** What the resumed turn is told — by resolution, total over `StopResolution`. */
interface ResumeContext {
	stop: Stop
	resolution: StopResolution
	/** The ask's code (`APP-12 · D1`). */
	code: string
	/** WHO answered, as the roster names them — never a raw address. */
	answeredBy?: string
}

/** The question the stop put, as the agent wrote it. */
function questionOf(stop: Stop): string {
	return stop.ask?.question.trim() || stop.detail.trim() || stop.title.trim()
}

/**
 * The resolutions that existed before fase 3: which question was answered, and which of the applicable
 * answers was chosen — the operator's own words reach the issue by the orchestrator's steer, not here.
 */
const resolvedText = ({ stop, resolution }: ResumeContext): string => {
	const question = stop.detail.trim() || stop.title.trim()
	return [
		`The operator resolved the stop that halted you — they answered ${resolution}.`,
		...(question ? [`What you had asked: ${question}`] : []),
		'Continue this issue from where you stopped.',
	].join('\n')
}

const RESUME_TEXT: Readonly<Record<StopResolution, (context: ResumeContext) => string>> = {
	[StopResolution.RETRY]: resolvedText,
	[StopResolution.REVIEW_AND_SEND]: resolvedText,
	[StopResolution.APPROVE]: resolvedText,
	[StopResolution.DENY]: resolvedText,
	[StopResolution.TAKE_OVER]: resolvedText,
	// A person answered the ask: the question, its code and the answer itself.
	[StopResolution.ANSWER]: ({ stop, code, answeredBy }) =>
		[
			`${answeredBy ?? 'Someone in the group'} answered your ${code}: "${questionOf(stop)}"`,
			`Answer: ${stop.answer ? labelOfAnswer(stop.ask, stop.answer) : '(none recorded)'}`,
			'Continue this issue with that answer.',
		].join('\n'),
	// Nobody answered by the deadline: the issue goes on with the default it declared.
	[StopResolution.DEFAULT_APPLIED]: ({ stop, code }) =>
		[
			`Nobody answered your ${code} within 15 minutes: "${questionOf(stop)}"`,
			`Go on with the default you declared: ${stop.answer ? labelOfAnswer(stop.ask, stop.answer) : '(none recorded)'}`,
			'Continue this issue from where you stopped.',
		].join('\n'),
	// Fase 5: the supervisor resumes a task that stopped (a provider error, or turns that ended without declaring
	// anything) — the wording of the second nudge, in AUTO, and never an authorization.
	[StopResolution.AUTO_RETRY]: () =>
		[
			'Your work on this issue stopped without a declaration (an error, or a turn that ended without saying where things stand).',
			'If you stopped in the middle of a step, finish that step; then declare: done, the decision that is missing, or what is missing and from whom.',
			'This nudge does not authorize publishing, merging or anything irreversible.',
		].join('\n'),
}

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
 * (`LibSqlMailboxDispatcher.runIssueWork`), and a resume is exactly that. A `RESUME` kind would be a
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
		const { stopId, issueId, threadId, resolution, posture } = event.payload
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
		// words) the console's resolution rides that turn instead of scheduling a second one. An ANSWER
		// to an ask is the exception (`RESUMES_EVEN_WITH_PENDING`): it carries what the session waits for — and so
		// is a resolution that authorizes publishing (`PUBLISH_AUTHORIZED_BY`, fase 4): it is the publish trigger.
		const resumesAnyway = RESUMES_EVEN_WITH_PENDING[resolution] || PUBLISH_AUTHORIZED_BY[resolution](stop)
		if (!resumesAnyway && (await this.mailbox.hasPending(MailboxTargetKind.ISSUE, issueId))) return

		const thread = stop.answeredBy ? await this.threads.findById(threadId) : undefined
		const text = RESUME_TEXT[resolution]({
			stop,
			resolution,
			code: askCode(issue.key, stop.seq),
			answeredBy: answererName(thread, stop.answeredBy),
		})

		await this.mailbox.enqueue({
			ownerId: stop.ownerId,
			targetKind: MailboxTargetKind.ISSUE,
			targetId: issueId,
			kind: MailboxItemKind.STEER,
			// WHAT IT IS (fase 4, S0c; fase 5): the answer to a decision the issue was waiting on — claimed first (S4),
			// never coalesced with ordinary steers (S5), and the trigger the publish command reads (S11) — except the
			// supervisor's retry, a REMINDER (`RESUME_CLAIM_CLASS`).
			claimClass: RESUME_CLAIM_CLASS[resolution],
			// The posture the FACT carries (Decision 7): the resolver's, reduced by the resolution — an APPROVE
			// from someone who may elevate resumes in BYPASS, a DENY always in AUTO.
			posture,
			// The stop and the resolution are DECLARED in the payload (revisão 2): the dedup key below is idempotency,
			// never a field anyone parses back.
			payload: ResumeIssuePayloadSchema.parse({
				issueId,
				threadId,
				key: issue.key,
				title: issue.title,
				text,
				stopId,
				resolution,
				...(RESUME_NUDGE[resolution] && { nudge: RESUME_NUDGE[resolution] }),
			}),
			// THE KEY IS THE STOP, and the choice is the same one `IngestChannelMessage` makes when it
			// keys on the ENTRY: the dedup key is the unique CAUSE of the work, never the target of it.
			// A stop is resolved once, so the at-least-once outbox redelivering this fact re-inserts,
			// conflicts on the unique index and schedules nothing. Keying on the ISSUE instead would be
			// once-per-lifetime — the row survives consumption, so the issue's SECOND stop would silently
			// never resume.
			dedupKey: `resume:${stopId}`,
		})
	}
}

/** The roster name of who answered — the operator as such, someone without a roster name as nobody in particular. */
function answererName(thread: Thread | undefined, participantId: string | undefined): string | undefined {
	return participantId ? thread?.rosterNameOf(participantId) : undefined
}
