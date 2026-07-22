import { describe, expect, it } from 'bun:test'
import { z } from '@codedm/core-typescript'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { StubAgentRunner } from './StubAgentRunner'
import type { TerminalRuntimeEvent } from '../types'

describe('StubAgentRunner', () => {
	it('generate() returns an empty structured object without spawning anything', async () => {
		const runner = new StubAgentRunner()
		const out = await runner.generate({
			provider: ProviderKind.CLAUDE_CODE,
			prompt: 'hello',
			outputSchema: z.object({ decision: z.string().optional() }),
		})
		expect(out).toEqual({})
	})

	it('stream() yields output lines then a clean exit 0', async () => {
		const runner = new StubAgentRunner()
		const events: TerminalRuntimeEvent[] = []
		for await (const ev of runner.stream({
			provider: ProviderKind.CLAUDE_CODE,
			issueId: 'issue-1',
			cwd: '/tmp/ws',
			prompt: 'fix the coupon bug',
		})) {
			events.push(ev)
		}

		const exit = events.at(-1)
		expect(exit).toEqual({ type: 'exit', code: 0 })

		const outputs = events.filter(e => e.type === 'output')
		expect(outputs.length).toBeGreaterThan(0)
		// The prompt is echoed into the transport stream so a session is observable end-to-end.
		expect(outputs.some(e => e.type === 'output' && e.line.line === 'fix the coupon bug')).toBe(true)
	})
})
