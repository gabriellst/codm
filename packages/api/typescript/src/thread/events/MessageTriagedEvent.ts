import { BaseDomainEvent, z } from '@codm/core-typescript'
import { TriageDecision } from '@agent/enums'

/**
 * Context-private fact: the parallel triage (fase 2) decided where one inbound message goes — the
 * MEASUREMENT record. Persisted with the outbox like every fact, so "Como medi" can compare the triage's
 * latency and verdicts with the orchestrator-queue baseline (median 24 s, p90 110 s) without a table of
 * its own.
 *
 * `decision` is the path TAKEN (after the confidence floors and the steerability check), `fallback` why the
 * model's own answer was not taken, and `applied` whether the verdict reached the queue at all — false
 * when the hold lapsed first and the orchestrator was already answering.
 */
export const MessageTriagedEventSchema = z.domainEvent({
	threadId: z.string(),
	entryId: z.string(),
	decision: z.enum(TriageDecision),
	confidence: z.number().optional(),
	latencyMs: z.number().int().nonnegative(),
	fallback: z.string().optional(),
	applied: z.boolean(),
	/** The issue a STEER went to. */
	issueId: z.string().optional(),
})

export class MessageTriagedEvent extends BaseDomainEvent<typeof MessageTriagedEventSchema> {
	static override readonly name = 'thread.message_triaged' as const
	static readonly schema = MessageTriagedEventSchema
}
