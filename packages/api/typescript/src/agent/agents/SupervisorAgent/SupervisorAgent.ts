import { injectable } from 'tsyringe-neo'
import { BaseError, AgentIdentityService } from '@codm/core-typescript'
import { AgentMessageRole, AgentName } from '../../enums'
import type { AgentRunner } from '../../services/AgentRunner'
import { Agent } from '../../types/Agent'
import type { AgentRunIdentity } from '../../types/AgentRunIdentity'
import type { AgentRunRequest } from '../../types/AgentRunRequest'
import type { AgentRunResult } from '../../types/AgentRuntimeEvent'
import type { AgentApplicationErrors } from '../../errors'
import { SupervisorPromptBuilder } from './prompt'
import { SupervisorInputSchema, SupervisorOutputSchema } from './types'

/**
 * The supervisor (fase 5, item 3): ONE stateless run per suspect task, on the provider's small model, answering
 * "what should happen to this task now?" with a structured verdict — the molde of `TriageAgent`.
 *
 * NO tool scope and NO built-in tools: it reads what it is handed and answers; it never acts. Everything around the
 * verdict — which verdicts a suspicion admits, the confidence floors, the timeout, the fallback to `LEAVE`, the spend —
 * is policy, and lives next door in `ModelIssueSupervisor`, which injects this agent.
 */
@injectable()
export class SupervisorAgent extends Agent<typeof SupervisorInputSchema, typeof SupervisorOutputSchema> {
	static override readonly NAME = AgentName.SUPERVISOR

	override readonly inputSchema = SupervisorInputSchema
	override readonly outputSchema = SupervisorOutputSchema

	constructor(
		identities: AgentIdentityService<AgentRunIdentity>,
		private readonly prompt: SupervisorPromptBuilder,
	) {
		super(identities)
	}

	/** The verdict on one suspect task. The ONE public method of an agent with an `outputSchema`. */
	async review(
		runner: AgentRunner,
		input: this['input'],
		transport: { signal?: AbortSignal; onFinished?: (result: AgentRunResult) => void } = {},
	): Promise<this['output']> {
		return this.collect(runner, input, transport)
	}

	/** The ONE point of variation. No `mcp`, no `agentName`, no `posture` — the base stamps all three. */
	protected buildRequest(input: this['input']): Omit<AgentRunRequest<typeof SupervisorOutputSchema>, 'mcp' | 'agentName' | 'posture'> {
		return {
			cwd: input.cwd,
			// NO built-in tools: the supervisor reads a task's recent texts — people's messages among them — and a text
			// written as an instruction must have nothing in reach to act with.
			builtinTools: [],
			systemPrompt: this.prompt.system(input),
			messages: [{ role: AgentMessageRole.USER, content: this.prompt.user(input) }],
			outputSchema: this.outputSchema,
			model: input.model,
			binaryPath: input.binaryPath,
			caps: input.caps,
		}
	}

	/**
	 * The triage's code, on purpose: "a small-model call produced no usable decision" is the one failure both have, and
	 * it never reaches anyone — `ModelIssueSupervisor` catches it and records the fallback (`FAILED`).
	 */
	protected override collectFailure(message: string): Error {
		return new BaseError<AgentApplicationErrors>('CLASSIFICATION_FAILED', message)
	}
}
