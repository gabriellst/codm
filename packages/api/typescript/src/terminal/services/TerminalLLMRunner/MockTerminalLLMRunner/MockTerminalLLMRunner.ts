import { injectable } from 'tsyringe-neo'
import type { z, ZodType } from 'zod'
import { TerminalLLMRunner, type TerminalLLMRunnerStreamRequest, type TerminalLLMSessionSnapshot } from '../TerminalLLMRunner'
import type { AgentGenerateRequest, TerminalRuntimeEvent } from '../types'

/**
 * Scripted `TerminalLLMRunner` for engine-focused suites (whatscode port). Tests stage one or
 * more event sequences via `pushScript(events)`; each subsequent `stream(...)` call consumes the
 * next queued script and yields its events in order. With nothing queued, `stream()` yields
 * nothing. `getSession`/`killSession`/`prewarm` are no-ops.
 */
@injectable()
export class MockTerminalLLMRunner extends TerminalLLMRunner {
	private scripts: TerminalRuntimeEvent[][] = []

	pushScript(events: TerminalRuntimeEvent[]): void {
		this.scripts.push(events)
	}

	/**
	 * Drains pending scripts and removes any instance-property override of `stream` so a test
	 * that did `runner.stream = () => { throw }` doesn't leak its behaviour into the next test.
	 */
	clear(): void {
		this.scripts = []
		delete (this as { stream?: unknown }).stream
	}

	async generate<OutputSchema extends ZodType>(_request: AgentGenerateRequest<OutputSchema>): Promise<z.output<OutputSchema>> {
		return {} as z.output<OutputSchema>
	}

	async *stream(_request: TerminalLLMRunnerStreamRequest): AsyncIterable<TerminalRuntimeEvent> {
		const next = this.scripts.shift() ?? []
		for (const ev of next) yield ev
	}

	async getSession(_issueId: string): Promise<TerminalLLMSessionSnapshot | null> {
		return null
	}

	async killSession(_issueId: string): Promise<void> {
		// no-op
	}

	async prewarm(_opts: { issueId: string; cwd: string; systemPrompt?: string; binaryPath?: string }): Promise<void> {
		// no-op
	}
}
