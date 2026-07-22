import { BaseDomainEvent, z } from '@codedm/core-typescript'

/**
 * Context-private fact: a terminal session finished cleanly. The internal bridge maps it to the
 * frozen `integration.issue.completed`, which starts BC4's 24h auto-archive clock.
 */
export const TerminalSessionCompletedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	key: z.string(),
	completedAt: z.date(),
})

export class TerminalSessionCompletedEvent extends BaseDomainEvent<typeof TerminalSessionCompletedEventSchema> {
	static override readonly name = 'terminal.session.completed' as const
	static readonly schema = TerminalSessionCompletedEventSchema
}
