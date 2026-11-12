import { and, eq, gt, inArray, isNotNull, isNull, max } from 'drizzle-orm'
import type { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import { MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'

/**
 * Per issue, the instant until which its next turn is DEFERRED by the provider's usage limit.
 *
 * A deferral is the one row shape nothing else writes: runnable, a lease in the future, and no holder
 * (`MailboxRepository.defer` — see `releaseDeferred` for the same predicate on the write side). The
 * latest such instant per issue is when it can run again, unless the dispatcher's probe or a restart
 * releases it sooner. Read-side only: the BFF shows it, nothing decides on it.
 *
 * `issueIds` narrows the read for a single-issue view; absent reads every waiting issue (the overview).
 */
export async function providerWaitByIssue(driver: LibSqlDatabaseDriver, issueIds?: readonly string[]): Promise<Map<string, Date>> {
	const rows = await driver.db
		.select({ issueId: agentMailbox.targetId, until: max(agentMailbox.leaseUntil) })
		.from(agentMailbox)
		.where(
			and(
				eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
				isNull(agentMailbox.consumedAt),
				isNull(agentMailbox.deadAt),
				isNull(agentMailbox.claimedBy),
				isNotNull(agentMailbox.leaseUntil),
				gt(agentMailbox.leaseUntil, new Date()),
				issueIds ? inArray(agentMailbox.targetId, [...issueIds]) : undefined,
			),
		)
		.groupBy(agentMailbox.targetId)
	const waiting = new Map<string, Date>()
	for (const row of rows) if (row.until) waiting.set(row.issueId, row.until)
	return waiting
}
