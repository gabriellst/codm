import { injectable } from 'tsyringe-neo'
import type { z, ZodType } from 'zod'
import { TerminalLLMRunner, type TerminalLLMRunnerStreamRequest, type TerminalLLMSessionSnapshot } from '../TerminalLLMRunner'
import type { AgentGenerateRequest, TerminalRuntimeEvent } from '../types'

/**
 * Deterministic `TerminalLLMRunner` bound ONLY in the `real` DI env under `CODEDM_E2E`
 * (terminal/registry.ts).
 *
 * The Playwright harness boots the REAL daemon (embedded SQLite) but must never spawn a provider
 * CLI — the house rule is "stub runner for agent replies, no real CLI". This stub stands in for
 * `ClaudeCliTerminalLLMRunner` during e2e so the whole inbound → classify → session → reply chain
 * runs hermetically and deterministically.
 *
 *   - `generate()` — always returns a `NEW_ISSUE` decision with a fixed title (the classifier's
 *     `LlmDecisionSchema` shape).
 *   - `stream()`   — yields a couple of canned reply lines then a clean `exit 0`, so
 *     `RunTerminalSession` drives the full transport-fan + outcome-mapping path without a
 *     subprocess. The reply text is stable so a spec can assert on it.
 */
@injectable()
export class E2eStubTerminalLLMRunner extends TerminalLLMRunner {
	/** Stable reply line the stubbed session "writes" — a spec asserts the transcript renders it. */
	static readonly REPLY_LINE = 'e2e-agent: acknowledged — working on it'
	/** Stable NEW_ISSUE title the classifier stub returns. */
	static readonly ISSUE_TITLE = 'Fix the login bug'

	async generate<OutputSchema extends ZodType>(_request: AgentGenerateRequest<OutputSchema>): Promise<z.output<OutputSchema>> {
		return { decision: 'NEW_ISSUE', title: E2eStubTerminalLLMRunner.ISSUE_TITLE } as z.output<OutputSchema>
	}

	async *stream(request: TerminalLLMRunnerStreamRequest): AsyncIterable<TerminalRuntimeEvent> {
		const at = new Date().toISOString()
		yield { type: 'output', line: { at, line: `$ ${request.provider} (e2e-stub) in ${request.cwd}`, stream: 'stdout' } }
		yield { type: 'output', line: { at, line: E2eStubTerminalLLMRunner.REPLY_LINE, stream: 'stdout' } }
		yield { type: 'exit', code: 0 }
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
