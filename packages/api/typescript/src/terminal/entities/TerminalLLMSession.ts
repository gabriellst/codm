import { AggregateRoot, z } from '@codedm/core-typescript'
import type Z from 'zod'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'

export const TerminalLLMSessionSchema = z.object({
	ownerId: z.uuid(),
	// Fork B: session identity = issue. One durable session row per issue.
	issueId: z.uuid(),
	threadId: z.uuid(),
	provider: z.enum(ProviderKind),
	// Absolute workspace path the session runs in — stored so the prewarm sweep can respawn a
	// session without a cross-context join back through thread → workspace.
	cwd: z.string().trim().min(1),
	// The `--session-id` we handed to the provider CLI; the JSONL transcript path derives from it.
	claudeSessionId: z.string().trim().min(1),
	lastTurnAt: z.date(),
})

export type TerminalLLMSessionProps = Z.infer<typeof TerminalLLMSessionSchema>

/**
 * `TerminalLLMSession` — the durable record of an issue's terminal session (whatscode port,
 * rekeyed (mappingId, senderJid) → issueId per Fork B). Carries the provider CLI session id
 * forward between turns/restarts and feeds the startup prewarm sweep (recency = lastTurnAt).
 */
export class TerminalLLMSession extends AggregateRoot<typeof TerminalLLMSessionSchema> {
	static override schema = TerminalLLMSessionSchema

	static create(data: {
		ownerId: string
		issueId: string
		threadId: string
		provider: ProviderKind
		cwd: string
		claudeSessionId: string
	}): TerminalLLMSession {
		return new TerminalLLMSession({
			ownerId: data.ownerId,
			issueId: data.issueId,
			threadId: data.threadId,
			provider: data.provider,
			cwd: data.cwd,
			claudeSessionId: data.claudeSessionId,
			lastTurnAt: new Date(),
		})
	}

	recordTurn(claudeSessionId: string, at: Date = new Date()): void {
		this.claudeSessionId = claudeSessionId
		this.lastTurnAt = at
		this.validate()
	}
}

export interface TerminalLLMSession extends TerminalLLMSessionProps {}
