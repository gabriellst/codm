import { BaseDomainEvent, z } from '@codm/core-typescript'
import { FactSource } from '../enums/FactSource'

/**
 * Context-private fact: a terminal session finished cleanly. The internal bridge maps it to the
 * frozen `integration.issue.completed`, which starts BC4's 24h auto-archive clock.
 *
 * `source` is the CARRIER of §4.3 rule 6, added in Fase 6: `DECLARED` when the agent called the
 * `TransitionIssueStatus` MCP tool, `INFERRED` when `RunIssueTurn` derived the completion from the
 * terminal outcome because the agent ran with an EMPTY tool scope. Contract cost is ZERO — this is a
 * context-private domain event, it never reaches TypeSpec/OpenAPI, and `PublishAgentIntegrationEvents`
 * deliberately does NOT forward the field onto the frozen integration event.
 */
export const AgentRunCompletedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	key: z.string(),
	completedAt: z.date(),
	source: z.enum(FactSource),
	/**
	 * What the agent DECLARED it did, via the `transitionIssueStatus` tool.
	 *
	 * Absent when the completion was INFERRED from a clean exit (no tool scope), because then nobody
	 * said anything — inventing a summary there would put words in the agent's mouth. Before the pivot
	 * this value was destructured in `DeclareIssueComplete` and thrown away.
	 */
	summary: z.string().optional(),
	/** The artifact the agent DECLARED as the final result (fase 3) — the closing line carries it to the group. */
	finalArtifactId: z.string().optional(),
	/**
	 * Why the artifact the agent declared as the result did NOT go with the closing (the refusal's error code:
	 * not this issue's, file gone, too large, channel without media). The completion stands without it — the
	 * record of what was dropped lives here, on the fact, and never crosses to the integration event.
	 */
	finalArtifactRefusal: z.string().optional(),
	/**
	 * The person's message the turn that declared this was answering (a routed steer) — the closing quotes it
	 * and is their answer (`IssueTurnAborter.answerWithClosing`). Crosses as `integration.issue.completed`'s.
	 */
	answersEntryId: z.string().optional(),
})

export class AgentRunCompletedEvent extends BaseDomainEvent<typeof AgentRunCompletedEventSchema> {
	static override readonly name = 'agent.run.completed' as const
	static readonly schema = AgentRunCompletedEventSchema
}
