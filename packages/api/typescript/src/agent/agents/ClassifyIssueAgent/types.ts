import { z } from '@codedm/core-typescript'
import { ClassificationVerdict } from '../../enums'

/**
 * What the classification agent is ASKED (GOAL-agent-abstraction §4.8).
 *
 * Declared with `z.agentInput()` so the run envelope (`ownerId` / `threadId` / `cwd`, and the
 * optional `issueId`) comes for free and the constraint holds BY CONSTRUCTION rather than by
 * discipline — see `types/AgentInput.ts` for what that constraint buys.
 *
 * `issueId` is absent on every call this agent will ever receive, and that is WHY the envelope
 * declares it optional (see `BaseAgentInputSchema`): classification runs before an issue exists — the
 * id is the DECISION's output, not its input.
 *
 * `openIssues` carries the candidate set as `{issueId, key, title}` triples rather than the
 * `OpenIssueRef` type itself: the ref is a THREAD concept and lives in
 * `@thread/services/OpenIssuesReader` (§5.3 moved it there in this phase), and an agent input schema
 * is a runtime contract, so it restates the three fields it actually renders into the prompt instead
 * of importing a type across a context boundary to shape a Zod object.
 */
export const ClassifyIssueInputSchema = z.agentInput({
	/** The inbound message text to demultiplex. */
	message: z.string(),
	/** Open issues the message could continue, oldest→newest as the reader returned them. */
	openIssues: z.array(z.object({ issueId: z.string(), key: z.string(), title: z.string() })),
	/** Rolling per-thread context, oldest→newest. The prompt renders the last 20. */
	contextBuffer: z.array(z.string()).optional(),
})

/**
 * The structured shape one classification run returns — the agent's `outputSchema`, and the ONE
 * switch that makes the call structured (§4.2). Nullish fields because the model omits the ones that
 * do not apply to the decision it chose.
 *
 * This is the RAW model verdict, deliberately NOT the routing decision. The confidence gate, the
 * slug minting and the clarify fallback are POLICY and live in `services/IssueRouter` (§4.8) — an
 * agent that applied them would be deciding as well as inferring.
 */
export const LlmDecisionSchema = z.object({
	decision: z.enum(ClassificationVerdict),
	issueId: z.string().nullish(),
	confidence: z.number().min(0).max(1).nullish(),
	title: z.string().nullish(),
	question: z.string().nullish(),
})
