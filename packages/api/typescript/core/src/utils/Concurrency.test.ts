import { describe, it, expect } from 'bun:test'
import { forEachWithConcurrency } from './Concurrency'

describe('forEachWithConcurrency', () => {
	it('processes every item without ever exceeding the in-flight limit', async () => {
		const items = Array.from({ length: 23 }, (_, i) => i)
		const seen: number[] = []
		let inFlight = 0
		let maxInFlight = 0

		await forEachWithConcurrency(items, 5, async item => {
			inFlight++
			maxInFlight = Math.max(maxInFlight, inFlight)
			// Yield so multiple items genuinely overlap.
			await new Promise(resolve => setTimeout(resolve, 1))
			seen.push(item)
			inFlight--
		})

		expect(seen.sort((a, b) => a - b)).toEqual(items)
		expect(maxInFlight).toBeLessThanOrEqual(5)
		expect(maxInFlight).toBeGreaterThan(1) // genuinely concurrent, not sequential
	})

	it('empty list is a no-op', async () => {
		let calls = 0
		await forEachWithConcurrency([], 5, async () => {
			calls++
		})
		expect(calls).toBe(0)
	})

	it('limit 1 degrades to sequential processing', async () => {
		let inFlight = 0
		let maxInFlight = 0
		await forEachWithConcurrency([1, 2, 3], 1, async () => {
			inFlight++
			maxInFlight = Math.max(maxInFlight, inFlight)
			await new Promise(resolve => setTimeout(resolve, 1))
			inFlight--
		})
		expect(maxInFlight).toBe(1)
	})
})
