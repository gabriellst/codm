import type { Transaction } from '@codm/core-typescript'
import type { PanelActionKind, PanelActionOutcome } from '@codm/contracts-typescript/wire/enums'

export interface PanelActionLedgerRow {
	/** The cloud's action id. */
	actionId: string
	ownerId: string
	threadId: string
	kind: PanelActionKind
	outcome: PanelActionOutcome
	/** The refusal's error code. */
	code?: string
	executedAt: Date
}

/**
 * The daemon's ledger of panel actions (fase 2, item 6b) — the exactly-once latch AND the outbox of
 * outcomes the cloud has not acknowledged yet.
 *
 * `record` is the latch: an `INSERT … ON CONFLICT DO NOTHING` on the action id, run in the SAME
 * transaction as the effect it records — true only for the first writer, so an action the cloud hands
 * out twice (a lost response, a re-delivery) is executed once. Outcomes stay `unreported` until a pull
 * carrying them succeeded, so a failed pull or a restart re-sends instead of losing them.
 */
export abstract class PanelActionLedger {
	/** Record an action's outcome — true when this call wrote it, false when the action was already recorded. */
	abstract record(row: PanelActionLedgerRow, tx?: Transaction): Promise<boolean>
	abstract find(actionId: string, tx?: Transaction): Promise<PanelActionLedgerRow | undefined>
	/** Outcomes not yet carried by a successful pull, oldest first. */
	abstract unreported(limit: number, tx?: Transaction): Promise<PanelActionLedgerRow[]>
	abstract markReported(actionIds: readonly string[], at: Date, tx?: Transaction): Promise<void>
	/** Forget reported actions executed before `before` — the cloud stops handing an action out long before. */
	abstract purge(before: Date, tx?: Transaction): Promise<void>
}
