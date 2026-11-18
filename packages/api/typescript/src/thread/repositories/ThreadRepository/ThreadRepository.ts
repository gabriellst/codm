import { Repository } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { Thread, type Stop, type TranscriptEntry } from '../../entities/Thread'

/**
 * The persistence boundary of the `Thread` AGGREGATE — the thread row plus the transcript entries and
 * the stops the aggregate accumulated (B4, decisions 1 and 4).
 *
 * ### Why the child reads live here and not in a second repository
 * `TranscriptRepository` is gone: it was a child-table repository with no entity behind it, which is
 * the pattern the new template rule forbids. What survives of it are READS, and a read of the
 * aggregate's own rows is this repository's surface — the same way `findByChannelContact` is. Adding a
 * `TranscriptReader` seam instead would recreate the thing being deleted under a new name, and in
 * `mock` mode it would need a store shared with `MockThreadRepository` to be usable at all.
 *
 * ### `findById` does NOT hydrate the transcript or the stops
 * Loading a thread stays exactly one row, forever. A conversation has no bound, so an aggregate that
 * loaded its own history would make every pause/resume/steer proportional to how long the thread has
 * been alive. The write side needs no history to be correct: `recordEntry` validates a citation against
 * a reference the caller resolved, and `resolveStop` against a stop the caller loaded — never against a
 * loaded collection.
 *
 * ### These reads SEE SOFT-DELETED THREADS, deliberately (thread-deletion spec, AC-3 whitelist)
 * `deleted_at IS NULL` belongs to the console's reads, not to this repository — and the difference is
 * not stylistic. This is the WRITE side, and both directions of the soft delete need the row: without
 * it `Thread.delete()` cannot refuse a second call (it would degrade to THREAD_NOT_FOUND, which says
 * the wrong thing), and `AttachThread` cannot find the row to `revive()` — it would try to insert and
 * hit `threads_owner_channel_contact_unq` instead, which is the failure decision 4 exists to avoid.
 *
 * The consequence is that every CALLER of `findById` / `findByChannelContact` owns the question "may a
 * deleted thread do this?" explicitly. Today that is: `DeleteThread` (must see it — refuses),
 * `AttachThread` (must see it — revives), `ConsumeInboundMessage` and `IngestChannelMessage` (must see
 * it — drop the message, decision 3), and the control-plane use cases, which are unreachable for an
 * apagada thread because the console cannot route to a chat that answers THREAD_NOT_FOUND.
 *
 * ### `save` is atomic only with a transaction
 * The pending entries and stops are written on the SAME `dbc` as the thread row, so passing `tx` is what
 * makes thread+children atomic — identical to how the entity row and its domain-event row are atomic
 * only because the use case wraps both in `withTransaction`. Every production writer passes it.
 *
 * ### A resolution is conditional — the FIRST one wins (fase 3)
 * `save` stamps a resolution only on a stop still open (`resolved_at IS NULL`) and raises
 * `STOP_ALREADY_RESOLVED` when the stop had already moved on, which rolls back the caller's whole
 * transaction — so the loser's entry, echo and steer never land. Every resolver (a rule, the panel, the
 * console, the orchestrator, the deadline job) goes through it.
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

	// ── Child reads: the stops this aggregate owns ─────────────────────────────────────────────────

	/** One stop by id — how a caller loads what it will hand to `Thread.resolveStop`. */
	abstract findStop(stopId: string, tx?: Transaction): Promise<Stop | undefined>
	/** Unresolved stops on a thread — WITH and WITHOUT an issue (that is the point of decision 4). */
	abstract openStops(threadId: string, tx?: Transaction): Promise<Stop[]>
	/** Unresolved stops of one issue. Survives for the issue-detail read and the lifecycle tests. */
	abstract openStopsByIssue(issueId: string, tx?: Transaction): Promise<Stop[]>

	// ── The asks (fase 3) ──────────────────────────────────────────────────────────────────────────

	/**
	 * The number the NEXT ask of this issue takes (`max(seq) + 1`, starting at 1) — the `D1` of `APP-12 · D1`.
	 * Read inside the raising transaction; the unique `(issue_id, seq)` index refuses the race.
	 */
	abstract nextAskSeq(issueId: string, tx?: Transaction): Promise<number>
	/**
	 * Start the clock of every open QUESTION the entry `entryId` carried to the group — its own ask, or the
	 * asks folded into it when it is a digest — at `deliveredAt` + `QUESTION_DEFAULT_MS`. Conditional on
	 * `due_at IS NULL`: a re-delivery after a failed commit never pushes a deadline. Returns the stop ids
	 * whose deadline this call set.
	 */
	abstract markAskDelivered(entryId: string, deliveredAt: Date, tx?: Transaction): Promise<string[]>
	/** Open QUESTIONS whose deadline has passed at `now` — what the deadline sweep applies the default to. */
	abstract findDueAsks(now: Date, tx?: Transaction): Promise<Stop[]>
	/**
	 * The ask an issue numbered `seq` (the `D1` of `APP-12 · D1`) — open or already resolved, so a reply naming
	 * it by code can tell "answer it" from "it was answered: a late reply" (slice S3).
	 */
	abstract findAsk(issueId: string, seq: number, tx?: Transaction): Promise<Stop | undefined>
	/**
	 * The stops the message `entryId` put to the group — the one whose id the entry carries, plus the asks a
	 * DIGEST entry folded in (their own entries point at it by `digest_entry_id`). Open or resolved: a quoted
	 * reply to an answered ask is a late reply, not nothing.
	 */
	abstract stopsCarriedBy(entryId: string, tx?: Transaction): Promise<Stop[]>
	/**
	 * The signals of a conversation still WAITING for the per-person digest (fase 3, item 2) — `routing =
	 * DIGEST`, not yet folded into a digest — for one person (`addresseeId`; `undefined` = the signals with no
	 * person, which digest together), oldest first.
	 */
	abstract pendingDigest(threadId: string, addresseeId: string | undefined, tx?: Transaction): Promise<TranscriptEntry[]>
}
