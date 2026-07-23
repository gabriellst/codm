import { BaseDomainEvent, z } from '@codedm/core-typescript'

/** Context-private thread control-plane fact (no cross-context consumer today; kept for the audit
 *  trail + a future live-status SSE surface). */
export const ThreadDetachedEventSchema = z.domainEvent({ threadId: z.string() })
export class ThreadDetachedEvent extends BaseDomainEvent<typeof ThreadDetachedEventSchema> {
	static override readonly name = 'thread.detached' as const
	static readonly schema = ThreadDetachedEventSchema
}
