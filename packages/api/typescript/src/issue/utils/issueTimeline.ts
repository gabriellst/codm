import { and, eq, inArray, ne } from 'drizzle-orm'
import { z, type LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox, artifacts, batchItems, batches, events, issues, stops, transcriptEntries } from '@codm/contracts/db'
import { StopAnswerSchema, StopAskSchema } from '@shared/objects'
import { askCode, labelOfAnswer } from '@shared/utils/askCode'
import {
	type ClassificationMethod,
	IssueTimelineItemKind,
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	type StopKind,
	type TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import {
	NudgeMarkSchema,
	PublishRunSchema,
	RegretWindowSchema,
	RetryScheduledSchema,
	SupervisorReviewSchema,
	type IssueTimelineItem,
} from '@shared/schemas'
import { IssuePausedEventSchema } from '../events/IssuePausedEvent'

/** Fact names on `shared_events` that become a timeline moment, and which one. */
const EVENT_KINDS = {
	'agent.issue_forked': IssueTimelineItemKind.CREATED,
	'agent.run.started': IssueTimelineItemKind.TURN_STARTED,
	'agent.run.completed': IssueTimelineItemKind.COMPLETED,
	'issue.archived': IssueTimelineItemKind.ARCHIVED,
	'issue.paused': IssueTimelineItemKind.PAUSED,
	'issue.resumed': IssueTimelineItemKind.RESUMED,
	'agent.regret_window_closed': IssueTimelineItemKind.REGRET_WINDOW,
	// Fase 4 (item 6c): the workspace's declared publish command ran — written from slice S11 on.
	'agent.publish.ran': IssueTimelineItemKind.PUBLISH_RAN,
	// Fase 5: a nudge (S3), a retry scheduled (S2) and an ACTED supervisor verdict (S5) — no producer until then.
	'agent.issue.nudged': IssueTimelineItemKind.NUDGED,
	'agent.mailbox.retry_scheduled': IssueTimelineItemKind.RETRY_SCHEDULED,
	'agent.supervisor.reviewed': IssueTimelineItemKind.SUPERVISOR_REVIEWED,
} as const satisfies Record<string, IssueTimelineItemKind>
type EventName = keyof typeof EVENT_KINDS
const EVENT_NAMES = Object.keys(EVENT_KINDS) as EventName[]

const SteerPayloadSchema = z.object({ text: z.string() })
/**
 * Who held / released the work and from where — read off the recorded fact. `issue.resumed` carries the
 * same attribution fields as `issue.paused` (`IssueResumedEvent`), so one pick parses both.
 */
const ControlPayloadSchema = IssuePausedEventSchema.shape.payload.pick({ source: true, requestedBy: true })

/**
 * An issue's TIMELINE (fase 1, item 1): everything that happened to it, oldest first, assembled from facts
 * the system already records — no new table. Created, each turn, what was said about it (and the replies
 * that quoted it), every steer with its sent/delivered/read instants, its artifacts, its stops and their
 * answers, and how it ended.
 *
 * One assembly for both readers: the console (`GetIssueTimeline`) and the panel publisher, which sends the
 * same items to the cloud — so the web panel and the console can never disagree on what happened.
 */
export async function assembleIssueTimeline(driver: LibSqlDatabaseDriver, issueId: string, title: string): Promise<IssueTimelineItem[]> {
	const db = driver.db
	const [facts, entries, steers, files, stopRows, issueRow, batchLinks] = await Promise.all([
		db
			.select({ id: events.id, name: events.name, occurredAt: events.occurredAt, payload: events.payload })
			.from(events)
			.where(and(eq(events.entityId, issueId), inArray(events.name, EVENT_NAMES))),
		db.select().from(transcriptEntries).where(eq(transcriptEntries.issueId, issueId)),
		db
			.select()
			.from(agentMailbox)
			.where(
				and(
					eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
					eq(agentMailbox.targetId, issueId),
					eq(agentMailbox.kind, MailboxItemKind.STEER),
					// A nudge is not a steer anybody sent (fase 5): it shows as its own `NUDGED` moment, from the
					// `agent.issue.nudged` fact, in the reminder's place.
					ne(agentMailbox.claimClass, MailboxClaimClass.REMINDER),
				),
			),
		db.select().from(artifacts).where(eq(artifacts.issueId, issueId)),
		db.select().from(stops).where(eq(stops.issueId, issueId)),
		db.select({ key: issues.key }).from(issues).where(eq(issues.id, issueId)).limit(1),
		// Fase 4 (item 5): the batch items whose recorded destination names this issue — written from slice S8 on.
		db
			.select({ batchId: batchItems.batchId, n: batchItems.n, recordedAt: batchItems.recordedAt, code: batches.code })
			.from(batchItems)
			.innerJoin(batches, eq(batches.id, batchItems.batchId))
			.where(eq(batchItems.issueId, issueId)),
	])
	// The key the ask codes are spelled with (`APP-12 · D1`) — read here, so neither caller has to pass it.
	const issueKey = issueRow[0]?.key ?? ''

	const items: IssueTimelineItem[] = []
	for (const fact of facts) {
		const kind = EVENT_KINDS[fact.name as EventName]
		const when = fact.occurredAt.toISOString()
		if (kind === IssueTimelineItemKind.CREATED) items.push({ kind, id: fact.id, at: when, title })
		else if (kind === IssueTimelineItemKind.PAUSED || kind === IssueTimelineItemKind.RESUMED) {
			// A fact whose attribution does not parse is not a moment we can render honestly — skipped, the
			// same posture the steer payload above takes with a malformed row.
			const control = ControlPayloadSchema.safeParse(fact.payload)
			if (control.success) items.push({ kind, id: fact.id, at: when, source: control.data.source, by: control.data.requestedBy })
		} else if (kind === IssueTimelineItemKind.REGRET_WINDOW) {
			// Same posture as above: a window whose record does not parse is skipped, not guessed at.
			const window = RegretWindowSchema.safeParse(fact.payload)
			if (window.success) items.push({ kind, id: fact.id, at: when, ...window.data })
		} else if (kind === IssueTimelineItemKind.PUBLISH_RAN) {
			// Outcome, exit code and duration only — the fact never carries the command line nor the output.
			const run = PublishRunSchema.safeParse(fact.payload)
			if (run.success) items.push({ kind, id: fact.id, at: when, ...run.data })
		} else if (kind === IssueTimelineItemKind.NUDGED) {
			const nudge = NudgeMarkSchema.safeParse(fact.payload)
			if (nudge.success) items.push({ kind, id: fact.id, at: when, ...nudge.data })
		} else if (kind === IssueTimelineItemKind.RETRY_SCHEDULED) {
			const retry = RetryScheduledSchema.safeParse(fact.payload)
			if (retry.success) items.push({ kind, id: fact.id, at: when, ...retry.data })
		} else if (kind === IssueTimelineItemKind.SUPERVISOR_REVIEWED) {
			// Only what the supervisor DID: a verdict recorded in observation (`acted: false`) is audit, not a moment.
			const review = SupervisorReviewSchema.extend({ acted: z.literal(true) }).safeParse(fact.payload)
			if (review.success) items.push({ kind, id: fact.id, at: when, reason: review.data.reason, verdict: review.data.verdict })
		} else items.push({ kind, id: fact.id, at: when })
	}
	for (const entry of entries) {
		items.push({
			kind: IssueTimelineItemKind.MESSAGE,
			id: entry.id,
			at: entry.at.toISOString(),
			entryId: entry.id,
			transcriptKind: entry.kind as TranscriptKind,
			text: entry.text,
			classification: (entry.classification ?? undefined) as ClassificationMethod | undefined,
			level: entry.level ?? undefined,
			routing: entry.routing ?? undefined,
		})
	}
	for (const steer of steers) {
		const payload = SteerPayloadSchema.safeParse(steer.payload)
		items.push({
			kind: IssueTimelineItemKind.STEER,
			id: steer.id,
			at: steer.createdAt.toISOString(),
			text: payload.success ? payload.data.text : '',
			deliveredAt: steer.firstClaimedAt?.toISOString(),
			readAt: steer.consumedAt?.toISOString(),
			// Nudges are `NUDGED` items now (filtered above); the flag stays on the wire for the frozen shape.
			reminder: false,
		})
	}
	for (const file of files) {
		items.push({
			kind: IssueTimelineItemKind.ARTIFACT,
			id: file.id,
			at: file.recordedAt.toISOString(),
			artifactId: file.id,
			artifactKind: file.kind,
			name: file.name,
		})
	}
	for (const stop of stopRows) {
		// The ask / answer columns are JSON owned by the TS core: a row that does not parse shows the stop
		// without them — the same posture as the steer payload above.
		const ask = StopAskSchema.safeParse(stop.ask).data
		const answer = StopAnswerSchema.safeParse(stop.answer).data
		items.push({
			kind: IssueTimelineItemKind.STOP_RAISED,
			id: stop.id,
			at: stop.raisedAt.toISOString(),
			stopId: stop.id,
			stopKind: stop.kind as StopKind,
			title: stop.title,
			ask: ask && {
				code: askCode(issueKey, stop.seq ?? undefined),
				question: ask.question,
				options: ask.options,
				dueAt: stop.dueAt?.toISOString(),
			},
		})
		if (stop.resolvedAt && stop.resolution) {
			items.push({
				kind: IssueTimelineItemKind.STOP_RESOLVED,
				id: `${stop.id}:resolved`,
				at: stop.resolvedAt.toISOString(),
				stopId: stop.id,
				resolution: stop.resolution,
				// What was answered, never who: `answered_by` is an address, and this item reaches the cloud.
				answer: answer && { kind: answer.kind, label: labelOfAnswer(ask, answer) },
			})
		}
	}

	for (const link of batchLinks) {
		// A destination not recorded yet has no instant and no moment on the timeline.
		if (!link.recordedAt) continue
		items.push({
			kind: IssueTimelineItemKind.BATCH_LINKED,
			id: `${link.batchId}:${link.n}`,
			at: link.recordedAt.toISOString(),
			batchCode: link.code,
			n: link.n,
		})
	}

	items.sort((a, b) => a.at.localeCompare(b.at))
	return items
}
