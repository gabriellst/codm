import { BaseDomainEvent, z } from '@codm/core-typescript'

/** Context-private thread control-plane fact (no cross-context consumer today; kept for the audit
 *  trail + a future live-status SSE surface). */
export const ThreadPausedEventSchema = z.domainEvent({ threadId: z.string() })
export class ThreadPausedEvent extends BaseDomainEvent<typeof ThreadPausedEventSchema> {
	static override readonly name = 'thread.paused' as const
	static readonly schema = ThreadPausedEventSchema
}
