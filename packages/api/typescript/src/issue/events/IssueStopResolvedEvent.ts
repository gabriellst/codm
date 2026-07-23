import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { StopResolution } from '@codedm/contracts-typescript/wire/enums'

/** Bridged to `integration.issue.stop_resolved` (TAKE_OVER additionally pauses the thread in BC4). */
export const IssueStopResolvedEventSchema = z.domainEvent({
	stopId: z.string(),
	issueId: z.string(),
	threadId: z.string(),
	resolution: z.enum(StopResolution),
})
export class IssueStopResolvedEvent extends BaseDomainEvent<typeof IssueStopResolvedEventSchema> {
	static override readonly name = 'issue.stop_resolved' as const
	static readonly schema = IssueStopResolvedEventSchema
}
