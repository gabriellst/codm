import { describe, it, expect } from 'bun:test'
import { SessionMap, type LiveSession } from './SessionMap'

function fakeSession(key: string): LiveSession {
	return {
		key,
		issueId: key,
		terminalSessionId: 'tid',
		cwd: '/tmp',
		pty: {} as LiveSession['pty'],
		tail: { sessionId: 'tid', transcriptPath: '/tmp/x.jsonl', stop: async () => {} },
		queue: {} as LiveSession['queue'],
		lastActivityAt: Date.now(),
		logger: {} as LiveSession['logger'],
		traceSubs: [],
		primed: false,
		emitter: { current: () => {} },
	}
}

describe('SessionMap', () => {
	describe('getOrCreate', () => {
		it('returns the same session for concurrent calls (in-flight dedup)', async () => {
			const map = new SessionMap()
			let factoryCalls = 0
			const factory = async () => {
				factoryCalls++
				await new Promise(r => setTimeout(r, 10))
				return fakeSession('k')
			}
			const [a, b] = await Promise.all([
				map.getOrCreate('k', factory),
				map.getOrCreate('k', factory),
			])
			expect(a).toBe(b)
			expect(factoryCalls).toBe(1)
		})

		it('clears in-flight entry on factory rejection so the next call can retry', async () => {
			const map = new SessionMap()
			let attempts = 0
			const factory = async () => {
				attempts++
				if (attempts === 1) throw new Error('boom — priming turn timed out')
				return fakeSession('k')
			}
			await expect(map.getOrCreate('k', factory)).rejects.toThrow('boom')
			// Without the fix this would re-throw the cached rejection rather
			// than calling the factory a second time.
			const session = await map.getOrCreate('k', factory)
			expect(session.key).toBe('k')
			expect(attempts).toBe(2)
		})

		it('does not retain a rejected promise across multiple subsequent calls', async () => {
			const map = new SessionMap()
			const factory = async () => { throw new Error('persistent failure') }
			await expect(map.getOrCreate('k', factory)).rejects.toThrow('persistent failure')
			await expect(map.getOrCreate('k', factory)).rejects.toThrow('persistent failure')
			await expect(map.getOrCreate('k', factory)).rejects.toThrow('persistent failure')
			// Verify each call ran a NEW factory invocation by checking the
			// 'persistent failure' isn't actually the SAME rejected promise
			// being returned — using a counter would be cleaner:
		})

		it('runs factory fresh on each call after a rejection (counter)', async () => {
			const map = new SessionMap()
			let calls = 0
			const factory = async () => { calls++; throw new Error('fail') }
			await expect(map.getOrCreate('k', factory)).rejects.toThrow('fail')
			await expect(map.getOrCreate('k', factory)).rejects.toThrow('fail')
			expect(calls).toBe(2)
		})
	})
})
