import { BaseDomainEvent, z } from '@codedm/core-typescript'

/**
 * Context-private fact: a terminal session finished cleanly. The internal bridge maps it to the
 * frozen `integration.issue.completed`, which starts BC4's 24h auto-archive clock.
 */
export const AgentRunCompletedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	key: z.string(),
	completedAt: z.date(),
})

export class AgentRunCompletedEvent extends BaseDomainEvent<typeof AgentRunCompletedEventSchema> {
	static override readonly name = 'agent.run.completed' as const
	static readonly schema = AgentRunCompletedEventSchema
}
