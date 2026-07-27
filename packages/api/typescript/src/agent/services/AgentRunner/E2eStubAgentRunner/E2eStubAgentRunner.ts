import { injectable } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { ClassificationVerdict, AgentRunOutcome } from '../../../enums'
import type { AgentFrame, AgentRunRequest, AgentRuntimeEvent } from '../../../types'
import { AgentRunner } from '../AgentRunner'

/**
 * The `AgentRunner` bound in the `real` DI env under `CODEDM_E2E` (agent/registry.ts).
 *
 * The Playwright harness boots the REAL daemon over the real SQLite, but must never spawn a provider
 * CLI. This stand-in keeps the whole inbound → classify → session → reply chain hermetic AND
 * deterministic, which is what lets a spec poll for a settled issue status instead of guessing.
 *
 *   - CLASSIFICATION (`outputSchema` present) — always a `NEW_ISSUE` decision, so the saga closer
 *     mints a fresh issue and a slug key derived from the inbound message.
 *   - WORK (no `outputSchema`) — a couple of canned `assistant_text` frames and a COMPLETED terminal
 *     event, so the issue settles at COMPLETED rather than STOPPED.
 */
@injectable()
export class E2eStubAgentRunner extends AgentRunner {
	/** Stable reply line the stubbed session "writes" — a spec asserts the transcript renders it. */
	static readonly REPLY_LINE = 'e2e-agent: acknowledged — working on it'
	/** Stable NEW_ISSUE title the classification run returns. */
	static readonly ISSUE_TITLE = 'Fix the login bug'

	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		if (request.outputSchema) {
			const output = { decision: ClassificationVerdict.NEW_ISSUE, title: E2eStubAgentRunner.ISSUE_TITLE }
			yield {
				type: 'finished',
				result: { outcome: AgentRunOutcome.COMPLETED, replyText: JSON.stringify(output), sessionId: null, output, failed: false },
			}
			return
		}

		// `agentName`, not a provider: since Fase 4.5 the request carries no provider identity — WHICH
		// CLI a run belongs to is settled by the DI binding that produced this very object.
		const lines = [`$ ${request.agentName} (e2e-stub) in ${request.cwd}`, E2eStubAgentRunner.REPLY_LINE]
		for (const [index, text] of lines.entries()) {
			const frame: AgentFrame = { kind: 'assistant_text', messageId: `e2e-stub-${index}`, text, parentToolUseId: null }
			yield { type: 'frame', frame }
		}
		yield {
			type: 'finished',
			result: { outcome: AgentRunOutcome.COMPLETED, replyText: lines.join('\n'), sessionId: 'e2e-stub-session', failed: false },
		}
	}

	async shutdown(): Promise<void> {
		// Nothing to release — this runner never owns a process.
	}
}
