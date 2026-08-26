import { BaseDomainEvent, z } from '@codm/core-typescript'

export const OrchestratorRepliedEventSchema = z.domainEvent({
	threadId: z.string(),
	/** What the orchestrator said, with the citation sentinel already stripped. */
	text: z.string(),
	/**
	 * The transcript entry this reply is attached to, when the orchestrator chose to cite one (D6).
	 *
	 * Absent is the COMMON case and the right default: the canonical example's conversational beats
	 * carry no quote, and stacking one on immediate back-and-forth reads like a bot.
	 */
	replyToEntryId: z.string().optional(),
})

/**
 * The orchestrator said something (orchestrator pivot §7.3) — a domain event of the AGENT context,
 * per EVT-01, because the agent runtime is what produced the utterance.
 *
 * The thread context turns it into a delivered WhatsApp message (§7.5): it is bridged to
 * `integration.orchestrator.replied`, and `DeliverOrchestratorReply` resolves the envelope, writes the
 * SYSTEM transcript entry and asks the channel to send. Keeping the fact here and the DELIVERY there
 * is the same split `AgentRunReplyDraftedEvent` already uses — the runtime knows what was said, the
 * thread knows who to say it to.
 */
export class OrchestratorRepliedEvent extends BaseDomainEvent<typeof OrchestratorRepliedEventSchema> {
	static override readonly name = 'agent.orchestrator_replied' as const
	static readonly schema = OrchestratorRepliedEventSchema
}
