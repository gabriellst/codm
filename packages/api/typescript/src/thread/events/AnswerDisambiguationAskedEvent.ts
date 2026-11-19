import { BaseDomainEvent, z } from '@codm/core-typescript'

/**
 * Context-private fact (fase 3, item 3): a bare "sim"/"não" arrived while SEVERAL asks were open that this
 * person may answer, so the group was asked ONE question — which one? It is also the memory of that question:
 * a second bare answer from the same person within `DISAMBIGUATION_QUIET_MS` asks nothing again and goes to
 * the orchestrator. Carries the person's address, so it is never bridged to an integration event.
 */
export const AnswerDisambiguationAskedEventSchema = z.domainEvent({
	threadId: z.uuid(),
	/** The roster id of who answered — what the quiet window is keyed by. */
	participantId: z.string(),
	/** The inbound entry (the bare answer) and the entry of the question the group got. */
	entryId: z.uuid(),
	questionEntryId: z.uuid(),
	stopIds: z.array(z.uuid()),
})

export class AnswerDisambiguationAskedEvent extends BaseDomainEvent<typeof AnswerDisambiguationAskedEventSchema> {
	static override readonly name = 'thread.answer_disambiguation_asked' as const
	static readonly schema = AnswerDisambiguationAskedEventSchema
}
