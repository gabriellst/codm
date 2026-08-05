import { z } from '@codm/core-typescript'
import { AgentModelId } from '@codm/contracts-typescript/wire/enums'
import { ProviderCapabilitiesSchema } from '../../types/ProviderCapabilities'

/**
 * What the working agent is HANDED for one turn (GOAL-agent-abstraction §4.8).
 *
 * Declared with `z.agentInput()`, so the envelope — `ownerId`, `issueId`, `threadId`, `cwd` — is the
 * schema's spine rather than five fields repeated per agent. Unlike the classifier, THIS agent always
 * has an `issueId`: `RunIssueTurn` only reaches it after the routing decision resolved one.
 *
 * ### Why the INVOCATION facts travel here and not on the agent
 * `binaryPath`, `caps` and `session` are resolved by `RunIssueTurn` — provider detection plus the
 * resume decision — and both of those are use-case concerns by contract: §4.7 keeps `caps` a
 * PARAMETER so argv construction stays a pure function of its arguments (never a module-level map
 * detection mutates), and §4.10 puts the four resume guards on the `AgentSession` entity the use case
 * loads. `buildRequest` is the only place allowed to assemble an `AgentRunRequest`, so what the use
 * case resolved has to REACH it, and the input is the one channel that exists. Moving detection into
 * the agent instead would invert the dependency and take the Fase-4.5 misrouting guard
 * (`RUNNER_SUPPORTED_PROVIDERS`) with it.
 *
 * `caps` reuses `ProviderCapabilitiesSchema` rather than restating the flags: the probe's shape is
 * owned by `types/ProviderCapabilities.ts` (which Fase 5 turned into a schema with the type derived
 * from it, precisely so it could be reused here). A hand-copied mirror would be a second declaration
 * of the same value-set — the thing §8 rule 4 forbids — and would silently drop a newly-probed flag
 * on its way to argv.
 */
export const IssueWorkInputSchema = z.agentInput({
	/** The classified inbound message — the turn's single user message. */
	prompt: z.string().min(1),
	/** The issue's thread-unique slug key and title, for the standing prompt. */
	key: z.string().min(1),
	title: z.string().min(1),
	/** Which model to ask the CLI for. Omitted ⇒ `DEFAULT` ⇒ the CLI's own choice. */
	model: z.enum(AgentModelId).optional(),
	/**
	 * EXACTLY ONE of the two is set by `RunIssueTurn.resolveSession` — continue the persisted CLI
	 * session (`--resume`) or open a new one under an id we minted (`--session-id`). Never neither: a
	 * turn with no session identity is a turn whose successor cannot resume it.
	 */
	session: z.object({ resumeId: z.string().optional(), newId: z.string().optional() }).optional(),
	/** Resolved by `ProviderDetector`; absent lets the runner fall back to its own CLI's bare binary name. */
	binaryPath: z.string().optional(),
	/** What the probe found THIS install supports. Absent = the conservative set (no optional flag passed). */
	caps: ProviderCapabilitiesSchema.optional(),
	/**
	 * A instrução permanente que o operador escreveu para ESTA conversa (`Thread.customPrompt`).
	 *
	 * Ausente, nunca `''` — `Thread.configurePrompt` colapsa branco em ausência no write, e o prompt
	 * builder conta com isso para não renderizar um cabeçalho vazio.
	 */
	customPrompt: z.string().min(1).optional(),
})
