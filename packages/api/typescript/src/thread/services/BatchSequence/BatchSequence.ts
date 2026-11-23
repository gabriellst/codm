import type { Transaction } from '@codm/core-typescript'

/**
 * Hands out the number behind a batch's code (`L-<n>`), per conversation — the twin of the agent's `IssueSequence`
 * (fase 4, item 5). Called inside the ingest transaction that opens the batch, so the number and the batch commit
 * together: SQLite serializes writers, and `thread_batches_thread_seq_unq` refuses a second batch with the same
 * number should two writers ever race.
 */
export abstract class BatchSequence {
	/** The next number for `threadId` — 1 for a conversation's first batch. */
	abstract next(threadId: string, tx?: Transaction): Promise<number>
}
