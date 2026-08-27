import { BaseError } from '@codm/core-typescript'
import { describe, expect, it } from 'bun:test'
import { formatBootError } from './bootError'

describe('formatBootError', () => {
	it('collapses an EADDRINUSE error (code) into the one-line, shell-mirrored reason', () => {
		const error = Object.assign(new Error('Failed to start server. Is port 3030 in use?'), { code: 'EADDRINUSE' })
		expect(formatBootError(error, 3030)).toBe(
			'port :3030 is already taken by another process — refusing to boot onto a port this shell does not own',
		)
	})

	it("collapses Bun's own wrapper even without a `code` field, by matching the message", () => {
		const error = new Error('EADDRINUSE: Failed to start server. Is port 47330 in use?')
		expect(formatBootError(error, 47330)).toBe(
			'port :47330 is already taken by another process — refusing to boot onto a port this shell does not own',
		)
	})

	it('names the port the daemon was ACTUALLY asked to boot on, not a literal', () => {
		const error = Object.assign(new Error('boom'), { code: 'EADDRINUSE' })
		expect(formatBootError(error, 47360)).toContain(':47360')
	})

	it('leaves every OTHER error untouched — never invents an address-in-use story', () => {
		const error = new Error('ECONNREFUSED talking to redis')
		expect(formatBootError(error, 3030)).toBe(error.stack ?? error.message)
	})

	// INCIDENTE 27/08/2026 — a linha que o shell lê de volta para oferecer o botão.
	it('prints a named BaseError as `<CODE>: <message>`, code first', () => {
		const error = new BaseError(
			'DATA_DIR_LOCKED',
			'Another daemon is already running on this data dir "C:\\Users\\t\\data" (pid 16580). Stop the other daemon or point this one at a different CODM_DATA_DIR.',
		)
		expect(formatBootError(error, 47330)).toBe(`DATA_DIR_LOCKED: ${error.message}`)
	})

	it('never prints a stack trace for a named BaseError — the code is what the splash acts on', () => {
		const error = new BaseError('DATA_DIR_LOCKED', 'another daemon holds it')
		expect(formatBootError(error, 47330)).not.toContain('bootError.test.ts')
		expect(formatBootError(error, 47330).split('\n')).toHaveLength(1)
	})

	it('never prints a stack trace for the address-in-use case', () => {
		const error = Object.assign(new Error('Failed to start server. Is port 3030 in use?'), { code: 'EADDRINUSE' })
		expect(formatBootError(error, 3030)).not.toContain('bootError.test.ts')
	})
})
