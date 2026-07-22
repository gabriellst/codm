import { injectable } from 'tsyringe-neo'
import type { z, ZodType } from 'zod'
import { AgentRunner } from '../AgentRunner'
import type { AgentGenerateRequest, AgentStreamRequest, TerminalRuntimeEvent } from '../types'

/**
 * Deterministic `AgentRunner` bound ONLY in the `real` DI env under `CODEDM_E2E` (terminal/registry.ts).
 *
 * The Playwright harness boots the REAL daemon (embedded PGlite) but must never spawn a provider CLI
 * (`claude -p` / codex / opencode) — the house rule is "stub runner for agent replies, no real CLI".
 * `CliAgentRunner` (the production `real` binding) shells out to a subprocess; this stub stands in for
 * it during e2e so the whole inbound → classify → session → reply chain runs hermetically and
 * deterministically.
 *
 *   - `generate()` — always returns a `NEW_ISSUE` decision with a fixed title. `IssueClassifier`
 *     delegates its LLM structured-generate here, so an inbound message with no reply-quote is routed
 *     to a fresh issue every time (the classifier's `LlmDecisionSchema` shape: `{ decision, title }`).
 *   - `stream()`   — yields a couple of canned reply lines then a clean `exit 0`, so `RunTerminalSession`
 *     drives the full transport-fan + outcome-mapping path (→ `agent.reply_drafted`, `issue.opened`,
 *     `issue.completed`) without a subprocess. The reply text is stable so a spec can assert on it.
 */
@injectable()
export class E2eStubAgentRunner extends AgentRunner {
	/** Stable reply line the stubbed session "writes" — a spec asserts the transcript renders it. */
	static readonly REPLY_LINE = 'e2e-agent: acknowledged — working on it'
	/** Stable NEW_ISSUE title the classifier stub returns. */
	static readonly ISSUE_TITLE = 'Fix the login bug'

	async generate<OutputSchema extends ZodType>(_request: AgentGenerateRequest<OutputSchema>): Promise<z.output<OutputSchema>> {
		return { decision: 'NEW_ISSUE', title: E2eStubAgentRunner.ISSUE_TITLE } as z.output<OutputSchema>
	}

	async *stream(request: AgentStreamRequest): AsyncIterable<TerminalRuntimeEvent> {
		const at = new Date().toISOString()
		yield { type: 'output', line: { at, line: `$ ${request.provider} (e2e-stub) in ${request.cwd}`, stream: 'stdout' } }
		yield { type: 'output', line: { at, line: E2eStubAgentRunner.REPLY_LINE, stream: 'stdout' } }
		yield { type: 'exit', code: 0 }
	}
}
