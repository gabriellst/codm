import { injectable } from 'tsyringe-neo'
import { and, desc, eq, gte, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { LibSqlDatabaseDriver, z } from '@codm/core-typescript'
import { agentMailbox, issues, outbox } from '@codm/contracts/db'
import { IssueStatus, MailboxTargetKind, type ProviderKind } from '@codm/contracts-typescript/wire/enums'

/** The payload mark `ReconcileStalledIssues` puts on the reminder steer it queues. */
const ReminderPayloadSchema = z.object({ declarationReminder: z.literal(true) })
import type { StalledIssueRef } from './StalledIssueReader'
import { StalledIssueReader } from './StalledIssueReader'

/**
 * How long an EXPIRED lease still counts as a turn in flight.
 *
 * Not a guess at how long a turn may run — that question is the lease's, and the lease already
 * answered it. This is only the settle time between "the lease lapsed" and "the dispatcher claimed it
 * again", which is one poll interval (≤2s). A minute is the reconcile cadence, so the grace can never
 * be the reason a retry and this scan collide.
 */
const EXPIRED_LEASE_GRACE_MS = 60 * 1000

@injectable()
export class LibSqlStalledIssueReader extends StalledIssueReader {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	/**
	 * SEM `tryCatchAsync`, e a assimetria com `OpenIssuesReader.openIssues` é deliberada — a mesma razão
	 * que `hasWorkingIssue` documenta do outro lado.
	 *
	 * Degradar para "nenhuma órfã" num erro de leitura é indistinguível de "está tudo bem", e o efeito é
	 * a varredura ficar verde para sempre enquanto issues se acumulam mentindo. Um reconciliador que não
	 * consegue ler tem de falhar ALTO: o job repete em um minuto e o erro aparece.
	 */
	async stalledIssues(): Promise<StalledIssueRef[]> {
		/**
		 * A LEASE THAT EXPIRED THIS LONG AGO IS NOT A TURN. One reconcile cadence of slack, so the
		 * ordinary retry — an item whose lease lapsed is claimable on the next poll, 250ms away — always
		 * wins the race against this scan. Anything still expired a full minute later has nobody coming
		 * for it.
		 */
		const abandonedBefore = new Date(Date.now() - EXPIRED_LEASE_GRACE_MS)

		const inFlightMailbox = this.driver.db
			.select({ one: sql`1` })
			.from(agentMailbox)
			.where(
				and(
					eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
					eq(agentMailbox.targetId, issues.id),
					isNull(agentMailbox.consumedAt),
					isNull(agentMailbox.deadAt),
					// THE HALF THAT WAS MISSING — see the class docblock. Unconsumed and unpoisoned is not
					// the same as in flight: an item claimed by a worker that died keeps both columns NULL
					// forever, and read as in-flight it made its issue permanently invisible here.
					or(isNull(agentMailbox.leaseUntil), gte(agentMailbox.leaseUntil, abandonedBefore)),
				),
			)

		const pendingOutbox = this.driver.db
			.select({ one: sql`1` })
			.from(outbox)
			.where(and(eq(outbox.entityId, issues.id), isNull(outbox.processedAt)))

		const rows = await this.driver.db
			.select({
				issueId: issues.id,
				ownerId: issues.ownerId,
				threadId: issues.threadId,
				key: issues.key,
				title: issues.title,
				provider: issues.provider,
			})
			.from(issues)
			.where(
				and(
					eq(issues.status, IssueStatus.WORKING),
					eq(issues.archived, false),
					sql`NOT EXISTS ${inFlightMailbox}`,
					sql`NOT EXISTS ${pendingOutbox}`,
				),
			)

		// The turn that went quiet: the issue's most recently consumed item. Per row, because stalled issues
		// are a handful per sweep and the question is "which ONE item", not an aggregate.
		const refs: StalledIssueRef[] = []
		for (const row of rows) {
			const recent = await this.driver.db
				.select({ id: agentMailbox.id, payload: agentMailbox.payload, consumedAt: agentMailbox.consumedAt })
				.from(agentMailbox)
				.where(
					and(
						eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
						eq(agentMailbox.targetId, row.issueId),
						isNotNull(agentMailbox.consumedAt),
					),
				)
				.orderBy(desc(agentMailbox.consumedAt))
				.limit(5)
			// TIES GO TO THE REMINDER. `consumed_at` is millisecond-grained, and a reminder can finish in the
			// same millisecond as the turn it follows (measured in the test hook). The reminder is always
			// queued AFTER that turn went quiet, so among the items sharing the latest instant, a reminder
			// means it was the last word.
			const latestAt = recent[0]?.consumedAt?.getTime()
			const latest = recent.filter(item => item.consumedAt?.getTime() === latestAt)
			const reminder = latest.find(item => ReminderPayloadSchema.safeParse(item.payload).success)
			refs.push({
				issueId: row.issueId,
				ownerId: row.ownerId,
				threadId: row.threadId,
				key: row.key,
				title: row.title,
				provider: row.provider as ProviderKind,
				lastConsumedItemId: (reminder ?? latest[0])?.id ?? null,
				lastTurnWasReminder: reminder !== undefined,
			})
		}
		return refs
	}
}
