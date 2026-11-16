import { BaseDomainEvent, z } from '@codm/core-typescript'
import { IssueControlSource } from '@codm/contracts-typescript/wire/enums'

/**
 * The hold on an issue was lifted ("continue" / "retome", or the console button) — the mirror of
 * `IssuePausedEvent`, with the same attribution fields for the same reason.
 *
 * Consumed in-context by `ReleaseIssueWorkOnResume`, which releases the queue items the dispatcher
 * deferred while the issue was held, so the work continues now instead of at the next re-check.
 */
export const IssueResumedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	source: z.enum(IssueControlSource),
	requestedBy: z.string().optional(),
	requestedById: z.string().optional(),
})
export class IssueResumedEvent extends BaseDomainEvent<typeof IssueResumedEventSchema> {
	static override readonly name = 'issue.resumed' as const
	static readonly schema = IssueResumedEventSchema
}
