import { and, eq, gt, inArray, isNull, max } from 'drizzle-orm'
import type { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox } from '@codm/contracts/db'
import { MailboxDeferCause, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'

/**
 * Per issue, the instant until which its next turn is DEFERRED by the provider's usage limit.
 *
 * Read by the DECLARED cause (`defer_cause = PROVIDER_LIMIT`, fase 5 S1) — never by the row's shape plus a join on
 * `paused`: the shape "runnable, no holder, lease in the future" is also a held issue's item (`HOLD`) and a retry
 * waiting its schedule (`RETRY`), and only the cause says whose wait it is. The latest such instant per issue is when it
 * can run again, unless an accepted turn of the provider or the recheck ceiling releases it sooner. Read-side only: the
 * BFF shows it, nothing decides on it.
 *
 * `issueIds` narrows the read for a single-issue view; absent reads every waiting issue (the overview).
 */
export function providerWaitByIssue(driver: LibSqlDatabaseDriver, issueIds?: readonly string[]): Promise<Map<string, Date>> {
	return deferredUntilByIssue(driver, MailboxDeferCause.PROVIDER_LIMIT, issueIds)
}

/**
 * Per issue, the instant its next attempt runs — a failed turn waiting out its calendar (`defer_cause = RETRY`, fase 5
 * S2): "nova tentativa às hh:mm". The sibling of `providerWaitByIssue`, by the same declared column.
 */
export function retryWaitByIssue(driver: LibSqlDatabaseDriver, issueIds?: readonly string[]): Promise<Map<string, Date>> {
	return deferredUntilByIssue(driver, MailboxDeferCause.RETRY, issueIds)
}

/** Per issue, the latest instant an item of the issue is deferred to, for ONE declared cause. */
async function deferredUntilByIssue(
	driver: LibSqlDatabaseDriver,
	cause: MailboxDeferCause,
	issueIds?: readonly string[],
): Promise<Map<string, Date>> {
	const rows = await driver.db
		.select({ issueId: agentMailbox.targetId, until: max(agentMailbox.leaseUntil) })
		.from(agentMailbox)
		.where(
			and(
				eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
				eq(agentMailbox.deferCause, cause),
				isNull(agentMailbox.consumedAt),
				isNull(agentMailbox.deadAt),
				isNull(agentMailbox.claimedBy),
				gt(agentMailbox.leaseUntil, new Date()),
				issueIds ? inArray(agentMailbox.targetId, [...issueIds]) : undefined,
			),
		)
		.groupBy(agentMailbox.targetId)
	const waiting = new Map<string, Date>()
	for (const row of rows) if (row.until) waiting.set(row.issueId, row.until)
	return waiting
}
