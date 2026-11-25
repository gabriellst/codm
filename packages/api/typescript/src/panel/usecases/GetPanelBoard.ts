import { injectable } from 'tsyringe-neo'
import { and, desc, eq } from 'drizzle-orm'
import { Handler, PgDatabaseDriver, z, BaseError } from '@codm/core-typescript'
import { panelBatches, panelDaemons, panelIssues } from '@codm/contracts/db/pg'
import { IssueLifeState, IssueStatus, IssueTimelineItemKind } from '@codm/contracts-typescript/wire/enums'
import { BatchSchema, PanelHealthSchema } from '@shared/objects'
import { AskViewSchema, type AskView } from '@shared/schemas'
import type { ApplicationErrors } from '../errors'
import { parseOpenStops } from '../utils/openStops'
import { panelGroupByToken } from './panelGroupByToken'

/** Only the kind of each stored timeline item — enough to count artifacts without re-validating the whole row. */
const TimelineKindsSchema = z.array(z.object({ kind: z.string() }))

export const GetPanelBoardInputSchema = z.object({ token: z.string().min(16).max(128) })
export const GetPanelBoardOutputSchema = z.object({
	group: z.object({ name: z.string() }),
	/** When the owner's daemon last reported (ISO) — absent if it never did. The panel says "sem contato há N min". */
	daemonLastSeenAt: z.string().optional(),
	/** The owner's health badge as the daemon last reported it (fase 4, item 7) — absent before a fase-4 daemon did. */
	health: PanelHealthSchema.optional(),
	/** The group's batches (fase 4, item 5), newest first — the page opens one at `#L-31`. */
	batches: z.array(BatchSchema),
	issues: z.array(
		z.object({
			issueId: z.uuid(),
			key: z.string(),
			title: z.string(),
			status: z.enum(IssueStatus),
			lifeState: z.enum(IssueLifeState),
			waitingForProviderUntil: z.string().optional(),
			/** Fase 5 — ISO instant of a failed turn's next attempt (`WAITING_RETRY`); absent otherwise (filled from S2). */
			retryingAt: z.string().optional(),
			/** Fase 5 — ISO instant the supervisor last escalated the issue (badge only; nobody is messaged); absent otherwise (filled from S5). */
			escalatedAt: z.string().optional(),
			updatedAt: z.string(),
			/**
			 * The issue's open asks, in the order the daemon reported them — what a card in "Precisa de você"
			 * says ("D1 · publico agora?", or the default a question goes on with). The same view the issue
			 * page's `openStops` carry; read from the group's open stops the roster push stored; empty when none.
			 */
			openAsks: z.array(AskViewSchema),
			/** How many artifacts the issue's stored timeline lists — "2 artefatos" on a card. */
			artifactCount: z.number().int().min(0),
		}),
	),
})

/** The most batches the board carries — the newest. */
export const PANEL_BOARD_BATCHES_MAX = 50

/** Query — the board of ONE group, by its link token (public). Archived issues are off the board. */
@injectable()
export class GetPanelBoard extends Handler<typeof GetPanelBoardInputSchema, typeof GetPanelBoardOutputSchema> {
	readonly name = 'get_panel_board' as const
	readonly inputSchema = GetPanelBoardInputSchema
	readonly outputSchema = GetPanelBoardOutputSchema

	constructor(private readonly driver: PgDatabaseDriver) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const group = await panelGroupByToken(this.driver, input.token)
		if (!group) throw new BaseError<ApplicationErrors>('PANEL_NOT_FOUND', 'no panel for this link')
		const [issues, [daemon], batchRows] = await Promise.all([
			this.driver.db
				.select()
				.from(panelIssues)
				.where(and(eq(panelIssues.threadId, group.threadId), eq(panelIssues.ownerId, group.ownerId), eq(panelIssues.archived, false))),
			this.driver.db.select().from(panelDaemons).where(eq(panelDaemons.ownerId, group.ownerId)).limit(1),
			this.driver.db
				.select()
				.from(panelBatches)
				.where(and(eq(panelBatches.threadId, group.threadId), eq(panelBatches.ownerId, group.ownerId)))
				.orderBy(desc(panelBatches.updatedAt))
				.limit(PANEL_BOARD_BATCHES_MAX),
		])
		// The JSON columns are the TS core's: parsed on the way out, and a row that no longer parses is left out.
		const health = PanelHealthSchema.safeParse(daemon?.health)
		const batches = batchRows.flatMap(row => {
			const parsed = BatchSchema.safeParse(row.batch)
			return parsed.success ? [parsed.data] : []
		})
		const asksByIssue = new Map<string, AskView[]>()
		for (const stop of parseOpenStops(group.openStops ?? [])) {
			if (!stop.ask) continue
			const list = asksByIssue.get(stop.issueId) ?? []
			list.push(stop.ask)
			asksByIssue.set(stop.issueId, list)
		}
		const artifactCountOf = (timeline: unknown): number => {
			const kinds = TimelineKindsSchema.safeParse(timeline)
			return kinds.success ? kinds.data.filter(item => item.kind === IssueTimelineItemKind.ARTIFACT).length : 0
		}
		return {
			group: { name: group.name },
			daemonLastSeenAt: daemon?.lastSeenAt.toISOString(),
			...(health.success && { health: health.data }),
			batches,
			issues: issues.map(issue => ({
				issueId: issue.issueId,
				key: issue.key,
				title: issue.title,
				status: issue.status,
				lifeState: issue.lifeState,
				waitingForProviderUntil: issue.waitingForProviderUntil?.toISOString(),
				retryingAt: issue.retryingAt?.toISOString(),
				escalatedAt: issue.escalatedAt?.toISOString(),
				updatedAt: issue.updatedAt.toISOString(),
				openAsks: asksByIssue.get(issue.issueId) ?? [],
				artifactCount: artifactCountOf(issue.timeline),
			})),
		}
	}
}
