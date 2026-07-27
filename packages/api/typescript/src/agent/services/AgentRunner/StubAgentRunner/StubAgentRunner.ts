import { injectable } from 'tsyringe-neo'
import type { ZodType } from 'zod'
import { AgentRunOutcome } from '../../../enums'
import type { AgentFrame, AgentRunRequest, AgentRuntimeEvent } from '../../../types'
import { AgentRunner } from '../AgentRunner'

/**
 * The `AgentRunner` bound in the `mock` and `integration` DI envs — canned frames, never a process.
 *
 * §8 rule 8 makes "no test spawns a provider CLI" a property of the DI ENV rather than of test
 * discipline, and this class is that property's other half: `StreamJsonAgentRunner` is the only
 * implementation that can start a child, and it is bound in `real` only.
 *
 * It answers BOTH shapes of the one seam, because after this phase there is only one:
 *   - `outputSchema` present ⇒ a CLASSIFICATION run. The terminal event carries `output` — the inert
 *     empty object, which `IssueClassifier` degrades to CLARIFY. A suite that needs a specific
 *     decision overrides the binding with its own fake rather than teaching this one a vocabulary.
 *   - `outputSchema` absent ⇒ a WORK run. A spawn line, the prompt echoed back and a `done` line
 *     arrive as `assistant_text` frames so `RunIssueTurn` drives the whole transport-fan +
 *     outcome-mapping path deterministically.
 *
 * `output` is set WITHOUT running `safeParse`, and that is deliberate rather than sloppy: the seam's
 * contract is "present iff an `outputSchema` validated", and a stub is the one place allowed to
 * assert that postcondition directly instead of deriving it — exactly as the deleted stub of the old
 * wide seam returned its canned object.
 */
@injectable()
export class StubAgentRunner extends AgentRunner {
	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		if (request.outputSchema) {
			yield {
				type: 'finished',
				result: { outcome: AgentRunOutcome.COMPLETED, replyText: '{}', sessionId: null, output: {}, failed: false },
			}
			return
		}

		// `agentName`, not a provider: since Fase 4.5 the request carries no provider identity — WHICH
		// CLI a run belongs to is settled by the DI binding that produced this very object.
		const lines = [`$ ${request.agentName} (stub) in ${request.cwd}`, ...request.messages.map(message => message.content), 'done']
		for (const [index, text] of lines.entries()) {
			const frame: AgentFrame = { kind: 'assistant_text', messageId: `stub-${index}`, text, parentToolUseId: null }
			yield { type: 'frame', frame }
		}
		yield {
			type: 'finished',
			result: { outcome: AgentRunOutcome.COMPLETED, replyText: lines.join('\n'), sessionId: 'stub-session', failed: false },
		}
	}

	async shutdown(): Promise<void> {
		// Nothing to release — this runner never owns a process.
	}
}
