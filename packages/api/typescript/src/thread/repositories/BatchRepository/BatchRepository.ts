import { Repository } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import type { Batch } from '../../entities/Batch'

export abstract class BatchRepository extends Repository<Batch> {
	abstract findById(id: string, tx?: Transaction): Promise<Batch | undefined>
	/** A conversation's batch by the code people quote (`L-31`). */
	abstract findByCode(threadId: string, code: string, tx?: Transaction): Promise<Batch | undefined>
	/**
	 * The batches still `INCOMPLETE` that arrived between `since` and `until` — the follow-up sweep's question
	 * (`FollowUpIncompleteBatches`), oldest first. `since` bounds it: a batch abandoned long ago is not chased forever.
	 */
	abstract findIncomplete(since: Date, until: Date, tx?: Transaction): Promise<Batch[]>
}
