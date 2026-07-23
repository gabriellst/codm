import { injectable } from 'tsyringe-neo'
import type { z, ZodType } from 'zod'
import { TerminalLLMRunner, type TerminalLLMRunnerStreamRequest, type TerminalLLMSessionSnapshot } from '../TerminalLLMRunner'
import type { AgentGenerateRequest, TerminalRuntimeEvent } from '../types'

/**
 * Test-only `TerminalLLMRunner` bound in the `mock` and `integration` DI envs so no test ever
 * spawns a provider CLI or calls a real LLM (house rule: no real provider calls in any test).
 *
 * - `generate()` — returns an empty object cast to the typed output. Tests that assert on a
 *   specific structured decision use a purpose-built stub in the test file.
 * - `stream()`   — yields a canned spawn line, one echoed prompt line, and a clean `exit 0`, so
 *   `RunTerminalSession` integration tests exercise the full transport-fan + outcome-mapping path
 *   deterministically (the one-shot half of the wide seam).
 * - session surface (`getSession`/`killSession`/`prewarm`) — inert no-ops.
 */
@injectable()
export class StubTerminalLLMRunner extends TerminalLLMRunner {
	async generate<OutputSchema extends ZodType>(_request: AgentGenerateRequest<OutputSchema>): Promise<z.output<OutputSchema>> {
		return {} as z.output<OutputSchema>
	}

	async *stream(request: TerminalLLMRunnerStreamRequest): AsyncIterable<TerminalRuntimeEvent> {
		const at = new Date().toISOString()
		yield { type: 'output', line: { at, line: `$ ${request.provider} (stub) in ${request.cwd}`, stream: 'stdout' } }
		yield { type: 'output', line: { at, line: request.prompt, stream: 'stdout' } }
		yield { type: 'output', line: { at, line: 'done', stream: 'stdout' } }
		yield { type: 'exit', code: 0 }
	}

	async getSession(_issueId: string): Promise<TerminalLLMSessionSnapshot | null> {
		return null
	}

	async killSession(_issueId: string): Promise<void> {
		// no-op
	}

	async prewarm(_opts: { issueId: string; cwd: string; systemPrompt?: string; binaryPath?: string }): Promise<void> {
		// no-op — tests don't drive real PTYs.
	}
}
