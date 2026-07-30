import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { StopResolution } from '@codedm/contracts-typescript/wire/enums'

/**
 * A stop was resolved by the operator. Raised by `Thread.resolveStop` and bridged to
 * `integration.thread.stop_resolved` by `PublishThreadIntegrationEvents` (TAKE_OVER additionally pauses
 * the thread).
 *
 * Renamed and relocated from `issue/events/IssueStopResolvedEvent` in B4: events live in the context
 * that owns the aggregate raising them, and since spec decision 4 the Stop is a child of `Thread`.
 *
 * `issueId` is OPTIONAL, mirroring the column: a thread-level stop (the orchestrator's needs-approval,
 * before any issue exists) has none. `threadId` is always present — it is the aggregate's id.
 */
export const ThreadStopResolvedEventSchema = z.domainEvent({
	stopId: z.string(),
	issueId: z.string().optional(),
	threadId: z.string(),
	resolution: z.enum(StopResolution),
})
export class ThreadStopResolvedEvent extends BaseDomainEvent<typeof ThreadStopResolvedEventSchema> {
	static override readonly name = 'thread.stop_resolved' as const
	static readonly schema = ThreadStopResolvedEventSchema
}
