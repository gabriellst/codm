import { describe, it, expect } from 'bun:test'
import type { z, ZodType } from 'zod'
import { TerminalLLMRunner, TerminalLLMRunnerBusyError } from './TerminalLLMRunner'
import type { AgentGenerateRequest } from './types'

describe('TerminalLLMRunner abstract (the WIDE seam, Fork A1)', () => {
	it('is an abstract class — subclassing works and instances are TerminalLLMRunner', () => {
		class Stub extends TerminalLLMRunner {
			async generate<OutputSchema extends ZodType>(_r: AgentGenerateRequest<OutputSchema>): Promise<z.output<OutputSchema>> {
				return {} as z.output<OutputSchema>
			}
			async *stream() {}
			async getSession() {
				return null
			}
			async killSession() {}
			async prewarm() {}
		}
		const s = new Stub()
		expect(s).toBeInstanceOf(TerminalLLMRunner)
	})

	it('TerminalLLMRunnerBusyError is a typed Error subclass carrying the issueId', () => {
		const err = new TerminalLLMRunnerBusyError('issue-42')
		expect(err).toBeInstanceOf(Error)
		expect(err.name).toBe('TerminalLLMRunnerBusyError')
		expect(err.message).toContain('issue-42')
	})
})
