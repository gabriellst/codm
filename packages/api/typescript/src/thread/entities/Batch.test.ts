import { describe, expect, it } from 'bun:test'
import { BatchItemDestinationKind, BatchStatus } from '@codm/contracts-typescript/wire/enums'
import { BATCH_RECEIPT_REASON_MAX, BATCH_RECEIPT_REASONS_PER_KIND, Batch } from './Batch'

const OWNER = '00000000-0000-4000-8000-000000000001'
const THREAD = '019e4d24-6524-7041-9e1c-8108180cddae'
const ENTRY = '019e4d24-6524-7041-9e1c-8108180cddb0'
const ISSUE = '019e4d24-6524-7041-9e1c-8108180cddaf'
const AT = new Date('2026-11-19T12:00:00.000Z')

const opened = (count: number) =>
	Batch.open({
		ownerId: OWNER,
		threadId: THREAD,
		seq: 31,
		sourceEntryId: ENTRY,
		items: Array.from({ length: count }, (_, index) => ({ n: index + 1, excerpt: `pedido ${index + 1}` })),
	})

const declined = (n: number) => ({ n, destination: { kind: BatchItemDestinationKind.DECLINED, reason: 'fora do escopo' } as const })

/**
 * THE BATCH'S INVARIANT (fase 4, item 5): every item 1..N has exactly one destination, recorded all at once.
 *
 * Falsifier: drop the "missing" check and the nine-of-ten case records a batch with a hole.
 */
describe('Batch — every item 1..N, exactly once', () => {
	it('is born INCOMPLETE, with its code from the conversation number', () => {
		const batch = opened(3)
		expect(batch.code).toBe('L-31')
		expect(batch.status).toBe(BatchStatus.INCOMPLETE)
		expect(batch.pending()).toHaveLength(3)
	})

	it('records ten destinations for ten items, each with the instant', () => {
		const batch = opened(10)
		batch.recordDestinations(
			Array.from({ length: 10 }, (_, index) =>
				index === 0 ? { n: 1, destination: { kind: BatchItemDestinationKind.NEW_ISSUE, issueId: ISSUE } as const } : declined(index + 1),
			),
			AT,
		)
		expect(batch.pending()).toHaveLength(0)
		expect(batch.items.every(item => item.recordedAt?.getTime() === AT.getTime())).toBe(true)
		expect(batch.items[0]?.destination).toEqual({ kind: BatchItemDestinationKind.NEW_ISSUE, issueId: ISSUE })
	})

	it('refuses nine of ten, naming the missing one, and writes nothing', () => {
		const batch = opened(10)
		expect(() =>
			batch.recordDestinations(
				Array.from({ length: 9 }, (_, index) => declined(index + 1)),
				AT,
			),
		).toThrow(expect.objectContaining({ name: 'BATCH_ITEMS_MISMATCH', message: expect.stringContaining('missing 10') }))
		expect(batch.pending()).toHaveLength(10)
	})

	it('refuses an item twice or an item the batch does not have', () => {
		const batch = opened(3)
		expect(() => batch.recordDestinations([declined(1), declined(1), declined(2), declined(3)], AT)).toThrow(
			expect.objectContaining({ name: 'BATCH_ITEMS_MISMATCH' }),
		)
		expect(() => batch.recordDestinations([declined(1), declined(2), declined(3), declined(4)], AT)).toThrow(
			expect.objectContaining({ name: 'BATCH_ITEMS_MISMATCH' }),
		)
	})

	it('turns RECORDED only with every destination and the receipt', () => {
		const batch = opened(3)
		expect(() => batch.recordReceipt(ENTRY)).toThrow(expect.objectContaining({ name: 'BATCH_ITEMS_MISMATCH' }))
		batch.recordDestinations([declined(1), declined(2), declined(3)], AT)
		batch.recordReceipt(ENTRY)
		expect(batch.status).toBe(BatchStatus.RECORDED)
		expect(batch.receiptEntryId).toBe(ENTRY)
	})

	it('the receipt says a bounded part of the reasons — each clipped, at most a few per destination, the rest counted', () => {
		const batch = opened(10)
		const long = (n: number) => `${n} ${'x'.repeat(490)}`
		batch.recordDestinations(
			Array.from({ length: 10 }, (_, index) => ({
				n: index + 1,
				destination: { kind: BatchItemDestinationKind.DECLINED, reason: long(index + 1) } as const,
			})),
			AT,
		)
		const { shown, more } = batch.receiptReasons()[BatchItemDestinationKind.DECLINED]
		expect(shown).toHaveLength(BATCH_RECEIPT_REASONS_PER_KIND)
		expect(more).toBe(10 - BATCH_RECEIPT_REASONS_PER_KIND)
		for (const reason of shown) expect(reason.length).toBeLessThanOrEqual(BATCH_RECEIPT_REASON_MAX)
		expect(shown[0]?.endsWith('…')).toBe(true)
		expect(batch.receiptReasons()[BatchItemDestinationKind.NEW_ISSUE]).toEqual({ shown: [], more: 0 })
	})

	it('a short reason goes into the receipt whole', () => {
		const batch = opened(3)
		batch.recordDestinations([1, 2, 3].map(declined), AT)
		expect(batch.receiptReasons()[BatchItemDestinationKind.DECLINED]).toEqual({
			shown: ['fora do escopo', 'fora do escopo', 'fora do escopo'],
			more: 0,
		})
	})
})
