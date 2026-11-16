import { and, eq, inArray } from 'drizzle-orm'
import { z, type LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox, artifacts, events, stops, transcriptEntries } from '@codm/contracts/db'
import {
	type ClassificationMethod,
	IssueTimelineItemKind,
	MailboxItemKind,
	MailboxTargetKind,
	type StopKind,
	type TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import type { IssueTimelineItem } from '@shared/schemas'

/** Fact names on `shared_events` that become a timeline moment, and which one. */
const EVENT_KINDS = {
	'agent.issue_forked': IssueTimelineItemKind.CREATED,
	'agent.run.started': IssueTimelineItemKind.TURN_STARTED,
	'agent.run.completed': IssueTimelineItemKind.COMPLETED,
	'issue.archived': IssueTimelineItemKind.ARCHIVED,
} as const satisfies Record<string, IssueTimelineItemKind>
type EventName = keyof typeof EVENT_KINDS
const EVENT_NAMES = Object.keys(EVENT_KINDS) as EventName[]

const SteerPayloadSchema = z.object({ text: z.string(), declarationReminder: z.literal(true).optional() })

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
	const [facts, entries, steers, files, stopRows] = await Promise.all([
		db
			.select({ id: events.id, name: events.name, occurredAt: events.occurredAt })
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
				),
			),
		db.select().from(artifacts).where(eq(artifacts.issueId, issueId)),
		db.select().from(stops).where(eq(stops.issueId, issueId)),
	])

	const items: IssueTimelineItem[] = []
	for (const fact of facts) {
		const kind = EVENT_KINDS[fact.name as EventName]
		const when = fact.occurredAt.toISOString()
		if (kind === IssueTimelineItemKind.CREATED) items.push({ kind, id: fact.id, at: when, title })
		else items.push({ kind, id: fact.id, at: when })
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
			reminder: payload.success && payload.data.declarationReminder === true,
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
		items.push({
			kind: IssueTimelineItemKind.STOP_RAISED,
			id: stop.id,
			at: stop.raisedAt.toISOString(),
			stopId: stop.id,
			stopKind: stop.kind as StopKind,
			title: stop.title,
		})
		if (stop.resolvedAt && stop.resolution) {
			items.push({
				kind: IssueTimelineItemKind.STOP_RESOLVED,
				id: `${stop.id}:resolved`,
				at: stop.resolvedAt.toISOString(),
				stopId: stop.id,
				resolution: stop.resolution,
			})
		}
	}

	items.sort((a, b) => a.at.localeCompare(b.at))
	return items
}
