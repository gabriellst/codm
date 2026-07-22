import { BaseDomainEvent, z } from '@template/core-typescript'
import { IssueArchiveReason, StopResolution } from '@template/contracts-typescript/wire/enums'

// Context-private facts BC5 owns and BRIDGES to frozen integration events. (Execution facts —
// opened / completed / stop_raised / agent.reply_drafted — are published by the terminal engine;
// BC5 reacts to those, it does not re-publish them.)

/** Bridged to `integration.issue.archived` (BC5 → BC4 issue-list projections). */
export const IssueArchivedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	reason: z.enum(IssueArchiveReason),
})
export class IssueArchivedEvent extends BaseDomainEvent<typeof IssueArchivedEventSchema> {
	static override readonly name = 'issue.archived' as const
	static readonly schema = IssueArchivedEventSchema
}

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
