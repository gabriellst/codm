import { describe, expect, it } from 'bun:test'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { TerminalOutputAccumulator } from './TerminalOutputAccumulator'
import type { TerminalRuntimeEvent } from '../TerminalLLMRunner'

const output = (line: string, stream: 'stdout' | 'stderr' = 'stdout'): TerminalRuntimeEvent => ({
	type: 'output',
	line: { at: '2026-07-22T00:00:00.000Z', line, stream },
})

describe('TerminalOutputAccumulator (two-stream split)', () => {
	it('returns a transport frame for every output event, tagged with the issueId', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		const frame = acc.feed(output('compiling…'))
		expect(frame).toEqual({
			name: 'browser.terminal_output_appended',
			issueId: 'issue-1',
			line: 'compiling…',
			at: '2026-07-22T00:00:00.000Z',
			stream: 'stdout',
		})
	})

	it('returns null for the terminal exit event (nothing to transport)', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		expect(acc.feed({ type: 'exit', code: 0 })).toBeNull()
		expect(acc.exited).toBe(true)
	})

	it('folds a clean run into COMPLETED carrying the collected stdout as the reply', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		acc.feed(output('Fixed the coupon focus bug.'))
		acc.feed(output('Opened PR #214.'))
		acc.feed(output('this is only diagnostics', 'stderr'))
		acc.feed({ type: 'exit', code: 0 })

		expect(acc.outcome()).toEqual({ kind: 'COMPLETED', replyText: 'Fixed the coupon focus bug.\nOpened PR #214.' })
	})

	it('folds a non-zero exit into STOPPED(SERVER_ERROR) carrying the stderr detail', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		acc.feed(output('starting…'))
		acc.feed(output('Error: API rate limit exceeded', 'stderr'))
		acc.feed({ type: 'exit', code: 1 })

		expect(acc.outcome()).toEqual({ kind: 'STOPPED', stopKind: StopKind.SERVER_ERROR, detail: 'Error: API rate limit exceeded' })
	})

	it('falls back to an exit-code detail when a failed run wrote nothing to stderr', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		acc.feed({ type: 'exit', code: 137 })
		const outcome = acc.outcome()
		expect(outcome.kind).toBe('STOPPED')
		expect(outcome).toMatchObject({ stopKind: StopKind.SERVER_ERROR, detail: 'terminal session exited with code 137' })
	})
})
