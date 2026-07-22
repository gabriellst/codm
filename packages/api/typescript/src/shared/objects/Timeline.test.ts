import { describe, it, expect } from 'bun:test'
import { Timeline } from './Timeline'

interface Fee {
	rate: number
	startDate: Date
	endDate: Date | null
}
const d = (n: number) => new Date(2026, 0, 1 + n) // day-n anchor
const fee = (rate: number, s: number, e: number | null): Fee => ({ rate, startDate: d(s), endDate: e === null ? null : d(e) })
const spans = (t: Timeline<Fee>) =>
	t.entries.map(en => [en.startDate.getDate() - 1, en.endDate === null ? null : en.endDate.getDate() - 1, en.rate])

describe('Timeline.place (interval paint)', () => {
	it('(a) paints over the front of an entry → trims to the right remainder', () => {
		const t = Timeline.empty<Fee>()
			.place(fee(1, 0, 10))
			.place(fee(2, 0, 5))
		expect(spans(t)).toEqual([
			[0, 5, 2],
			[5, 10, 1],
		])
	})

	it('(b) paint covering all entries removes them', () => {
		const t = Timeline.empty<Fee>()
			.place(fee(2, 0, 5))
			.place(fee(1, 5, 10))
			.place(fee(3, 0, 11))
		expect(spans(t)).toEqual([[0, 11, 3]])
	})

	it('(c) paint strictly inside an entry splits it 3 ways', () => {
		const t = Timeline.empty<Fee>()
			.place(fee(1, 0, 11))
			.place(fee(2, 4, 8))
		expect(spans(t)).toEqual([
			[0, 4, 1],
			[4, 8, 2],
			[8, 11, 1],
		])
	})

	it('(d) open-ended paint trims the prior open entry', () => {
		const t = Timeline.empty<Fee>()
			.place(fee(1, 0, null))
			.place(fee(2, 5, null))
		expect(spans(t)).toEqual([
			[0, 5, 1],
			[5, null, 2],
		])
	})

	it('(e) non-overlapping paint leaves a gap (no entry at uncovered instants)', () => {
		const t = Timeline.empty<Fee>()
			.place(fee(1, 0, 3))
			.place(fee(2, 6, 9))
		expect(t.activeAt(d(4))).toBeUndefined()
		expect(t.activeAt(d(7))?.rate).toBe(2)
	})

	it('(f) exact-boundary adjacency produces no zero-length entries', () => {
		const t = Timeline.empty<Fee>()
			.place(fee(1, 0, 10))
			.place(fee(2, 0, 10))
		expect(spans(t)).toEqual([[0, 10, 2]])
	})

	it('(g) place is immutable — the source timeline is unchanged', () => {
		const base = Timeline.empty<Fee>().place(fee(1, 0, 10))
		const next = base.place(fee(2, 4, 8))
		expect(spans(base)).toEqual([[0, 10, 1]])
		expect(next.entries.length).toBe(3)
	})

	it('current() returns the unique open-ended entry; activeAt finds by half-open window', () => {
		const t = Timeline.empty<Fee>().place(fee(1, 0, null))
		expect(t.current()?.rate).toBe(1)
		expect(t.activeAt(d(0))?.rate).toBe(1)
	})
})
