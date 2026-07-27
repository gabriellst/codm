import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { StopKind } from '@codedm/contracts-typescript/wire/enums'

/**
 * Context-private fact: a terminal session stopped and needs the human (a non-zero exit maps to
 * SERVER_ERROR). The internal bridge maps it to the frozen `integration.issue.stop_raised`, which
 * flips the thread to NEEDS_ATTENTION and lights the dock badge / Home callout.
 */
export const AgentRunStopRaisedEventSchema = z.domainEvent({
	stopId: z.string(),
	issueId: z.string(),
	threadId: z.string(),
	kind: z.enum(StopKind),
})

export class AgentRunStopRaisedEvent extends BaseDomainEvent<typeof AgentRunStopRaisedEventSchema> {
	static override readonly name = 'agent.run.stop_raised' as const
	static readonly schema = AgentRunStopRaisedEventSchema
}
