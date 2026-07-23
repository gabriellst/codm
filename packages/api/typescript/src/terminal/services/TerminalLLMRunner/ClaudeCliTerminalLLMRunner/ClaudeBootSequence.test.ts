import { describe, it, expect } from 'bun:test'
import { EventEmitter } from 'node:events'
import { ClaudeBootSequence, BootExitError, BootSilentError } from './ClaudeBootSequence'
import { RunnerLogger } from './logger/RunnerLogger'

interface FakePty {
	write(text: string): void
	kill(signal?: string): void
	onData(cb: (data: string) => void): { dispose(): void }
	onExit(cb: (ev: { exitCode: number; signal?: number }) => void): { dispose(): void }
	emitData(data: string): void
	emitExit(exitCode: number): void
	writes: string[]
	dataListeners: number
	exitListeners: number
}

function makeFakePty(): FakePty {
	const em = new EventEmitter()
	const writes: string[] = []
	const pty: FakePty = {
		write(text) { writes.push(text) },
		kill() {},
		onData(cb) {
			em.on('data', cb)
			return { dispose() { em.off('data', cb) } }
		},
		onExit(cb) {
			em.on('exit', cb)
			return { dispose() { em.off('exit', cb) } }
		},
		emitData(d) { em.emit('data', d) },
		emitExit(code) { em.emit('exit', { exitCode: code }) },
		writes,
		get dataListeners() { return em.listenerCount('data') },
		get exitListeners() { return em.listenerCount('exit') },
	}
	return pty
}

function silentLogger() {
	return new RunnerLogger({
		tier: 'info',
		sink: () => {},
		colorEnv: { isTTY: false, noColor: false },
		clock: () => new Date('2026-05-20T16:32:10Z'),
	})
}

describe('ClaudeBootSequence', () => {
	it('resolves after the settle window elapses with no early exit', async () => {
		const pty = makeFakePty()
		const boot = new ClaudeBootSequence({ pty, logger: silentLogger(), settleMs: 20 })
		const run = boot.run()
		queueMicrotask(() => pty.emitData('Welcome to Claude\n'))
		const result = await run
		expect(result.bootBytes).toBeGreaterThan(0)
		expect(result.trustHandled).toBe(false)
	})

	it('auto-accepts the trust prompt with `\\r` before resolving', async () => {
		const pty = makeFakePty()
		const boot = new ClaudeBootSequence({ pty, logger: silentLogger(), settleMs: 30 })
		const run = boot.run()
		queueMicrotask(() => pty.emitData(
			'Quick safety check: Is this a project you created or one you trust?\r\n' +
			' ❯ 1. Yes, I trust this folder\r\n',
		))
		const result = await run
		expect(result.trustHandled).toBe(true)
		expect(pty.writes[0]).toBe('\r')
	})

	it('rejects with BootExitError when pty exits during settle', async () => {
		const pty = makeFakePty()
		const boot = new ClaudeBootSequence({ pty, logger: silentLogger(), settleMs: 200 })
		const run = boot.run()
		queueMicrotask(() => {
			pty.emitData('auth failed: invalid token\n')
			pty.emitExit(1)
		})
		await expect(run).rejects.toBeInstanceOf(BootExitError)
		try { await run } catch (e) {
			if (e instanceof BootExitError) {
				expect(e.exitCode).toBe(1)
				expect(e.lastOutput).toContain('auth failed')
			}
		}
	})

	it('disposes all pty listeners after resolve', async () => {
		const pty = makeFakePty()
		const beforeData = pty.dataListeners
		const beforeExit = pty.exitListeners
		const boot = new ClaudeBootSequence({ pty, logger: silentLogger(), settleMs: 20 })
		const run = boot.run()
		queueMicrotask(() => pty.emitData('Welcome\n'))
		await run
		expect(pty.dataListeners).toBe(beforeData)
		expect(pty.exitListeners).toBe(beforeExit)
	})

	it('rejects with BootSilentError when no bytes arrive within maxSettleMs', async () => {
		const pty = makeFakePty()
		const boot = new ClaudeBootSequence({ pty, logger: silentLogger(), settleMs: 20, maxSettleMs: 60 })
		await expect(boot.run()).rejects.toBeInstanceOf(BootSilentError)
	})

	it('extends boot wait past settleMs and resolves once first byte arrives mid-grace', async () => {
		const pty = makeFakePty()
		const boot = new ClaudeBootSequence({ pty, logger: silentLogger(), settleMs: 30, maxSettleMs: 500 })
		const run = boot.run()
		// Don't emit until well past settleMs but before maxSettleMs.
		setTimeout(() => pty.emitData('late banner\n'), 100)
		const result = await run
		expect(result.bootBytes).toBeGreaterThan(0)
	})

	it('disposes all pty listeners after reject', async () => {
		const pty = makeFakePty()
		const beforeData = pty.dataListeners
		const beforeExit = pty.exitListeners
		const boot = new ClaudeBootSequence({ pty, logger: silentLogger(), settleMs: 200 })
		const run = boot.run()
		queueMicrotask(() => pty.emitExit(1))
		await run.catch(() => {})
		expect(pty.dataListeners).toBe(beforeData)
		expect(pty.exitListeners).toBe(beforeExit)
	})
})
