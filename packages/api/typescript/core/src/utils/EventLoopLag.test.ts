import { describe, expect, it } from 'bun:test'
import { startEventLoopLagMonitor } from './EventLoopLag'

/**
 * A synchronous block — the shape of a native SQLite busy-wait — must surface as a reported lag, and a
 * loop that keeps up must report nothing. FALSIFIER: compare against the scheduling instant instead of
 * the expected fire time and the blocked case reports a lag of ~0.
 */
describe('startEventLoopLagMonitor', () => {
	const blockFor = (ms: number) => {
		const until = Date.now() + ms
		while (Date.now() < until) {
			// busy — this is the point: nothing else on the loop may run
		}
	}

	it('reports a tick that fired late because the loop was blocked', async () => {
		const lags: number[] = []
		const stop = startEventLoopLagMonitor({ intervalMs: 20, thresholdMs: 150, onLag: lag => lags.push(lag) })
		try {
			await new Promise(resolve => setTimeout(resolve, 30))
			blockFor(300)
			await new Promise(resolve => setTimeout(resolve, 60))
		} finally {
			stop()
		}
		expect(lags.length).toBeGreaterThanOrEqual(1)
		expect(Math.max(...lags)).toBeGreaterThanOrEqual(150)
	})

	it('reports nothing while the loop keeps up', async () => {
		const lags: number[] = []
		const stop = startEventLoopLagMonitor({ intervalMs: 20, thresholdMs: 150, onLag: lag => lags.push(lag) })
		try {
			await new Promise(resolve => setTimeout(resolve, 200))
		} finally {
			stop()
		}
		expect(lags).toEqual([])
	})
})
