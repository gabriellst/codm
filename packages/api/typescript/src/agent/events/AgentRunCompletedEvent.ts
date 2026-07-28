import { BaseDomainEvent, z } from '@codedm/core-typescript'
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
})

export class AgentRunCompletedEvent extends BaseDomainEvent<typeof AgentRunCompletedEventSchema> {
	static override readonly name = 'agent.run.completed' as const
	static readonly schema = AgentRunCompletedEventSchema
}
