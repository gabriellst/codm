import { describe, it, expect } from 'bun:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { InMemoryRateLimitStore } from './InMemoryRateLimitStore'

describe('InMemoryRateLimitStore (RateLimitStore contract)', () => {
	it('allows hits up to max and reports remaining', async () => {
		const store = new InMemoryRateLimitStore()
		const first = await store.hit('k', 1000, 3)
		expect(first).toEqual({ allowed: true, remaining: 2 })
		const second = await store.hit('k', 1000, 3)
		expect(second).toEqual({ allowed: true, remaining: 1 })
		const third = await store.hit('k', 1000, 3)
		expect(third).toEqual({ allowed: true, remaining: 0 })
	})

	it('denies the N+1th hit within the window', async () => {
		const store = new InMemoryRateLimitStore()
		await store.hit('k', 1000, 2)
		await store.hit('k', 1000, 2)
		const overflow = await store.hit('k', 1000, 2)
		expect(overflow.allowed).toBe(false)
		expect(overflow.remaining).toBe(0)
	})

	it('resets the counter after the window elapses', async () => {
		const store = new InMemoryRateLimitStore()
		await store.hit('k', 20, 1)
		expect((await store.hit('k', 20, 1)).allowed).toBe(false)
		await sleep(30)
		expect((await store.hit('k', 20, 1)).allowed).toBe(true)
	})

	it('keeps distinct keys independent', async () => {
		const store = new InMemoryRateLimitStore()
		await store.hit('a', 1000, 1)
		expect((await store.hit('a', 1000, 1)).allowed).toBe(false)
		expect((await store.hit('b', 1000, 1)).allowed).toBe(true)
	})
})
