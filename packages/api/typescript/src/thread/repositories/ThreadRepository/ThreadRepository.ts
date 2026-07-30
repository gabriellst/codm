import { Repository } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { Thread, type TranscriptEntry } from '../../entities/Thread'

/**
 * The persistence boundary of the `Thread` AGGREGATE — the thread row plus the transcript entries the
 * aggregate accumulated (B4, decision 1).
 *
 * ### Why the child reads live here and not in a second repository
 * `TranscriptRepository` is gone: it was a child-table repository with no entity behind it, which is
 * the pattern the new template rule forbids. What survives of it are READS, and a read of the
 * aggregate's own rows is this repository's surface — the same way `findByChannelContact` is. Adding a
 * `TranscriptReader` seam instead would recreate the thing being deleted under a new name, and in
 * `mock` mode it would need a store shared with `MockThreadRepository` to be usable at all.
 *
 * ### `findById` does NOT hydrate the transcript
 * Loading a thread stays exactly one row, forever. A conversation has no bound, so an aggregate that
 * loaded its own history would make every pause/resume/steer proportional to how long the thread has
 * been alive. The write side needs no history to be correct: `recordEntry` validates a citation against
 * a reference the caller resolved, not against a loaded collection.
 *
 * ### `save` is atomic only with a transaction
 * The pending entries are written on the SAME `dbc` as the thread row, so passing `tx` is what makes
 * thread+entries atomic — identical to how the entity row and its domain-event row are atomic only
 * because the use case wraps both in `withTransaction`. Every production writer passes it.
 */
export abstract class ThreadRepository extends Repository<Thread> {
	abstract findById(id: string, tx?: Transaction): Promise<Thread | undefined>
	// Attach dedupe + inbound routing: one thread per (channel, contact) per owner.
	abstract findByChannelContact(channelId: string, contactExternalId: string, tx?: Transaction): Promise<Thread | undefined>
	abstract listByOwner(ownerId: string, tx?: Transaction): Promise<Thread[]>

	// ── Child reads: the transcript rows this aggregate owns ──────────────────────────────────────

	/** Rolling context buffer: the most recent N entries of a thread, CHRONOLOGICAL (oldest first). */
	abstract recentEntries(threadId: string, limit: number, tx?: Transaction): Promise<TranscriptEntry[]>
	/** The whole conversation, chronological. Test/flow surface; the UI reads Drizzle directly (BFF). */
	abstract listEntries(threadId: string, tx?: Transaction): Promise<TranscriptEntry[]>
	/**
	 * One entry by id — how a caller RESOLVES a citation before handing it to `recordEntry`. Returns the
	 * record with its `threadId`, which is the proof of membership the aggregate checks.
	 */
	abstract findEntry(entryId: string, tx?: Transaction): Promise<TranscriptEntry | undefined>
}
