import { BaseDomainEvent, z } from '@codm/core-typescript'
import { PermissionPosture, StopResolution } from '@codm/contracts-typescript/wire/enums'

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
 *
 * `posture` (participant-permission-posture, Decision 7) is the posture the RESUME runs under — already
 * resolved by the aggregate (the resolver's posture, or AUTO for a DENY), so the handler that queues
 * the resume copies it rather than recomputing who resolved. It is NOT bridged to the integration event:
 * nobody outside this process schedules turns. A fact persisted before this field existed arrives
 * without it, and the mailbox column's `DEFAULT 'AUTO'` is what that resume runs under.
 */
export const ThreadStopResolvedEventSchema = z.domainEvent({
	stopId: z.string(),
	issueId: z.string().optional(),
	threadId: z.string(),
	resolution: z.enum(StopResolution),
	posture: z.enum(PermissionPosture),
})
export class ThreadStopResolvedEvent extends BaseDomainEvent<typeof ThreadStopResolvedEventSchema> {
	static override readonly name = 'thread.stop_resolved' as const
	static readonly schema = ThreadStopResolvedEventSchema
}
