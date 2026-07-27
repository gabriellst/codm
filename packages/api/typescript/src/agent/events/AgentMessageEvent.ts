import { BaseDomainEvent, z } from '@codedm/core-typescript'
import { AgentMessageRole } from '../enums'

/**
 * OBSERVED FACT: one consolidated message of an agent turn (GOAL-agent-abstraction §4.3).
 *
 * This is the SECOND of the three signal categories, and the distinction is the point of the whole
 * section: a `text_delta` frame is TRANSPORT (SSE only, never the outbox); this event is the
 * transcript that survived, folded out of those frames by the accumulator and deduped per message id.
 * The accumulator is a pure `(frame) => AgentTurnFact | null` — no spawn, no I/O — so the fold is
 * testable over canned frame sequences.
 *
 * A `BaseDomainEvent` subclass and not a POJO, because it goes to the OUTBOX. AC-1.7 asserts exactly
 * that with `instanceof`.
 */
export const AgentMessageEventSchema = z.domainEvent({
	/** Provider message id — the dedup key that keeps partial deltas from producing N transcript rows. */
	messageId: z.string(),
	role: z.enum(AgentMessageRole),
	text: z.string(),
})

export class AgentMessageEvent extends BaseDomainEvent<typeof AgentMessageEventSchema> {
	static override readonly name = 'agent.turn.message' as const
	static readonly schema = AgentMessageEventSchema
}
