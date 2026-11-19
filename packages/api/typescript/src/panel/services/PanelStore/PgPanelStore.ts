import { injectable } from 'tsyringe-neo'
import { and, eq, sql } from 'drizzle-orm'
import { PgDatabaseDriver, PgTransaction } from '@codm/core-typescript'
import { panelBatches, panelDaemons, panelGroups, panelIssues } from '@codm/contracts/db/pg'
import type { PanelHealth } from '@shared/objects'
import { PanelStore, type PanelBatchRow, type PanelGroupRow, type PanelIssueRow } from './PanelStore'

@injectable()
export class PgPanelStore extends PanelStore {
	constructor(private driver: PgDatabaseDriver) {
		super()
	}

	async upsertGroup(group: Omit<PanelGroupRow, 'token'>, token: string, tx?: PgTransaction): Promise<string> {
		const dbc = tx ?? this.driver.db
		// The token is set only on INSERT; an existing group keeps its link and only refreshes its name.
		const [row] = await dbc
			.insert(panelGroups)
			.values({ threadId: group.threadId, ownerId: group.ownerId, name: group.name, token })
			.onConflictDoUpdate({
				target: panelGroups.threadId,
				set: { name: group.name },
				// A thread id already registered by ANOTHER owner is not taken over: nothing is updated.
				setWhere: eq(panelGroups.ownerId, group.ownerId),
			})
			.returning({ token: panelGroups.token, ownerId: panelGroups.ownerId })
		if (row && row.ownerId === group.ownerId) return row.token
		const [existing] = await dbc
			.select({ token: panelGroups.token })
			.from(panelGroups)
			.where(and(eq(panelGroups.threadId, group.threadId), eq(panelGroups.ownerId, group.ownerId)))
		return existing?.token ?? ''
	}

	async upsertIssues(issues: readonly PanelIssueRow[], tx?: PgTransaction): Promise<void> {
		if (issues.length === 0) return
		const dbc = tx ?? this.driver.db
		await dbc
			.insert(panelIssues)
			.values([...issues])
			.onConflictDoUpdate({
				target: panelIssues.issueId,
				set: {
					threadId: sql`excluded.thread_id`,
					key: sql`excluded.key`,
					title: sql`excluded.title`,
					status: sql`excluded.status`,
					lifeState: sql`excluded.life_state`,
					waitingForProviderUntil: sql`excluded.waiting_for_provider_until`,
					retryingAt: sql`excluded.retrying_at`,
					escalatedAt: sql`excluded.escalated_at`,
					archived: sql`excluded.archived`,
					timeline: sql`excluded.timeline`,
					updatedAt: sql`excluded.updated_at`,
				},
				// Never overwrite another owner's row, and never go back in time on a late retry.
				setWhere: sql`${panelIssues.ownerId} = excluded.owner_id AND ${panelIssues.updatedAt} <= excluded.updated_at`,
			})
	}

	async upsertBatches(batches: readonly PanelBatchRow[], tx?: PgTransaction): Promise<void> {
		if (batches.length === 0) return
		const dbc = tx ?? this.driver.db
		await dbc
			.insert(panelBatches)
			.values([...batches])
			.onConflictDoUpdate({
				target: [panelBatches.threadId, panelBatches.code],
				set: { batch: sql`excluded.batch`, updatedAt: sql`excluded.updated_at` },
				// Never overwrite another owner's row.
				setWhere: sql`${panelBatches.ownerId} = excluded.owner_id`,
			})
	}

	async touchDaemon(ownerId: string, at: Date, tx?: PgTransaction, health?: PanelHealth): Promise<void> {
		const dbc = tx ?? this.driver.db
		await dbc
			.insert(panelDaemons)
			.values({ ownerId, lastSeenAt: at, ...(health && { health }) })
			.onConflictDoUpdate({ target: panelDaemons.ownerId, set: { lastSeenAt: at, ...(health && { health }) } })
	}

	async rotateToken(ownerId: string, threadId: string, token: string, tx?: PgTransaction): Promise<boolean> {
		const dbc = tx ?? this.driver.db
		const rows = await dbc
			.update(panelGroups)
			.set({ token, rotatedAt: new Date() })
			.where(and(eq(panelGroups.threadId, threadId), eq(panelGroups.ownerId, ownerId)))
			.returning({ threadId: panelGroups.threadId })
		return rows.length > 0
	}

	async findIssue(ownerId: string, threadId: string, issueId: string, tx?: PgTransaction): Promise<PanelIssueRow | undefined> {
		const [row] = await (tx ?? this.driver.db)
			.select()
			.from(panelIssues)
			.where(and(eq(panelIssues.issueId, issueId), eq(panelIssues.threadId, threadId), eq(panelIssues.ownerId, ownerId)))
			.limit(1)
		return row
	}
}
