import { and, eq, inArray, isNull } from 'drizzle-orm'
import { z, type LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox, issues as issueTable, stops, threads } from '@codm/contracts/db'
import { IssueLifeState, IssueStatus, MailboxDeferCause, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'

/** One unconsumed, unpoisoned queue item of the issue, reduced to what the rule reads. */
export interface PendingItem {
	/** A turn holds it now (claimed, lease in the future). */
	running: boolean
	/**
	 * Deferred (no holder, lease in the future), and WHY — the declared `defer_cause` (fase 5, S1). Absent when the item
	 * is not deferred.
	 */
	deferCause?: MailboxDeferCause
	/** The one declaration reminder (`ReconcileStalledIssues`). */
	reminder: boolean
}

/**
 * WHAT A DEFERRED ITEM SAYS ABOUT A NOT-HELD ISSUE — by its declared cause (fase 5, S1), never by the row's shape.
 *
 * - `PROVIDER_LIMIT` → WAITING_PROVIDER, as before the column.
 * - `RETRY` → WAITING_RETRY (no producer until S2).
 * - `HOLD` → QUEUED. A held issue is PAUSED before this table is read; a `HOLD` item on an issue that is no longer held
 *   is a pause that outlived its resume by at most the dispatcher's hold re-check (or until `ReleaseIssueWorkOnResume`
 *   frees it) — work about to run, not a provider wait. Before the column this read as WAITING_PROVIDER, the misread the
 *   spec's problem 6 names; it is the one reading this slice corrects.
 */
const DEFERRED_STATE: Record<MailboxDeferCause, IssueLifeState> = {
	[MailboxDeferCause.PROVIDER_LIMIT]: IssueLifeState.WAITING_PROVIDER,
	[MailboxDeferCause.RETRY]: IssueLifeState.WAITING_RETRY,
	[MailboxDeferCause.HOLD]: IssueLifeState.QUEUED,
}

/** The waits a deferral can declare, in precedence order — the first one any item of the issue states wins. */
const DEFERRED_WAITS = [IssueLifeState.WAITING_PROVIDER, IssueLifeState.WAITING_RETRY] as const

/** Whether the item is ready work for a slot — not deferred, or deferred by a cause that reads as queued. */
const isQueued = (item: PendingItem): boolean => item.deferCause === undefined || DEFERRED_STATE[item.deferCause] === IssueLifeState.QUEUED

/**
 * WHERE AN ISSUE'S WORK STANDS, by rule (fase 1, item 1 — §5 C1 of the plan). Pure, so the precedence is
 * testable on its own:
 *
 *  1. COMPLETED → DONE.
 *  1b. HELD — the issue or its conversation is paused (fase 2, item 2) → PAUSED. Above everything else
 *     because a held issue's deferred item is NOT a provider wait, and a queued one will not run: every
 *     state below would describe work that is not going to happen until somebody resumes it.
 *  2. A turn holds a lease → RUNNING (or REMINDED, when that turn is the reminder).
 *  3. Its next turn is deferred by the provider → WAITING_PROVIDER; by a retry's schedule → WAITING_RETRY
 *     (`DEFERRED_STATE`, by the declared cause).
 *  3b. Work is queued but the quota budget is holding the ISSUE lane FOR REAL — enforced, not observing
 *     (`QuotaStatusReader.holdsIssueLane`, fase 4) → WAITING_BUDGET. In observation the budget holds nothing, so
 *     the issue stays QUEUED: the board never shows a hold that is not happening.
 *  4. Work is queued for a slot → QUEUED (or REMINDED for a queued reminder).
 *  5. An open stop asks someone → WAITING_PERSON.
 *  6. Nothing at all → STALLED.
 *
 * Work beats a stop on purpose: a resolved stop queues a steer, and an issue about to run again is not
 * waiting on anyone. Never stored — a board that reads a stored state shows yesterday's.
 */
export function lifeStateOf(input: {
	status: IssueStatus
	held: boolean
	pending: readonly PendingItem[]
	openStops: number
	/** The quota budget holds the ISSUE lane for real (enforced) — fase 4. */
	budgetHeld: boolean
}): IssueLifeState {
	if (input.status === IssueStatus.COMPLETED) return IssueLifeState.DONE
	if (input.held) return IssueLifeState.PAUSED
	const running = input.pending.find(item => item.running)
	if (running) return running.reminder ? IssueLifeState.REMINDED : IssueLifeState.RUNNING
	const waits = new Set(input.pending.flatMap(item => (item.deferCause === undefined ? [] : [DEFERRED_STATE[item.deferCause]])))
	const wait = DEFERRED_WAITS.find(state => waits.has(state))
	if (wait) return wait
	const queued = input.pending.filter(isQueued)
	if (queued.length > 0 && input.budgetHeld) return IssueLifeState.WAITING_BUDGET
	if (queued.length > 0) return queued.every(item => item.reminder) ? IssueLifeState.REMINDED : IssueLifeState.QUEUED
	if (input.openStops > 0) return IssueLifeState.WAITING_PERSON
	return IssueLifeState.STALLED
}

/**
 * The inputs of `lifeStateOf` for many issues at once: their pending queue items and open stop counts.
 * Three reads, whatever the number of issues — the board asks for every open issue on each refresh. The
 * third is the hold (issue ⋈ thread `paused`), read here rather than asked of every caller. `budgetHeld` is the
 * agent's answer (`QuotaStatusReader.holdsIssueLane()`) — the same for every issue: the budget is the account's.
 */
export async function lifeStateByIssue(
	driver: LibSqlDatabaseDriver,
	issues: readonly { issueId: string; status: IssueStatus }[],
	budgetHeld: boolean,
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
			deferCause: agentMailbox.deferCause,
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
		const deferred = live && item.claimedBy === null
		list.push({
			running: live && item.claimedBy !== null,
			// No CHECK on the column (fase 5, S0a) — the enum closes it here. A cause only counts on a deferred row.
			deferCause: deferred && item.deferCause !== null ? z.enum(MailboxDeferCause).parse(item.deferCause) : undefined,
			reminder: isReminder(item.payload),
		})
		pending.set(item.issueId, list)
	}
	const heldRows = await driver.db
		.select({ issueId: issueTable.id, issuePaused: issueTable.paused, threadPaused: threads.paused })
		.from(issueTable)
		.leftJoin(threads, eq(threads.id, issueTable.threadId))
		.where(inArray(issueTable.id, ids))
	const held = new Set(heldRows.filter(row => row.issuePaused || row.threadPaused === true).map(row => row.issueId))

	const openStops = new Map<string, number>()
	for (const row of openStopRows) if (row.issueId) openStops.set(row.issueId, (openStops.get(row.issueId) ?? 0) + 1)

	for (const issue of issues) {
		states.set(
			issue.issueId,
			lifeStateOf({
				status: issue.status,
				held: held.has(issue.issueId),
				pending: pending.get(issue.issueId) ?? [],
				openStops: openStops.get(issue.issueId) ?? 0,
				budgetHeld,
			}),
		)
	}
	return states
}

/** The payload mark of the declaration reminder (`ReconcileStalledIssues`). */
const ReminderPayloadSchema = z.object({ declarationReminder: z.literal(true) })

function isReminder(payload: unknown): boolean {
	return ReminderPayloadSchema.safeParse(payload).success
}
