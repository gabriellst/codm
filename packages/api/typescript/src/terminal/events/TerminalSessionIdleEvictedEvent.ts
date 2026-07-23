import { BaseDomainEvent, z } from '@codedm/core-typescript'

/**
 * Context-private fact: the engine's idle sweep evicted a session that saw no activity for
 * `idleForMs`. AMENDMENT (phase-10, ratified): terminal-DOMAIN event only — NO wire event;
 * nothing outside the terminal context reacts to eviction today (the next inbound for the same
 * issue simply cold-starts a fresh claude REPL).
 */
export const TerminalSessionIdleEvictedEventSchema = z.domainEvent({
	issueId: z.string(),
	terminalSessionId: z.string(),
	idleForMs: z.number(),
})

export class TerminalSessionIdleEvictedEvent extends BaseDomainEvent<typeof TerminalSessionIdleEvictedEventSchema> {
	static override readonly name = 'terminal.session.idle_evicted' as const
	static readonly schema = TerminalSessionIdleEvictedEventSchema
}
