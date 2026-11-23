import type { Transaction } from '@codm/core-typescript'
import type { StopKind } from '@codm/contracts-typescript/wire/enums'

/**
 * WHICH STOPS OF A TASK ARE OPEN RIGHT NOW (fase 5, item 3 — the rails re-checked when the supervisor acts). The model
 * call sits between the rule that made a task suspect and the action, so `ActOnSupervisorVerdict` asks again, inside the
 * transaction of its fact, before ANY verdict is carried out — a person's stop raised meanwhile (a decision, a question,
 * an approval…) leaves the task alone, and a stall someone resolved meanwhile is no longer what was suspected. What each
 * kind means is the reader's own table (`SUSPICION_OF_OPEN_STOP`), so the rule and the re-check never disagree.
 *
 * Read-only: the kinds and nothing else (no text, no ask), from `issue_stops` — the same BFF-style read of the thread's
 * table `LibSqlSuspectIssueReader` makes (`reads.thread`).
 */
export abstract class OpenStopReader {
	/** The kinds of the task's unresolved stops (one entry per stop). */
	abstract openStopKinds(issueId: string, tx?: Transaction): Promise<StopKind[]>
}
