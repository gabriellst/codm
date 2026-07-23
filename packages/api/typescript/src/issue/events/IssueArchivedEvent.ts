import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { IssueArchiveReason } from '@codedm/contracts-typescript/wire/enums'

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
