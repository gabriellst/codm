import { BaseDomainEvent, z } from '@codedm/core-typescript'

/**
 * Context-private fact: an agent finished a terminal run and drafted a reply for its issue. The
 * internal bridge maps it to the frozen `integration.agent.reply_drafted` (labeled for the gateway).
 */
export const AgentRunReplyDraftedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	key: z.string(),
	text: z.string(),
})

export class AgentRunReplyDraftedEvent extends BaseDomainEvent<typeof AgentRunReplyDraftedEventSchema> {
	static override readonly name = 'agent.run.reply_drafted' as const
	static readonly schema = AgentRunReplyDraftedEventSchema
}
