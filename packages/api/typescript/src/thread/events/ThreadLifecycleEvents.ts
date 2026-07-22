import { BaseDomainEvent, z } from '@codedm/core-typescript'

// Context-private thread control-plane facts (no cross-context consumers today; kept for the audit
// trail + a future live-status SSE surface). One file — they share an identical minimal shape.

export const ThreadPausedEventSchema = z.domainEvent({ threadId: z.string() })
export class ThreadPausedEvent extends BaseDomainEvent<typeof ThreadPausedEventSchema> {
	static override readonly name = 'thread.paused' as const
	static readonly schema = ThreadPausedEventSchema
}

export const ThreadResumedEventSchema = z.domainEvent({ threadId: z.string() })
export class ThreadResumedEvent extends BaseDomainEvent<typeof ThreadResumedEventSchema> {
	static override readonly name = 'thread.resumed' as const
	static readonly schema = ThreadResumedEventSchema
}

export const ThreadDetachedEventSchema = z.domainEvent({ threadId: z.string() })
export class ThreadDetachedEvent extends BaseDomainEvent<typeof ThreadDetachedEventSchema> {
	static override readonly name = 'thread.detached' as const
	static readonly schema = ThreadDetachedEventSchema
}
