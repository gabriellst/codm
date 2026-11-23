import { injectable } from 'tsyringe-neo'
import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm'
import { LibSqlDatabaseDriver, type LibSqlTransaction } from '@codm/core-typescript'
import { agentMailbox, events } from '@codm/contracts/db'
import { MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import { IssueSpokeEvent } from '../../events/IssueSpokeEvent'
import { DeclaredWaitReader, WAIT_DECLARING_LEVELS } from './DeclaredWaitReader'

/**
 * The predicate over the agent's OWN store — its queue (`agent_mailbox`) and its facts (`shared_events`, the
 * `agent.issue_spoke` rows of the issue, the read `LibSqlHandoffNotes` already makes). One statement for any number of
 * issues: the last consumed item is a correlated subquery, ordered the way the reconciler picks "the turn that went
 * quiet" (`consumed_at`, ties by `id` — uuid v7, arrival order).
 */
@injectable()
export class LibSqlDeclaredWaitReader extends DeclaredWaitReader {
	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	async waiting(issueIds: readonly string[], tx?: LibSqlTransaction): Promise<Set<string>> {
		if (issueIds.length === 0 || WAIT_DECLARING_LEVELS.length === 0) return new Set()
		const db = tx ?? this.driver.db

		const lastTurnStartedAt = db
			.select({ at: agentMailbox.firstClaimedAt })
			.from(agentMailbox)
			.where(
				and(
					eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
					eq(agentMailbox.targetId, events.entityId),
					isNotNull(agentMailbox.consumedAt),
				),
			)
			.orderBy(desc(agentMailbox.consumedAt), desc(agentMailbox.id))
			.limit(1)

		const rows = await db
			.selectDistinct({ issueId: events.entityId })
			.from(events)
			.where(
				and(
					inArray(events.entityId, [...issueIds]),
					eq(events.name, IssueSpokeEvent.name),
					inArray(sql<string>`json_extract(${events.payload}, '$.level')`, [...WAIT_DECLARING_LEVELS]),
					gte(events.occurredAt, sql`(${lastTurnStartedAt})`),
				),
			)
		return new Set(rows.flatMap(row => (row.issueId ? [row.issueId] : [])))
	}
}
