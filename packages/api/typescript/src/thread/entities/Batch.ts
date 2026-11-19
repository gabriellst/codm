import { AggregateRoot, BaseError, z } from '@codm/core-typescript'
import { BatchItemDestinationKind, BatchStatus } from '@codm/contracts-typescript/wire/enums'
import type Z from 'zod'
import { BATCH_EXCERPT_MAX, BATCH_ITEMS_MAX, BatchItemDestinationSchema, type BatchItemDestination } from '@shared/objects'
import type { DomainErrors } from '../errors'

/** What people quote: `L-` and the batch's per-conversation number. */
export const BATCH_CODE_PREFIX = 'L-'

/** The code of the batch numbered `seq` in its conversation (`L-31`). */
export function batchCodeOf(seq: number): string {
	return `${BATCH_CODE_PREFIX}${seq}`
}

/**
 * Which destinations name an issue the batch links to — total over `BatchItemDestinationKind`, so a kind added to
 * the contract decides here whether it carries one. The link is what the issue's timeline shows (`BATCH_LINKED`).
 */
export const LINKED_ISSUE_OF: Readonly<Record<BatchItemDestinationKind, (destination: BatchItemDestination) => string | undefined>> = {
	[BatchItemDestinationKind.NEW_ISSUE]: destination => ('issueId' in destination ? destination.issueId : undefined),
	[BatchItemDestinationKind.ATTACHED]: destination => ('issueId' in destination ? destination.issueId : undefined),
	[BatchItemDestinationKind.ALREADY_LIVE]: destination => ('issueId' in destination ? destination.issueId : undefined),
	[BatchItemDestinationKind.NEEDS_DECISION]: destination => ('issueId' in destination ? destination.issueId : undefined),
	[BatchItemDestinationKind.DECLINED]: () => undefined,
	[BatchItemDestinationKind.DEFERRED]: () => undefined,
}

/** The issue a destination names, if any. */
export function linkedIssueOf(destination: BatchItemDestination): string | undefined {
	return LINKED_ISSUE_OF[destination.kind](destination)
}

export const BatchEntitySchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	/** The per-conversation number (`BatchSequence`) — the code is derived from it. */
	seq: z.number().int().min(1),
	/** The transcript entry whose message listed the items. */
	sourceEntryId: z.uuid(),
	/** The listed items, 1..N — child rows of the batch (no identity of their own), not value objects. */
	items: z
		.array(
			z.object({
				n: z.number().int().min(1).max(BATCH_ITEMS_MAX),
				excerpt: z.string().max(BATCH_EXCERPT_MAX),
				/** Absent until the orchestrator records where this item went. */
				destination: BatchItemDestinationSchema.optional(),
				/** When the destination was recorded — the instant of the linked issue's `BATCH_LINKED` timeline item. */
				recordedAt: z.date().optional(),
			}),
		)
		.min(1)
		.max(BATCH_ITEMS_MAX),
	status: z.enum(BatchStatus),
	/** The receipt the group was told — present exactly when `RECORDED`. */
	receiptEntryId: z.uuid().optional(),
})
export type BatchProps = Z.infer<typeof BatchEntitySchema>
export type BatchEntryItem = BatchProps['items'][number]

/**
 * A BATCH (fase 4, item 5) — one message that listed several requests, and where each of them went.
 *
 * Its own aggregate, not a child of the `Thread`: it has its own lifecycle and its own question ("which batches of
 * this conversation are still incomplete?"), and the thread is large already.
 *
 * THE INVARIANT: every item 1..N has exactly one destination, all recorded at once. A record with an item missing,
 * repeated or out of range is refused (`BATCH_ITEMS_MISMATCH`) and nothing is written — no item is "half recorded",
 * and no receipt goes out over a batch with a hole in it. `INCOMPLETE → RECORDED` happens together with the receipt
 * (`recordReceipt`); a recorded batch never takes a second record, so the receipt is said once.
 */
export class Batch extends AggregateRoot<typeof BatchEntitySchema> {
	static override schema = BatchEntitySchema

	/** A batch is born with its items and no destination. */
	static open(data: {
		ownerId: string
		threadId: string
		seq: number
		sourceEntryId: string
		items: readonly { n: number; excerpt: string }[]
	}): Batch {
		return new Batch({
			ownerId: data.ownerId,
			threadId: data.threadId,
			seq: data.seq,
			sourceEntryId: data.sourceEntryId,
			items: data.items.map(item => ({ n: item.n, excerpt: item.excerpt })),
			status: BatchStatus.INCOMPLETE,
		})
	}

	/** `L-<seq>`. */
	get code(): string {
		return batchCodeOf(this.seq)
	}

	get recorded(): boolean {
		return this.status === BatchStatus.RECORDED
	}

	/** The items that still have no destination. */
	pending(): BatchEntryItem[] {
		return this.items.filter(item => item.destination === undefined)
	}

	/**
	 * Record where EVERY item went — the whole set at once, each item exactly once. Refuses (`BATCH_ITEMS_MISMATCH`,
	 * naming the missing, repeated and unknown numbers) without touching a single item.
	 */
	recordDestinations(destinations: readonly { n: number; destination: BatchItemDestination }[], at: Date): void {
		const numbers = destinations.map(entry => entry.n)
		const known = new Set(this.items.map(item => item.n))
		const missing = [...known].filter(n => !numbers.includes(n))
		const repeated = [...new Set(numbers.filter((n, index) => numbers.indexOf(n) !== index))]
		const unknown = [...new Set(numbers.filter(n => !known.has(n)))]
		if (missing.length > 0 || repeated.length > 0 || unknown.length > 0) {
			const parts = [
				missing.length > 0 && `missing ${missing.join(', ')}`,
				repeated.length > 0 && `repeated ${repeated.join(', ')}`,
				unknown.length > 0 && `not in the batch ${unknown.join(', ')}`,
			].filter(Boolean)
			throw new BaseError<DomainErrors>('BATCH_ITEMS_MISMATCH', `${this.code} has items 1..${this.items.length}: ${parts.join('; ')}`)
		}
		const byNumber = new Map(destinations.map(entry => [entry.n, entry.destination]))
		this.items = this.items.map(item => ({ ...item, destination: byNumber.get(item.n), recordedAt: at }))
		this.validate()
	}

	/** Every item has its destination and the group was told — the batch is `RECORDED`, with the receipt's entry. */
	recordReceipt(receiptEntryId: string): void {
		if (this.pending().length > 0) {
			throw new BaseError<DomainErrors>('BATCH_ITEMS_MISMATCH', `${this.code} still has items without a destination`)
		}
		this.receiptEntryId = receiptEntryId
		this.status = BatchStatus.RECORDED
		this.validate()
	}
}

export interface Batch extends BatchProps {}
