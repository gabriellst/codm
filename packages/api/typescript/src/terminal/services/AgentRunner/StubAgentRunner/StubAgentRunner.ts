import { injectable } from 'tsyringe-neo'
import type { z, ZodType } from 'zod'
import { AgentRunner } from '../AgentRunner'
import type { AgentGenerateRequest, AgentStreamRequest, TerminalRuntimeEvent } from '../types'

/**
 * Test-only `AgentRunner` bound in the `mock` and `integration` DI envs so no test ever spawns a
 * provider CLI or calls a real LLM (house rule: no real provider calls in any test).
 *
 * - `generate()` — returns an empty object cast to the typed output. Tests that assert on a specific
 *   structured decision use a purpose-built stub in the test file (see `IssueClassifier.test.ts`)
 *   rather than this default; this binding only needs to be inert.
 * - `stream()`   — yields a canned spawn line, one echoed prompt line, and a clean `exit 0`, so
 *   `RunTerminalSession` integration tests exercise the full transport-fan + outcome-mapping path
 *   deterministically.
 */
@injectable()
export class StubAgentRunner extends AgentRunner {
	async generate<OutputSchema extends ZodType>(_request: AgentGenerateRequest<OutputSchema>): Promise<z.output<OutputSchema>> {
		return {} as z.output<OutputSchema>
	}

	async *stream(request: AgentStreamRequest): AsyncIterable<TerminalRuntimeEvent> {
		const at = new Date().toISOString()
		yield { type: 'output', line: { at, line: `$ ${request.provider} (stub) in ${request.cwd}`, stream: 'stdout' } }
		yield { type: 'output', line: { at, line: request.prompt, stream: 'stdout' } }
		yield { type: 'output', line: { at, line: 'done', stream: 'stdout' } }
		yield { type: 'exit', code: 0 }
	}
}
