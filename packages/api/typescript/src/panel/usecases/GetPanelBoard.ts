import { injectable } from 'tsyringe-neo'
import { and, desc, eq } from 'drizzle-orm'
import { Handler, PgDatabaseDriver, z, BaseError } from '@codm/core-typescript'
import { panelBatches, panelDaemons, panelIssues } from '@codm/contracts/db/pg'
import { IssueLifeState, IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { BatchSchema, PanelHealthSchema } from '@shared/objects'
import type { ApplicationErrors } from '../errors'
import { panelGroupByToken } from './panelGroupByToken'

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
			})),
		}
	}
}
