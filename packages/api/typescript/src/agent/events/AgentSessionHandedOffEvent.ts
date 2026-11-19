import { BaseDomainEvent, z } from '@codm/core-typescript'
import { HandoffNotesSource } from '../enums/HandoffNotesSource'

export const AgentSessionHandedOffEventSchema = z.domainEvent({
	issueId: z.string(),
	/** The context the abandoned session had reached — what the handoff stopped re-reading on every call. */
	fromContextTokens: z.number().int().nonnegative(),
	/** Whether the fresh session started from the notes the old one wrote, or only from the derived ones. */
	notesSource: z.enum(HandoffNotesSource),
	/**
	 * The two CLI session ids — kept for audit. The session row holds one session per issue and moves on to the new
	 * id, so this fact is where "which session did this task work in before" stays answerable.
	 */
	fromAgentSessionId: z.string(),
	toAgentSessionId: z.string(),
})

/**
 * OBSERVED FACT: an issue's CLI session was past the context budget and the turn continued the task in a FRESH
 * session seeded with handoff notes (fase 4, item 6a). Written in the transaction that records the new session on the
 * row — a turn a pause killed, or an "agora" cut before the CLI reported a session, records nothing, and the next turn
 * hands off again from the same notes.
 */
export class AgentSessionHandedOffEvent extends BaseDomainEvent<typeof AgentSessionHandedOffEventSchema> {
	static override readonly name = 'agent.session.handed_off' as const
	static readonly schema = AgentSessionHandedOffEventSchema
}
