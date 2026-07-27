import { injectable } from 'tsyringe-neo'
import { and, isNotNull, lt } from 'drizzle-orm'
import { Handler, z, DrizzleDatabaseDriver } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { outbox } from '@codedm/contracts/db'

export const PruneOutboxInputSchema = z.object({})
export const PruneOutboxOutputSchema = z.object({ deleted: z.number().int().nonnegative() })

/**
 * PruneOutbox — the daily retention sweep over `shared_outbox`.
 *
 * WHY IT EXISTS NOW. Success used to DELETE the row. It cannot any more: the Go re-persist is
 * `INSERT ... ON CONFLICT(id) DO NOTHING`, so a deleted id is a re-insertable id, and delete plus
 * at-least-once delivery is re-dispatch. Both claimants therefore TOMBSTONE (`processed_at` set,
 * token released) and nothing on either side ever reclaims the space — on a desktop app that is
 * the user's own disk growing without bound.
 *
 * WHAT IT DELETES, AND WHAT IT MUST NEVER TOUCH. Only rows already terminal
 * (`processed_at IS NOT NULL`) and older than the window. A row with `processed_at IS NULL` is
 * either pending, leased, or crash-looping toward the poison sweep — deleting one is dropping an
 * undelivered event, so the `IS NOT NULL` half of the predicate is the load-bearing half. The
 * window is deliberately generous: a tombstone is also the dedup record that makes an at-least-once
 * redelivery a no-op, so pruning aggressively trades disk for correctness.
 *
 * SCOPE. `shared_outbox` ONLY. `shared_events` is the audit log; deleting from it has a different
 * cost and is a separate decision (plan §7).
 *
 * LANE-BLIND ON PURPOSE. This deletes terminal rows of ALL THREE lanes. The daemon and the gateway
 * share the file, so one janitor is enough and two would race for the same write lock; the reason
 * a lane predicate is mandatory on the CLAIM (a row must have exactly one possible claimant) does
 * not apply to reclaiming space from rows that are already finished.
 */
@injectable()
export class PruneOutbox extends Handler<typeof PruneOutboxInputSchema, typeof PruneOutboxOutputSchema> {
	readonly name = 'prune_outbox' as const
	readonly inputSchema = PruneOutboxInputSchema
	readonly outputSchema = PruneOutboxOutputSchema

	/** Retention window for a tombstone, in ms. */
	static readonly RETENTION_MS = 7 * 24 * 60 * 60 * 1000

	constructor(private readonly driver: DrizzleDatabaseDriver) {
		super()
	}

	protected async handle(_input: this['input'], _tx?: Transaction): Promise<this['output']> {
		const cutoff = new Date(Date.now() - PruneOutbox.RETENTION_MS)

		// The driver's write seam, NOT `withTransaction`: there is no aggregate, no domain event and
		// no unit of work here — this is a single bulk DELETE, and routing it through the UoW would
		// hold the process-wide write gate open around bookkeeping it does not need.
		const deleted = await this.driver.transaction(async tx => {
			const result = await tx
				.delete(outbox)
				.where(and(isNotNull(outbox.processedAt), lt(outbox.processedAt, cutoff)))
				.returning({ id: outbox.id })
			return result.length
		})

		return { deleted }
	}
}
