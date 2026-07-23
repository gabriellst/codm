import { BaseDomainEvent, z } from '@codedm/core-typescript'

/**
 * Context-private fact: a terminal session's PTY died — explicitly killed, evicted for idleness,
 * torn down at shutdown, or crashed mid-run. Domain-only — NO frozen integration counterpart
 * (a crash observed mid-run additionally surfaces as issue.stop_raised via the run's outcome).
 * `threadId` is optional because out-of-band kills (idle sweep, shutdown) happen outside any
 * stream request and the runner only knows the issueId.
 */
export const TerminalSessionKilledEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string().optional(),
	terminalSessionId: z.string(),
	reason: z.enum(['idle', 'shutdown', 'crash', 'explicit']),
})

export class TerminalSessionKilledEvent extends BaseDomainEvent<typeof TerminalSessionKilledEventSchema> {
	static override readonly name = 'terminal.session.killed' as const
	static readonly schema = TerminalSessionKilledEventSchema
}
