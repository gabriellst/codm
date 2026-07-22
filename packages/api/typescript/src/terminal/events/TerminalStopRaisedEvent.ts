import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'

/**
 * Context-private fact: a terminal session stopped and needs the human (a non-zero exit maps to
 * SERVER_ERROR). The internal bridge maps it to the frozen `integration.issue.stop_raised`, which
 * flips the thread to NEEDS_ATTENTION and lights the dock badge / Home callout.
 */
export const TerminalStopRaisedEventSchema = z.domainEvent({
	stopId: z.string(),
	issueId: z.string(),
	threadId: z.string(),
	kind: z.enum(StopKind),
})

export class TerminalStopRaisedEvent extends BaseDomainEvent<typeof TerminalStopRaisedEventSchema> {
	static override readonly name = 'terminal.stop.raised' as const
	static readonly schema = TerminalStopRaisedEventSchema
}
