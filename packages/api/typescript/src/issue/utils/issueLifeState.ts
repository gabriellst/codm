import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z, type LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox, stops } from '@codm/contracts/db'
import { IssueLifeState, IssueStatus, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'

/** One unconsumed, unpoisoned queue item of the issue, reduced to what the rule reads. */
export interface PendingItem {
	/** A turn holds it now (claimed, lease in the future). */
	running: boolean
	/** Deferred by the provider's usage limit (no holder, lease in the future). */
	deferred: boolean
	/** The one declaration reminder (`ReconcileStalledIssues`). */
	reminder: boolean
}

/**
 * WHERE AN ISSUE'S WORK STANDS, by rule (fase 1, item 1 — §5 C1 of the plan). Pure, so the precedence is
 * testable on its own:
 *
 *  1. COMPLETED → DONE.
 *  2. A turn holds a lease → RUNNING (or REMINDED, when that turn is the reminder).
 *  3. Its next turn is deferred by the provider → WAITING_PROVIDER.
 *  4. Work is queued for a slot → QUEUED (or REMINDED for a queued reminder).
 *  5. An open stop asks someone → WAITING_PERSON.
 *  6. Nothing at all → STALLED.
 *
 * Work beats a stop on purpose: a resolved stop queues a steer, and an issue about to run again is not
 * waiting on anyone. Never stored — a board that reads a stored state shows yesterday's.
 */
export function lifeStateOf(input: { status: IssueStatus; pending: readonly PendingItem[]; openStops: number }): IssueLifeState {
	if (input.status === IssueStatus.COMPLETED) return IssueLifeState.DONE
	const running = input.pending.find(item => item.running)
	if (running) return running.reminder ? IssueLifeState.REMINDED : IssueLifeState.RUNNING
	if (input.pending.some(item => item.deferred)) return IssueLifeState.WAITING_PROVIDER
	const queued = input.pending.filter(item => !item.deferred)
	if (queued.length > 0) return queued.every(item => item.reminder) ? IssueLifeState.REMINDED : IssueLifeState.QUEUED
	if (input.openStops > 0) return IssueLifeState.WAITING_PERSON
	return IssueLifeState.STALLED
}

/**
 * The inputs of `lifeStateOf` for many issues at once: their pending queue items and open stop counts.
 * Two reads, whatever the number of issues — the board asks for every open issue on each refresh.
 */
export async function lifeStateByIssue(
	driver: LibSqlDatabaseDriver,
	issues: readonly { issueId: string; status: IssueStatus }[],
): Promise<Map<string, IssueLifeState>> {
	const ids = issues.map(issue => issue.issueId)
	const states = new Map<string, IssueLifeState>()
	if (ids.length === 0) return states

	const now = Date.now()
	const items = await driver.db
		.select({
			issueId: agentMailbox.targetId,
			claimedBy: agentMailbox.claimedBy,
			leaseUntil: agentMailbox.leaseUntil,
			payload: agentMailbox.payload,
		})
		.from(agentMailbox)
		.where(
			and(
				eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
				inArray(agentMailbox.targetId, ids),
				isNull(agentMailbox.consumedAt),
				isNull(agentMailbox.deadAt),
			),
		)
	const openStopRows = await driver.db
		.select({ issueId: stops.issueId })
		.from(stops)
		.where(and(inArray(stops.issueId, ids), isNull(stops.resolvedAt)))

	const pending = new Map<string, PendingItem[]>()
	for (const item of items) {
		const live = item.leaseUntil !== null && item.leaseUntil.getTime() > now
		const list = pending.get(item.issueId) ?? []
		list.push({
			running: live && item.claimedBy !== null,
			deferred: live && item.claimedBy === null,
			reminder: isReminder(item.payload),
		})
		pending.set(item.issueId, list)
	}
	const openStops = new Map<string, number>()
	for (const row of openStopRows) if (row.issueId) openStops.set(row.issueId, (openStops.get(row.issueId) ?? 0) + 1)

	for (const issue of issues) {
		states.set(
			issue.issueId,
			lifeStateOf({ status: issue.status, pending: pending.get(issue.issueId) ?? [], openStops: openStops.get(issue.issueId) ?? 0 }),
		)
	}
	return states
}

/** The payload mark of the declaration reminder (`ReconcileStalledIssues`). */
const ReminderPayloadSchema = z.object({ declarationReminder: z.literal(true) })

function isReminder(payload: unknown): boolean {
	return ReminderPayloadSchema.safeParse(payload).success
}
