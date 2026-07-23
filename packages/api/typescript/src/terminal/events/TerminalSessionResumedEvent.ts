import { BaseDomainEvent, z } from '@codedm/core-typescript'

/**
 * Context-private fact: a live terminal session was REUSED for a subsequent turn of its issue
 * (Fork B: session identity = issueId; the engine keeps the claude REPL alive between turns).
 * Domain-only — NO frozen integration counterpart; BC4/UI observe the run through the existing
 * issue.opened / reply_drafted / completed / stop_raised bridge.
 */
export const TerminalSessionResumedEventSchema = z.domainEvent({
	issueId: z.string(),
	threadId: z.string(),
	terminalSessionId: z.string(),
	cwd: z.string(),
})

export class TerminalSessionResumedEvent extends BaseDomainEvent<typeof TerminalSessionResumedEventSchema> {
	static override readonly name = 'terminal.session.resumed' as const
	static readonly schema = TerminalSessionResumedEventSchema
}
