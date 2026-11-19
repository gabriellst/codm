// A BATCH (fase 4, item 5): one message listing several requests, and where each of its items went. Wire
// shapes the orchestrator's tool (`RecordBatch`), the console's batch screen and the cloud panel speak — so
// they live in `shared/objects` and are published as named components.
//
// No `.refine()` (Non-Negotiable 4): "every item 1..N has exactly one destination" and "a referenced issue
// belongs to this conversation" are the `Batch` aggregate's and the use case's invariants, never the wire's.
import { z } from '@codm/core-typescript'
import { BatchItemDestinationKind, BatchStatus } from '@codm/contracts-typescript/wire/enums'
import type Z from 'zod'

/** The most items a batch may carry. */
export const BATCH_ITEMS_MAX = 50
/** The longest excerpt kept for one item. */
export const BATCH_EXCERPT_MAX = 500
/** The longest reason / note on a destination. */
export const BATCH_REASON_MAX = 500

const reason = z.string().trim().min(1).max(BATCH_REASON_MAX)

/**
 * Where ONE item went — a discriminated union on `BatchItemDestinationKind` (Non-Negotiable 3): each kind
 * carries only its own fields. The issue-bearing kinds name an issue of the SAME conversation.
 */
export const BatchItemDestinationSchema = z.discriminatedUnion('kind', [
	z.object({ kind: z.literal(BatchItemDestinationKind.NEW_ISSUE), issueId: z.uuid() }),
	z.object({ kind: z.literal(BatchItemDestinationKind.ATTACHED), issueId: z.uuid() }),
	z.object({ kind: z.literal(BatchItemDestinationKind.ALREADY_LIVE), issueId: z.uuid().optional(), note: reason }),
	z.object({ kind: z.literal(BatchItemDestinationKind.DECLINED), reason }),
	z.object({ kind: z.literal(BatchItemDestinationKind.DEFERRED), reason, until: z.iso.datetime().optional() }),
	z.object({ kind: z.literal(BatchItemDestinationKind.NEEDS_DECISION), issueId: z.uuid(), stopId: z.uuid() }),
])
export type BatchItemDestination = Z.output<typeof BatchItemDestinationSchema>

/** One numbered item of the batch: its number (1-based), what it said, and where it went. */
export const BatchItemSchema = z.object({
	n: z.number().int().min(1).max(BATCH_ITEMS_MAX),
	excerpt: z.string().max(BATCH_EXCERPT_MAX),
	destination: BatchItemDestinationSchema,
})
export type BatchItem = Z.output<typeof BatchItemSchema>

/** A batch as people see it: its per-conversation code (`L-31`), where it stands, the message it came from, its items. */
export const BatchSchema = z.object({
	code: z.string().min(1).max(20),
	status: z.enum(BatchStatus),
	sourceEntryId: z.uuid(),
	items: z.array(BatchItemSchema).max(BATCH_ITEMS_MAX),
})
export type Batch = Z.output<typeof BatchSchema>
