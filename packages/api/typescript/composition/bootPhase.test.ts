import { describe, expect, it, spyOn } from 'bun:test'
import { phase } from './bootPhase'

describe('phase', () => {
	it('logs a starting line before running the phase, and a done line with the elapsed time after', async () => {
		const logSpy = spyOn(console, 'log').mockImplementation(() => {})

		const result = await phase('bind-contexts', () => 'ok')

		expect(result).toBe('ok')
		expect(logSpy).toHaveBeenCalledTimes(2)
		expect(logSpy.mock.calls[0]?.[0]).toBe('[boot] bind-contexts — starting')
		expect(logSpy.mock.calls[1]?.[0]).toMatch(/^\[boot\] bind-contexts — done \(\d+ms\)$/)

		logSpy.mockRestore()
	})

	it('awaits an async phase function and only logs "done" after it resolves', async () => {
		const logSpy = spyOn(console, 'log').mockImplementation(() => {})
		let resolved = false

		const result = await phase('migrate', async () => {
			await new Promise(r => setTimeout(r, 5))
			resolved = true
			return 42
		})

		expect(resolved).toBe(true)
		expect(result).toBe(42)
		expect(logSpy.mock.calls[1]?.[0]).toMatch(/^\[boot\] migrate — done \(\d+ms\)$/)

		logSpy.mockRestore()
	})

	it('appends the describeResult detail to the done line when provided', async () => {
		const logSpy = spyOn(console, 'log').mockImplementation(() => {})

		await phase(
			'compose-contexts',
			() => ({ contexts: 3, routers: 5 }),
			result => `${result.contexts} context(s) composed, ${result.routers} router(s)`,
		)

		expect(logSpy.mock.calls[1]?.[0]).toBe('[boot] compose-contexts — done (0ms) — 3 context(s) composed, 5 router(s)')

		logSpy.mockRestore()
	})

	it('logs the failure BEFORE propagating it, so a thrown phase never reads as silently vanished', async () => {
		const logSpy = spyOn(console, 'log').mockImplementation(() => {})
		const errorSpy = spyOn(console, 'error').mockImplementation(() => {})
		const boom = new Error('boom')

		await expect(
			phase('migrate', () => {
				throw boom
			}),
		).rejects.toThrow('boom')

		// The starting line still happened...
		expect(logSpy.mock.calls[0]?.[0]).toBe('[boot] migrate — starting')
		// ...and the failure was logged BEFORE the caller ever sees the rejection.
		expect(errorSpy).toHaveBeenCalledTimes(1)
		expect(errorSpy.mock.calls[0]?.[0]).toMatch(/^\[boot\] migrate — FAILED after \d+ms:$/)
		expect(errorSpy.mock.calls[0]?.[1]).toBe(boom)

		logSpy.mockRestore()
		errorSpy.mockRestore()
	})

	it('logs the failure of a rejected async phase too, not only a synchronous throw', async () => {
		const logSpy = spyOn(console, 'log').mockImplementation(() => {})
		const errorSpy = spyOn(console, 'error').mockImplementation(() => {})

		await expect(
			phase('http-listen', async () => {
				await Promise.resolve()
				throw new Error('EADDRINUSE')
			}),
		).rejects.toThrow('EADDRINUSE')

		expect(errorSpy).toHaveBeenCalledTimes(1)
		expect(errorSpy.mock.calls[0]?.[0]).toMatch(/^\[boot\] http-listen — FAILED after \d+ms:/)

		logSpy.mockRestore()
		errorSpy.mockRestore()
	})
})
