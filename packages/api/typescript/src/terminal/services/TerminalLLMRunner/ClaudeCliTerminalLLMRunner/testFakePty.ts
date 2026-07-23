/**
 * Shared fake-PTY helpers for the ClaudeCliTerminalLLMRunner suites (whatscode port). The engine
 * is driven through the `PtyHandle` adapter (spawner.ts), so tests fake THAT surface — no real
 * Bun.Terminal is ever created (`mock.module('./spawner')` replaces the whole module, including
 * `spawnPty`, which BinaryProbe would otherwise use to spawn a real probe shell).
 */
import { EventEmitter } from 'node:events'
import { appendFileSync } from 'node:fs'
import type { PtyHandle } from './spawner'

export interface FakePty extends PtyHandle {
	emitData(data: string): void
	triggerExit(exitCode: number): void
	writes: string[]
}

export function makeFakePty(onWrite?: (text: string) => void): FakePty {
	const em = new EventEmitter()
	em.setMaxListeners(50)
	const writes: string[] = []
	return {
		writes,
		write(text: string) {
			writes.push(text)
			onWrite?.(text)
		},
		kill() {
			em.emit('exit', { exitCode: 0, signal: 0 })
		},
		resize() {},
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
		emitData(data: string) {
			em.emit('data', data)
		},
		triggerExit(exitCode: number) {
			em.emit('exit', { exitCode, signal: 0 })
		},
	}
}

/** Inert probe PTY for the mocked `spawnPty` (BinaryProbe path): no data, immediate clean exit. */
export function makeInertProbePty(): PtyHandle {
	const pty = makeFakePty()
	queueMicrotask(() => pty.triggerExit(0))
	return pty
}

export function appendJsonl(path: string, record: Record<string, unknown>): void {
	appendFileSync(path, `${JSON.stringify(record)}\n`)
}
