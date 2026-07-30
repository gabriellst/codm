import { BaseDomainEvent, z } from '@codm/core-typescript'

/** Context-private fact: the operator whispered a steer (never delivered to the channel). Fanned out
 *  to every active issue's agent context downstream (BC5). */
export const ThreadSteeredEventSchema = z.domainEvent({
	threadId: z.string(),
	entryId: z.string(),
	text: z.string(),
})

export class ThreadSteeredEvent extends BaseDomainEvent<typeof ThreadSteeredEventSchema> {
	static override readonly name = 'thread.steered' as const
	static readonly schema = ThreadSteeredEventSchema
}
