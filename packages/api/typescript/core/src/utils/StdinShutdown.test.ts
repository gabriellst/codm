import { PassThrough } from 'node:stream'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { armStdinShutdown, isShutdownSentinelLine, SHUTDOWN_SENTINEL_LINE } from './StdinShutdown'
import { PARENT_PID_ENV } from './Watchdog'

/**
 * The TS half of the pair `lifecycle.rs`'s `SHUTDOWN_SENTINEL` mirrors — see that file's doc for the
 * Rust side. `PassThrough` stands in for `process.stdin`: same `Readable` interface, none of the
 * risk of a suite fighting over a shared process-global stream. Stream events are not synchronous
 * with `.write()`/`.end()`, so every assertion below waits one short tick first.
 */
describe('isShutdownSentinelLine — the wire value, exact', () => {
	test('matches the frozen sentinel', () => {
		expect(isShutdownSentinelLine(SHUTDOWN_SENTINEL_LINE)).toBe(true)
	})

	test('trims a trailing CR — a CRLF write must not read as "not the sentinel"', () => {
		expect(isShutdownSentinelLine(`${SHUTDOWN_SENTINEL_LINE}\r`)).toBe(true)
	})

	test.each([
		['empty', ''],
		['unrelated text', 'hello world'],
		['a prefix of the sentinel', 'supervisor:shutdow'],
		['the sentinel plus extra text', 'supervisor:shutdown now'],
		['different case', 'SUPERVISOR:SHUTDOWN'],
	])('rejects %s', (_label, line) => {
		expect(isShutdownSentinelLine(line)).toBe(false)
	})
})

describe('armStdinShutdown', () => {
	let stdin: PassThrough

	beforeEach(() => {
		stdin = new PassThrough()
	})

	afterEach(() => {
		stdin.destroy()
	})

	test('disabled by default with no supervisor declared — no listener is even attached', async () => {
		const previous = process.env[PARENT_PID_ENV]
		delete process.env[PARENT_PID_ENV]
		try {
			let shutdowns = 0
			armStdinShutdown({
				stdin,
				onShutdown: () => {
					shutdowns += 1
				},
			})
			expect(stdin.listenerCount('data')).toBe(0)
			expect(stdin.listenerCount('end')).toBe(0)
			stdin.write(`${SHUTDOWN_SENTINEL_LINE}\n`)
			await Bun.sleep(10)
			expect(shutdowns, 'sem CODM_PARENT_PID isto e um terminal de dev, nunca um pedido de shutdown').toBe(0)
		} finally {
			if (previous === undefined) delete process.env[PARENT_PID_ENV]
			else process.env[PARENT_PID_ENV] = previous
		}
	})

	test('a matched line fires the drain exactly once', async () => {
		let shutdowns = 0
		armStdinShutdown({
			stdin,
			enabled: true,
			onShutdown: () => {
				shutdowns += 1
			},
		})
		stdin.write(`${SHUTDOWN_SENTINEL_LINE}\n`)
		await Bun.sleep(10)
		expect(shutdowns).toBe(1)
	})

	test('a line split across two chunks still matches — the buffer survives a partial write', async () => {
		let shutdowns = 0
		armStdinShutdown({
			stdin,
			enabled: true,
			onShutdown: () => {
				shutdowns += 1
			},
		})
		stdin.write(SHUTDOWN_SENTINEL_LINE.slice(0, 4))
		await Bun.sleep(10)
		expect(shutdowns, 'metade da linha ainda nao e a linha').toBe(0)
		stdin.write(`${SHUTDOWN_SENTINEL_LINE.slice(4)}\n`)
		await Bun.sleep(10)
		expect(shutdowns).toBe(1)
	})

	test('EOF with no sentinel does NOT fire — redundant with the parent watchdog + SIGTERM, and a footgun for any supervisor without a live stdin pipe', async () => {
		let shutdowns = 0
		armStdinShutdown({
			stdin,
			enabled: true,
			onShutdown: () => {
				shutdowns += 1
			},
		})
		stdin.write('some unrelated line\n')
		await Bun.sleep(10)
		stdin.end()
		await Bun.sleep(10)
		expect(shutdowns, 'EOF sozinho nunca e um pedido de shutdown — so a linha-sentinela e').toBe(0)
	})

	test('EOF immediately after arming does not fire — the exact smoke-sidecars scenario (no stdin pipe kept open)', async () => {
		let shutdowns = 0
		armStdinShutdown({
			stdin,
			enabled: true,
			onShutdown: () => {
				shutdowns += 1
			},
		})
		stdin.end()
		await Bun.sleep(10)
		expect(shutdowns, 'um supervisor sem pipe de stdin vivo nao pode derrubar o daemon antes dele responder health').toBe(0)
	})

	test('sentinel then EOF fires exactly once — EOF after the drain already ran is a no-op', async () => {
		let shutdowns = 0
		armStdinShutdown({
			stdin,
			enabled: true,
			onShutdown: () => {
				shutdowns += 1
			},
		})
		stdin.write(`${SHUTDOWN_SENTINEL_LINE}\n`)
		await Bun.sleep(10)
		stdin.end()
		await Bun.sleep(10)
		expect(shutdowns, 'a linha-sentinela e o unico gatilho; o EOF que segue nao dispara um segundo drain').toBe(1)
	})

	test('an unrelated line changes nothing — only an exact match fires', async () => {
		let shutdowns = 0
		armStdinShutdown({
			stdin,
			enabled: true,
			onShutdown: () => {
				shutdowns += 1
			},
		})
		stdin.write('some other line\n')
		await Bun.sleep(10)
		expect(shutdowns).toBe(0)
	})
})
