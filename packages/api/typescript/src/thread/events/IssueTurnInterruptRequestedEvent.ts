import { BaseDomainEvent, z } from '@codm/core-typescript'

/**
 * Context-private fact: a routed steer said "agora" — it wants the issue's running turn cut so it can
 * lead the next one (fase 2, item 4). Recorded with the entry, in the ingest's transaction; the cut
 * itself happens after commit (`InterruptIssueTurnOnSteer`), so a rolled-back ingest never kills a turn.
 */
export const IssueTurnInterruptRequestedEventSchema = z.domainEvent({
	threadId: z.string(),
	issueId: z.string(),
	/** The steer's transcript entry — the turn carrying it is never the one cut. */
	entryId: z.string(),
})

export class IssueTurnInterruptRequestedEvent extends BaseDomainEvent<typeof IssueTurnInterruptRequestedEventSchema> {
	static override readonly name = 'thread.issue_turn_interrupt_requested' as const
	static readonly schema = IssueTurnInterruptRequestedEventSchema
}
