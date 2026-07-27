import { injectable } from 'tsyringe-neo'
import { BaseError } from '@codedm/core-typescript'
import { AgentMessageRole, AgentName } from '../../enums'
import type { ApplicationErrors } from '../../errors'
import { AgentRunner } from '../../services/AgentRunner'
import { Agent } from '../../types/Agent'
import type { AgentRunRequest } from '../../types'
import { ClassifyIssuePromptBuilder } from './prompt'
import { ClassifyIssueInputSchema, LlmDecisionSchema } from './types'

/**
 * Turns one inbound message + the thread's open issues into a RAW model verdict
 * (`{decision, issueId?, confidence?, title?, question?}`) — GOAL-agent-abstraction §4.8.
 *
 * ### What is IN, and what deliberately is not
 * IN: the prompt, the `outputSchema`, and the single structured call. OUT, because it is routing
 * POLICY rather than agent runtime: the deterministic reply-quote shortcut, the confidence floor, the
 * slug minting and the clarify fallback — all four live in `services/IssueRouter`, which is what
 * `thread/usecases/ClassifyMessage` injects. An agent that also decided would be two things at once,
 * and the split is exactly what the founder critique that produced Fase 4.5 asked for: the classifier
 * is an AGENT, not a service.
 *
 * ### Why this is not a second runtime
 * Classification is `run()` with an `outputSchema` and no `mcp` — the same spawn, the same stdin
 * format, the same parser, the same end-of-turn signal as `IssueWorkAgent`. §4.1 is explicit that a
 * second seam method would encode ZERO domain information. `tools = []` (inherited): classifying is
 * deciding, not acting, so this run declares nothing and carries no run token.
 *
 * ### The one public method
 * `classify()` is the whole public surface, named for the business purpose (§4.5), and its body is
 * `return this.collect(input)` and nothing else. That rule is not stylistic: a body with more in it
 * is where policy leaks back in. `collect()` stays `protected` on the base.
 *
 * Tested against a stubbed runner — never a real CLI (§8 rule 8, enforced by the DI env seam).
 */
@injectable()
export class ClassifyIssueAgent extends Agent<typeof ClassifyIssueInputSchema, typeof LlmDecisionSchema> {
	static override readonly NAME = AgentName.CLASSIFY_ISSUE

	override readonly inputSchema = ClassifyIssueInputSchema
	override readonly outputSchema = LlmDecisionSchema

	constructor(
		runner: AgentRunner,
		private readonly prompt: ClassifyIssuePromptBuilder,
	) {
		super(runner)
	}

	/** Entry point, public and typed. Delegates to `collect()`, which delegates to `run()`. Zero new transport. */
	async classify(input: this['input']): Promise<this['output']> {
		return this.collect(input)
	}

	protected buildRequest(input: this['input']): Omit<AgentRunRequest<typeof LlmDecisionSchema>, 'mcp' | 'agentName'> {
		return {
			cwd: input.cwd,
			systemPrompt: this.prompt.system(),
			messages: [{ role: AgentMessageRole.USER, content: this.prompt.user(input) }],
			outputSchema: this.outputSchema,
		}
	}

	/**
	 * `CLASSIFICATION_FAILED` is where BOTH failure modes of a classification run land: a transport
	 * stop and a structural-validation failure. The seam's contract is never to throw mid-drain (§4.3
	 * rule 4); THIS layer's contract is the opposite — a caller gets a decision or a NAMED error — and
	 * translating one into the other is precisely what this hook is for.
	 */
	protected override collectFailure(message: string): Error {
		return new BaseError<ApplicationErrors>('CLASSIFICATION_FAILED', message)
	}
}
