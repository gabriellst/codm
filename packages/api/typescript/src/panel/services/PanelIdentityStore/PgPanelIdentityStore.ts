import { injectable } from 'tsyringe-neo'
import { and, asc, desc, eq, gte, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import { PgDatabaseDriver, PgTransaction } from '@codm/core-typescript'
import { panelCodeRequests, panelGroups, panelSessions } from '@codm/contracts/db/pg'
import {
	PanelIdentityStore,
	type PanelCodeRequestRow,
	type PanelIdentityGroup,
	type PanelMember,
	type PanelSessionRow,
} from './PanelIdentityStore'

@injectable()
export class PgPanelIdentityStore extends PanelIdentityStore {
	constructor(private driver: PgDatabaseDriver) {
		super()
	}

	async groupByToken(token: string, tx?: PgTransaction): Promise<PanelIdentityGroup | undefined> {
		const [group] = await (tx ?? this.driver.db)
			.select({ threadId: panelGroups.threadId, ownerId: panelGroups.ownerId, members: panelGroups.members })
			.from(panelGroups)
			.where(eq(panelGroups.token, token))
			.limit(1)
		return group
	}

	async replaceMembers(ownerId: string, threadId: string, members: readonly PanelMember[], tx?: PgTransaction): Promise<boolean> {
		const rows = await (tx ?? this.driver.db)
			.update(panelGroups)
			.set({ members: [...members] })
			.where(and(eq(panelGroups.threadId, threadId), eq(panelGroups.ownerId, ownerId)))
			.returning({ threadId: panelGroups.threadId })
		return rows.length > 0
	}

	async requestTimes(threadId: string, memberId: string | undefined, since: Date, tx?: PgTransaction): Promise<Date[]> {
		const rows = await (tx ?? this.driver.db)
			.select({ requestedAt: panelCodeRequests.requestedAt })
			.from(panelCodeRequests)
			.where(
				and(
					eq(panelCodeRequests.threadId, threadId),
					memberId === undefined ? undefined : eq(panelCodeRequests.memberId, memberId),
					gte(panelCodeRequests.requestedAt, since),
				),
			)
		return rows.map(row => row.requestedAt)
	}

	async insertRequest(row: PanelCodeRequestRow, tx?: PgTransaction): Promise<void> {
		await (tx ?? this.driver.db).insert(panelCodeRequests).values(row)
	}

	async pendingRequests(ownerId: string, since: Date, tx?: PgTransaction): Promise<PanelCodeRequestRow[]> {
		return (tx ?? this.driver.db)
			.select()
			.from(panelCodeRequests)
			.where(and(eq(panelCodeRequests.ownerId, ownerId), isNull(panelCodeRequests.issuedAt), gte(panelCodeRequests.requestedAt, since)))
			.orderBy(asc(panelCodeRequests.requestedAt))
	}

	async issue(request: PanelCodeRequestRow, codeHash: string, issuedAt: Date, expiresAt: Date, tx?: PgTransaction): Promise<boolean> {
		const rows = await (tx ?? this.driver.db)
			.update(panelCodeRequests)
			.set({ codeHash, issuedAt, expiresAt })
			// Only once: a request handed over is never re-minted by a concurrent pull.
			.where(and(eq(panelCodeRequests.id, request.id), isNull(panelCodeRequests.issuedAt)))
			.returning({ id: panelCodeRequests.id })
		return rows.length > 0
	}

	async latestIssued(threadId: string, memberId: string, tx?: PgTransaction): Promise<PanelCodeRequestRow | undefined> {
		const [row] = await (tx ?? this.driver.db)
			.select()
			.from(panelCodeRequests)
			.where(and(eq(panelCodeRequests.threadId, threadId), eq(panelCodeRequests.memberId, memberId), isNotNull(panelCodeRequests.issuedAt)))
			.orderBy(desc(panelCodeRequests.issuedAt))
			.limit(1)
		return row
	}

	async spendAttempt(requestId: string, max: number, tx?: PgTransaction): Promise<number | undefined> {
		const [row] = await (tx ?? this.driver.db)
			.update(panelCodeRequests)
			.set({ attempts: sql`${panelCodeRequests.attempts} + 1` })
			.where(and(eq(panelCodeRequests.id, requestId), lt(panelCodeRequests.attempts, max)))
			.returning({ attempts: panelCodeRequests.attempts })
		return row?.attempts
	}

	async consume(requestId: string, at: Date, tx?: PgTransaction): Promise<boolean> {
		const rows = await (tx ?? this.driver.db)
			.update(panelCodeRequests)
			.set({ usedAt: at })
			.where(and(eq(panelCodeRequests.id, requestId), isNull(panelCodeRequests.usedAt)))
			.returning({ id: panelCodeRequests.id })
		return rows.length > 0
	}

	async insertSession(row: PanelSessionRow, tx?: PgTransaction): Promise<void> {
		await (tx ?? this.driver.db).insert(panelSessions).values(row)
	}

	async findSession(tokenHash: string, tx?: PgTransaction): Promise<PanelSessionRow | undefined> {
		const [row] = await (tx ?? this.driver.db).select().from(panelSessions).where(eq(panelSessions.tokenHash, tokenHash)).limit(1)
		return row
	}

	async deleteSession(tokenHash: string, tx?: PgTransaction): Promise<void> {
		await (tx ?? this.driver.db).delete(panelSessions).where(eq(panelSessions.tokenHash, tokenHash))
	}

	async revokeGroup(threadId: string, tx?: PgTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		await dbc.delete(panelSessions).where(eq(panelSessions.threadId, threadId))
		await dbc.delete(panelCodeRequests).where(eq(panelCodeRequests.threadId, threadId))
	}

	async purge(ownerId: string, requestsBefore: Date, now: Date, tx?: PgTransaction): Promise<void> {
		const dbc = tx ?? this.driver.db
		await dbc
			.delete(panelCodeRequests)
			.where(and(eq(panelCodeRequests.ownerId, ownerId), lt(panelCodeRequests.requestedAt, requestsBefore)))
		await dbc.delete(panelSessions).where(and(eq(panelSessions.ownerId, ownerId), lt(panelSessions.expiresAt, now)))
	}
}
