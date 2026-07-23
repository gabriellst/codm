import { BaseDomainEvent, z } from '@codedm/core-typescript'

/** Context-private thread control-plane fact (no cross-context consumer today; kept for the audit
 *  trail + a future live-status SSE surface). */
export const ThreadResumedEventSchema = z.domainEvent({ threadId: z.string() })
export class ThreadResumedEvent extends BaseDomainEvent<typeof ThreadResumedEventSchema> {
	static override readonly name = 'thread.resumed' as const
	static readonly schema = ThreadResumedEventSchema
}
