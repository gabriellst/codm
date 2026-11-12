import { injectable } from 'tsyringe-neo'
import { and, eq, inArray } from 'drizzle-orm'
import { LibSqlDatabaseDriver, Handler, z, BaseError } from '@codm/core-typescript'
import { agentMailbox, artifacts, events, issues, stops, transcriptEntries } from '@codm/contracts/db'
import {
	ArtifactKind,
	ClassificationMethod,
	IssueTimelineItemKind,
	MailboxItemKind,
	MailboxTargetKind,
	StopKind,
	StopResolution,
	TranscriptKind,
} from '@codm/contracts-typescript/wire/enums'
import type Z from 'zod'
import type { ApplicationErrors } from '../errors'

const at = z.string()
/** Stable per item — the source row (event, entry, queue item, artifact, stop), so a list key never shifts. */
const id = z.string()

/**
 * One moment of an issue's life. A DISCRIMINATED union on `kind` — each kind carries only its own
 * fields, and the console renders each member on its own (Non-Negotiable 3), never an all-optional row.
 */
const TimelineItemSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal(IssueTimelineItemKind.CREATED), id, at, title: z.string() }),
	z.object({ kind: z.literal(IssueTimelineItemKind.TURN_STARTED), id, at }),
	z.object({
		kind: z.literal(IssueTimelineItemKind.MESSAGE),
		id,
		at,
		entryId: z.uuid(),
		transcriptKind: z.enum(TranscriptKind),
		text: z.string(),
		classification: z.enum(ClassificationMethod).optional(),
	}),
	z.object({
		kind: z.literal(IssueTimelineItemKind.STEER),
		id,
		at,
		text: z.string(),
		deliveredAt: z.string().optional(),
		readAt: z.string().optional(),
		/** The automatic declaration reminder, not something a person sent. */
		reminder: z.boolean(),
	}),
	z.object({
		kind: z.literal(IssueTimelineItemKind.ARTIFACT),
		id,
		at,
		artifactId: z.uuid(),
		artifactKind: z.enum(ArtifactKind),
		name: z.string(),
	}),
	z.object({ kind: z.literal(IssueTimelineItemKind.STOP_RAISED), id, at, stopId: z.uuid(), stopKind: z.enum(StopKind), title: z.string() }),
	z.object({ kind: z.literal(IssueTimelineItemKind.STOP_RESOLVED), id, at, stopId: z.uuid(), resolution: z.enum(StopResolution) }),
	z.object({ kind: z.literal(IssueTimelineItemKind.COMPLETED), id, at }),
	z.object({ kind: z.literal(IssueTimelineItemKind.ARCHIVED), id, at }),
])
export type IssueTimelineItem = Z.output<typeof TimelineItemSchema>

export const GetIssueTimelineInputSchema = z.object({ ownerId: z.uuid(), issueId: z.uuid() })
export const GetIssueTimelineOutputSchema = z.object({ items: z.array(TimelineItemSchema) })

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
 * Read — an issue's TIMELINE (fase 1, item 1): everything that happened to it, oldest first, from the
 * facts the system already records — no new table. Created, each turn, what was said about it (and the
 * replies that quoted it), every steer with its sent/delivered/read instants, its artifacts, its stops
 * and their answers, and how it ended.
 *
 * Before this, the only per-issue view was a terminal tail held in memory and lost on restart, and the
 * answer to "what happened with X?" was scrolling a group chat.
 */
@injectable()
export class GetIssueTimeline extends Handler<typeof GetIssueTimelineInputSchema, typeof GetIssueTimelineOutputSchema> {
	readonly name = 'get_issue_timeline' as const
	readonly inputSchema = GetIssueTimelineInputSchema
	readonly outputSchema = GetIssueTimelineOutputSchema

	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const db = this.driver.db
		const [issue] = await db
			.select({ ownerId: issues.ownerId, title: issues.title })
			.from(issues)
			.where(eq(issues.id, input.issueId))
			.limit(1)
		if (!issue || issue.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)

		const [facts, entries, steers, files, stopRows] = await Promise.all([
			db
				.select({ id: events.id, name: events.name, occurredAt: events.occurredAt })
				.from(events)
				.where(and(eq(events.entityId, input.issueId), inArray(events.name, EVENT_NAMES))),
			db.select().from(transcriptEntries).where(eq(transcriptEntries.issueId, input.issueId)),
			db
				.select()
				.from(agentMailbox)
				.where(
					and(
						eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
						eq(agentMailbox.targetId, input.issueId),
						eq(agentMailbox.kind, MailboxItemKind.STEER),
					),
				),
			db.select().from(artifacts).where(eq(artifacts.issueId, input.issueId)),
			db.select().from(stops).where(eq(stops.issueId, input.issueId)),
		])

		const items: IssueTimelineItem[] = []
		for (const fact of facts) {
			const kind = EVENT_KINDS[fact.name as EventName]
			const when = fact.occurredAt.toISOString()
			if (kind === IssueTimelineItemKind.CREATED) items.push({ kind, id: fact.id, at: when, title: issue.title })
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
		return { items }
	}
}
