import { BaseDomainEvent, z } from '@codedm/core-typescript'

/**
 * Context-private fact: an agent finished a terminal run and drafted a reply for its issue. The
 * internal bridge maps it to the frozen `integration.agent.reply_drafted` (labeled for the gateway).
 */
export const TerminalReplyDraftedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	key: z.string(),
	text: z.string(),
})

export class TerminalReplyDraftedEvent extends BaseDomainEvent<typeof TerminalReplyDraftedEventSchema> {
	static override readonly name = 'terminal.agent.reply_drafted' as const
	static readonly schema = TerminalReplyDraftedEventSchema
}
