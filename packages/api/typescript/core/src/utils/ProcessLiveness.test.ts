import { describe, expect, test } from 'bun:test'

import { isProcessAlive } from './ProcessLiveness'

/**
 * `kill(pid, 0)` — a sonda que `DataDirLock` sempre usou para "o dono do lock ainda existe?" e que o
 * parent watchdog passa a usar para "o shell ainda existe?". No Windows é a ÚNICA pergunta que
 * responde, porque o ppid registrado de um processo congela no spawn.
 */
describe('isProcessAlive', () => {
	test('este processo está vivo', () => {
		expect(isProcessAlive(process.pid)).toBe(true)
	})

	test.each([[0], [-1], [1.5], [Number.NaN]])('um pid inválido (%s) nunca está vivo', pid => {
		expect(isProcessAlive(pid)).toBe(false)
	})

	test('um filho que já saiu está morto', async () => {
		const child = Bun.spawn([process.execPath, '-e', 'process.exit(0)'])
		await child.exited
		expect(isProcessAlive(child.pid)).toBe(false)
	})
})
