import { z } from '@codm/core-typescript'
import { AgentModelId, IssueLifeState, SupervisorVerdict, SuspicionReason } from '@codm/contracts-typescript/wire/enums'
import { ProviderCapabilitiesSchema } from '../../types/ProviderCapabilities'

/**
 * One moment of the task, already rendered for the model: how long ago, and what happened — a NAME or a text, cut and
 * redacted by the caller (`redactForModel`: long digit runs and addresses never leave the machine). Restated here rather
 * than the timeline item itself, for the reason `TriageAgent/types.ts` gives: an agent input describes what it is
 * HANDED, and the timeline's union would couple the agent runtime to the issue context's read model.
 */
const SupervisorMomentSchema = z.object({
	ago: z.string().min(1),
	what: z.string(),
})

/**
 * What `SupervisorAgent` is asked: ONE suspect task, why it is suspect, the verdicts that suspicion admits, and its last
 * moments. Stateless by construction — no `session` — so every review is fresh and reviews can run side by side.
 */
export const SupervisorInputSchema = z.agentInput({
	issue: z.object({ key: z.string().min(1), title: z.string() }),
	reason: z.enum(SuspicionReason),
	/** How long the suspicion has held, as an age ("45 min") — a model weighs an age, not an instant. */
	suspectFor: z.string().min(1),
	/** Where the task stands now, by the board's rule — absent when the board could not say. */
	lifeState: z.enum(IssueLifeState).optional(),
	/** The ONLY verdicts the answer may take (`VERDICTS_BY_REASON[reason]`); anything else falls back to LEAVE. */
	admitted: z.array(z.enum(SupervisorVerdict)).min(1),
	/** First nudges the task got in the last 24 h — how many times it went quiet and was asked to declare. */
	nudgesLastDay: z.number().int().nonnegative(),
	/** The last moments of the timeline, oldest first, already capped by the caller. */
	recent: z.array(SupervisorMomentSchema),
	/** The provider's SMALL model (`smallModelFor`) — always set by the caller. */
	model: z.enum(AgentModelId),
	/** ABSOLUTE path resolved by `ProviderDetector` (see `AgentRunRequest.binaryPath`). */
	binaryPath: z.string(),
	caps: ProviderCapabilitiesSchema.optional(),
})

/**
 * The verdict and how sure the model is — and NOTHING else. No note, no reason in words: text written by a model must
 * never become part of an automatic turn of another session (spec, item 3), so the answer has no field to carry it.
 * Wrapped in an object for the same reason as the triage's (`TriageOutputSchema`): some providers refuse a bare root.
 */
export const SupervisorOutputSchema = z.object({
	verdict: z.enum(SupervisorVerdict),
	confidence: z.number().min(0).max(1),
})
