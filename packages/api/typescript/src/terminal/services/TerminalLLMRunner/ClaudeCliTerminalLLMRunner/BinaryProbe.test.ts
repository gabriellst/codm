import { describe, it, expect, beforeEach } from 'bun:test'
import { EventEmitter } from 'node:events'
import { BinaryProbe, type ProbePty } from './BinaryProbe'
import { RunnerLogger } from './logger/RunnerLogger'

function captureLogger() {
	const lines: string[] = []
	const logger = new RunnerLogger({
		tier: 'info',
		sink: line => { lines.push(line) },
		colorEnv: { isTTY: false, noColor: false },
		clock: () => new Date('2026-05-20T16:32:10Z'),
	})
	return { logger, lines }
}

/**
 * Fake PTY that emits data and exit via microtasks — BinaryProbe.runOnce accepts an optional
 * spawner so tests never touch a real Bun.Terminal.
 */
function makeFakeSpawner(output: string, exitCode = 0) {
	return (): ProbePty => {
		const em = new EventEmitter()
		queueMicrotask(() => {
			em.emit('data', output)
			em.emit('exit', { exitCode, signal: 0 })
		})
		return {
			onData(cb: (data: string) => void) {
				em.on('data', cb)
				return {
					dispose() {
						em.off('data', cb)
					},
				}
			},
			onExit(cb: (ev: { exitCode: number; signal?: number }) => void) {
				em.on('exit', cb)
				return {
					dispose() {
						em.off('exit', cb)
					},
				}
			},
		}
	}
}

describe('BinaryProbe', () => {
	beforeEach(() => {
		BinaryProbe.resetForTests()
	})

	it('runs at most once per process', () => {
		const { logger, lines } = captureLogger()
		const spawner = makeFakeSpawner('no tty\n/repo\ngabriel\n/usr/bin/claude\n2.1.0\n')
		BinaryProbe.runOnce(logger, spawner)
		const firstRunSize = lines.length
		BinaryProbe.runOnce(logger, spawner)
		expect(lines.length).toBe(firstRunSize)
	})

	it('emits a boxed binary-probe section', async () => {
		const { logger, lines } = captureLogger()
		BinaryProbe.runOnce(logger, makeFakeSpawner('no tty\n/repo\ngabriel\n/usr/bin/claude\n2.1.0\n'))
		await new Promise(r => setTimeout(r, 50))
		const all = lines.join('\n')
		expect(all).toContain('binary-probe')
		expect(all.split('\n').some(l => l.startsWith('└'))).toBe(true)
	})
})
