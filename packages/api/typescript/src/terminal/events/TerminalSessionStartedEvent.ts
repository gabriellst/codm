import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'

/**
 * Context-private fact: a terminal session was spawned for an issue (the OpenIssue → spawn coupling
 * of BC5). The internal bridge maps it to the frozen `integration.issue.opened` for BC4/BC1.
 */
export const TerminalSessionStartedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	key: z.string(),
	title: z.string(),
	provider: z.enum(ProviderKind),
})

export class TerminalSessionStartedEvent extends BaseDomainEvent<typeof TerminalSessionStartedEventSchema> {
	static override readonly name = 'terminal.session.started' as const
	static readonly schema = TerminalSessionStartedEventSchema
}
