import { injectable } from 'tsyringe-neo'
import { BaseError, AgentIdentityService } from '@codm/core-typescript'
import { AgentMessageRole, AgentName } from '../../enums'
import type { AgentRunner } from '../../services/AgentRunner'
import { Agent } from '../../types/Agent'
import type { AgentRunIdentity } from '../../types/AgentRunIdentity'
import type { AgentRunRequest } from '../../types/AgentRunRequest'
import type { AgentApplicationErrors } from '../../errors'
import { TriagePromptBuilder } from './prompt'
import { TriageInputSchema, TriageOutputSchema } from './types'

/**
 * The parallel triage (fase 2, `.specs/2026-11-16-falar-e-parar-na-hora-design.md`): ONE stateless run per
 * inbound message the rule layer could not route, on the provider's small model, answering "where does
 * this message go?" with a structured verdict.
 *
 * Stateless on purpose — no `session`, no resume — so runs for different messages go in parallel instead
 * of queueing behind the conversation's single orchestrator session (measured: median 24 s, p90 110 s).
 *
 * NO tool scope: it reads what it is handed and answers; it never acts. What it does NOT decide is the
 * policy — the confidence floor, the timeout, the fallback to the orchestrator, whether the key names a
 * steerable issue. That lives next door in `InboundTriage`, which injects this agent.
 */
@injectable()
export class TriageAgent extends Agent<typeof TriageInputSchema, typeof TriageOutputSchema> {
	static override readonly NAME = AgentName.TRIAGE

	override readonly inputSchema = TriageInputSchema
	override readonly outputSchema = TriageOutputSchema

	constructor(
		identities: AgentIdentityService<AgentRunIdentity>,
		private readonly prompt: TriagePromptBuilder,
	) {
		super(identities)
	}

	/** The verdict for one message. The ONE public method of an agent with an `outputSchema`. */
	async triage(runner: AgentRunner, input: this['input'], transport: { signal?: AbortSignal } = {}): Promise<this['output']> {
		return this.collect(runner, input, transport)
	}

	/** The ONE point of variation. No `mcp`, no `agentName`, no `posture` — the base stamps all three. */
	protected buildRequest(input: this['input']): Omit<AgentRunRequest<typeof TriageOutputSchema>, 'mcp' | 'agentName' | 'posture'> {
		return {
			cwd: input.cwd,
			systemPrompt: this.prompt.system(input),
			messages: [{ role: AgentMessageRole.USER, content: this.prompt.user(input) }],
			outputSchema: this.outputSchema,
			model: input.model,
			binaryPath: input.binaryPath,
			caps: input.caps,
		}
	}

	protected override collectFailure(message: string): Error {
		return new BaseError<AgentApplicationErrors>('CLASSIFICATION_FAILED', message)
	}
}
