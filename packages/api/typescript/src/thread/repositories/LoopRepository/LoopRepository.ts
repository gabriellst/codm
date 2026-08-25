import { Repository } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { Loop } from '../../entities/Loop'

export abstract class LoopRepository extends Repository<Loop> {
	abstract findById(id: string, tx?: Transaction): Promise<Loop | undefined>
	/** Every loop of one conversation, in the order the console lists them (next run first). */
	abstract listByThread(threadId: string, tx?: Transaction): Promise<Loop[]>

	/**
	 * The loops that should fire at `now` — `enabled AND next_run_at <= now`, oldest first.
	 *
	 * The sweep's only query, and the reason `next_run_at` is a stored column instead of something
	 * recomputed per row (see the table docblock). `limit` bounds one tick: a daemon that comes back
	 * after a long sleep with many overdue loops drains them across ticks instead of holding one
	 * transaction open over all of them.
	 */
	abstract findDue(now: Date, limit: number, tx?: Transaction): Promise<Loop[]>
}
