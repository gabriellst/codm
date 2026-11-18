import { z } from '@codm/core-typescript'
import { AgentModelId, IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { TriageDecision } from '../../enums'
import { ProviderCapabilitiesSchema } from '../../types/ProviderCapabilities'

/**
 * One line of context, flat — the shape the prompt renders. Restated here rather than imported from the
 * thread context, for the reason `OrchestratorAgent/types.ts` gives: an agent input describes what it is
 * HANDED, and a transcript row type would couple the agent runtime to `thread`'s persistence.
 *
 * `speaker` is a roster NAME (or `you` for the agent), never a JID: the model echoes what it sees.
 */
const TriageLineSchema = z.object({
	speaker: z.string().min(1),
	text: z.string(),
	at: z.date(),
})

/** An open issue of the conversation — the candidates a message may be a steer of. */
const TriageIssueSchema = z.object({
	key: z.string().min(1),
	title: z.string(),
	status: z.enum(IssueStatus),
	/** When the issue last changed — "the one they were talking about a minute ago" is usually the target. */
	lastActivityAt: z.date(),
})

/**
 * What `TriageAgent` is asked: ONE message, the conversation's open issues and a short tail of what was
 * said before it. Stateless by construction — no `session`, so every run is fresh and runs can go in
 * parallel (one per message).
 */
export const TriageInputSchema = z.agentInput({
	message: z.object({
		speaker: z.string().min(1),
		text: z.string().min(1),
		/** The line this message replies to, when it quotes one that is not linked to an issue. */
		quoted: z.object({ speaker: z.string().min(1), text: z.string() }).optional(),
	}),
	openIssues: z.array(TriageIssueSchema),
	/** The last few lines BEFORE the message, chronological, already capped by the caller. */
	recent: z.array(TriageLineSchema),
	/** The run's instant, so "last activity" renders as an age a model can weigh. Never read inside the builder. */
	now: z.date(),
	/** The provider's SMALL model (`smallModelFor`) — always set by the caller. */
	model: z.enum(AgentModelId),
	/** ABSOLUTE path resolved by `ProviderDetector` (see `AgentRunRequest.binaryPath`). */
	binaryPath: z.string(),
	caps: ProviderCapabilitiesSchema.optional(),
})

const confidence = z.number().min(0).max(1)

/**
 * The verdict, as a DISCRIMINATED UNION on `decision` — each case carries only what it needs:
 * `STEER` names the issue by key, `NEW_TASK` a title, the other two nothing.
 *
 * `STEER` carries no rewritten text on purpose: the issue's session receives the PERSON's own words,
 * signed by them — a small model's paraphrase of a correction is exactly where a correction gets lost.
 *
 * Wrapped in an object (`{ confidence, verdict }`) rather than a bare union at the root: a provider's
 * structured-output mode may refuse a root `anyOf` (OpenAI's strict schemas do), and the root object
 * costs nothing on the providers that accept either.
 */
export const TriageOutputSchema = z.object({
	confidence,
	verdict: z.discriminatedUnion('decision', [
		z.object({ decision: z.literal(TriageDecision.STEER), issueKey: z.string().min(1) }),
		z.object({ decision: z.literal(TriageDecision.NEW_TASK), title: z.string().min(1) }),
		z.object({ decision: z.literal(TriageDecision.ORCHESTRATOR) }),
		z.object({ decision: z.literal(TriageDecision.NO_ACTION) }),
	]),
})
