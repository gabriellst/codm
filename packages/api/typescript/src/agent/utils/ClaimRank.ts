import { sql, type SQL } from 'drizzle-orm'
import { IssuePriority, MailboxClaimClass, PriorityReason } from '@codm/contracts-typescript/wire/enums'

/**
 * Where a TASK stands in the queue by what it was born with (fase 4, item 4) — `CLIENT_BUG` ahead of every declared
 * priority, then `HIGH`, `NORMAL`, `LOW`. Total over (`PriorityReason`, `IssuePriority`): the reason decides first,
 * so a client's bug is never behind a merely declared `HIGH`, whatever priority it was born with.
 */
const TASK_RANK: Readonly<Record<PriorityReason, Readonly<Record<IssuePriority, number>>>> = {
	[PriorityReason.CLIENT_BUG]: { [IssuePriority.HIGH]: 1, [IssuePriority.NORMAL]: 1, [IssuePriority.LOW]: 1 },
	[PriorityReason.DECLARED]: { [IssuePriority.HIGH]: 2, [IssuePriority.NORMAL]: 3, [IssuePriority.LOW]: 4 },
	[PriorityReason.DEFAULT]: { [IssuePriority.HIGH]: 2, [IssuePriority.NORMAL]: 3, [IssuePriority.LOW]: 4 },
}

type RankByTask = Readonly<Record<PriorityReason, Readonly<Record<IssuePriority, number>>>>

/**
 * The answer to a decision someone was waiting on (`DECISION_ANSWER`, the spec's first class) goes ahead of every
 * task, whatever the task was born with — rank 0 in every cell.
 */
const AHEAD_OF_EVERY_TASK: RankByTask = {
	[PriorityReason.CLIENT_BUG]: { [IssuePriority.HIGH]: 0, [IssuePriority.NORMAL]: 0, [IssuePriority.LOW]: 0 },
	[PriorityReason.DECLARED]: { [IssuePriority.HIGH]: 0, [IssuePriority.NORMAL]: 0, [IssuePriority.LOW]: 0 },
	[PriorityReason.DEFAULT]: { [IssuePriority.HIGH]: 0, [IssuePriority.NORMAL]: 0, [IssuePriority.LOW]: 0 },
}

/**
 * THE CLAIM RANK (fase 4, item 4) — total over (`MailboxClaimClass` of the item, `PriorityReason` × `IssuePriority` of
 * its task); lower is claimed first. A `Record` over the enum, so a class added to the contract fails compilation
 * here until somebody places it; every class but `DECISION_ANSWER` ranks as its task does. The SQL `CASE` the
 * repository orders by is generated from this table (`claimRankSql`) — one table, two readers that cannot drift.
 *
 * What the rank orders is TARGETS, never the items of one target: the queue always hands a target's OLDEST ready item
 * (a priority never jumps an older item of its own task), and a target ranks by the best of its ready items. Equal
 * ranks go by arrival — `created_at`, then `id` (uuid v7) — the owner's decision of 19/11.
 */
export const CLAIM_RANK: Readonly<Record<MailboxClaimClass, RankByTask>> = {
	[MailboxClaimClass.DECISION_ANSWER]: AHEAD_OF_EVERY_TASK,
	[MailboxClaimClass.INTERRUPT]: TASK_RANK,
	[MailboxClaimClass.STEER]: TASK_RANK,
	[MailboxClaimClass.WORK]: TASK_RANK,
	[MailboxClaimClass.REMINDER]: TASK_RANK,
	[MailboxClaimClass.RESULT]: TASK_RANK,
	[MailboxClaimClass.OPERATOR]: TASK_RANK,
}

/** The rank of one item — what the in-memory twin orders by. */
export const claimRankOf = (claimClass: MailboxClaimClass, reason: PriorityReason, priority: IssuePriority): number =>
	CLAIM_RANK[claimClass][reason][priority]

/**
 * The rank as a SQL `CASE` over three column expressions, generated from `CLAIM_RANK` — one `WHEN` per cell, values
 * bound as parameters. The caller resolves a task with no attributes row to its birth defaults before handing the
 * columns in (`COALESCE`), so every row matches exactly one `WHEN`; the `ELSE` is the last rank, for a value the
 * enum does not know (the columns carry no CHECK on `agent_mailbox.claim_class`).
 */
export function claimRankSql(claimClass: SQL, reason: SQL, priority: SQL): SQL {
	const cells: SQL[] = []
	let worst = 0
	for (const [cls, byReason] of Object.entries(CLAIM_RANK)) {
		for (const [why, byPriority] of Object.entries(byReason)) {
			for (const [priorityValue, rank] of Object.entries(byPriority)) {
				worst = Math.max(worst, rank)
				cells.push(sql`WHEN ${claimClass} = ${cls} AND ${reason} = ${why} AND ${priority} = ${priorityValue} THEN ${rank}`)
			}
		}
	}
	return sql`(CASE ${sql.join(cells, sql` `)} ELSE ${worst} END)`
}
