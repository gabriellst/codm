import { AggregateRoot, z } from '@codedm/core-typescript'
import type Z from 'zod'
import { AgentModelId, ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { ResumeInvalidationReason } from '../enums'

export const AgentSessionSchema = z.object({
	ownerId: z.uuid(),
	// Fork B: session identity = issue. One durable session row per issue.
	issueId: z.uuid(),
	threadId: z.uuid(),
	provider: z.enum(ProviderKind),
	// Absolute workspace path the session runs in — stored so a later turn can prove the session was
	// created against the SAME tree it is about to be resumed into.
	cwd: z.string().trim().min(1),
	/**
	 * The provider CLI's OWN session id — what `--resume` takes. Vendor-neutral name on purpose: the
	 * field used to be named after one vendor's binary, which nailed a durable domain concept to a
	 * provider that `ProviderKind` already says is one of three.
	 */
	agentSessionId: z.string().trim().min(1),
	/** Which model the session was created under. `DEFAULT` means "whatever the CLI picks". */
	model: z.enum(AgentModelId),
	/**
	 * The conversation cursor: the id of the last transcript entry this CLI session actually consumed.
	 * Absent until a turn completes with one — see `ResumeInvalidationReason.MISSING_CURSOR`.
	 */
	lastMessageId: z.string().trim().min(1).optional(),
	lastTurnAt: z.date(),
})

export type AgentSessionProps = Z.infer<typeof AgentSessionSchema>

/** What the CALLER observed about the turn it is about to drive — the other half of the guard. */
export interface ResumeContext {
	model: AgentModelId
	cwd: string
	/**
	 * The conversation position this turn continues FROM — the issue transcript's latest entry
	 * BEFORE the message being fed. `undefined` when the caller observed none (a brand-new issue, or
	 * a transcript that disagrees with the row), which is itself grounds to start fresh.
	 */
	cursor?: string
}

/** Resume, with the id to hand `--resume`; or don't, with the NAMED reason (never a silent reset). */
export type ResumeDecision = { resume: true; id: string } | { resume: false; reason: ResumeInvalidationReason }

/**
 * `AgentSession` — the durable record of one issue's provider-CLI session.
 *
 * It carries the CLI's own session id forward between turns, which is the entire multi-turn context
 * mechanism after the PTY engine died: `--session-id` on the first turn, `--resume` on the next. The
 * alternative — re-rendering the transcript into every prompt — is the FALLBACK for providers whose
 * CLI cannot resume (`ProviderDef.resumesSessionViaCli` absent), never the default path.
 *
 * The invariant lives in `resumeDecision`. Resuming is only safe while the premises the row was
 * written under still hold; when one stops holding, the turn runs FRESH and says why. See
 * `ResumeInvalidationReason` for the four premises and why each one matters.
 */
export class AgentSession extends AggregateRoot<typeof AgentSessionSchema> {
	static override schema = AgentSessionSchema

	static create(data: {
		ownerId: string
		issueId: string
		threadId: string
		provider: ProviderKind
		cwd: string
		agentSessionId: string
		model: AgentModelId
		lastMessageId?: string
	}): AgentSession {
		return new AgentSession({
			ownerId: data.ownerId,
			issueId: data.issueId,
			threadId: data.threadId,
			provider: data.provider,
			cwd: data.cwd,
			agentSessionId: data.agentSessionId,
			model: data.model,
			lastMessageId: data.lastMessageId,
			lastTurnAt: new Date(),
		})
	}

	/**
	 * Fold ONE completed turn into the row: the (possibly new) CLI session id, the model it ran
	 * under, how far the conversation got, and the cwd the turn actually ran in.
	 *
	 * `cwd` IS folded — reversing an earlier version of this method, which left it alone on the
	 * theory that re-writing it would erase the evidence `CWD_CHANGED` is decided from. That theory
	 * was wrong: the evidence is the COMPARISON `resolveSession` makes BEFORE this call runs (this
	 * turn's cwd against the row's cwd AS IT STOOD then), not the row's value afterwards. Leaving
	 * `cwd` un-folded meant the row could never advance past whatever cwd it was first created
	 * under — so once a turn ran under a NEW cwd (the guard fired, a fresh CLI session was minted
	 * FOR that cwd), the very next turn compared against the STALE value again and re-invalidated,
	 * forever. Folding the cwd this turn actually ran under is what makes the row track the tree the
	 * CURRENT `agentSessionId` is running in — which is the only cwd the NEXT turn should be
	 * compared against, and is exactly what makes `CWD_CHANGED` converge (fire once, then resume)
	 * instead of latch (fire on every turn from then on).
	 */
	recordTurn(data: { agentSessionId: string; model: AgentModelId; cwd: string; lastMessageId?: string; at?: Date }): void {
		this.agentSessionId = data.agentSessionId
		this.model = data.model
		this.cwd = data.cwd
		if (data.lastMessageId !== undefined) this.lastMessageId = data.lastMessageId
		this.lastTurnAt = data.at ?? new Date()
		this.validate()
	}

	/**
	 * Can THIS row be handed to `--resume` for the turn described by `ctx`?
	 *
	 * Ordered most-structural first, so the reported reason is the most informative one: a run whose
	 * model AND cwd both moved is reported as `MODEL_CHANGED`, because that is the premise a reader
	 * has to fix first. Every branch returns a NAMED reason — there is no bare `false`, which is what
	 * makes "no silent session reset" (AC-4.4) checkable rather than aspirational.
	 */
	resumeDecision(ctx: ResumeContext): ResumeDecision {
		if (ctx.model !== this.model) return { resume: false, reason: ResumeInvalidationReason.MODEL_CHANGED }
		if (ctx.cwd !== this.cwd) return { resume: false, reason: ResumeInvalidationReason.CWD_CHANGED }
		if (!this.lastMessageId) return { resume: false, reason: ResumeInvalidationReason.MISSING_CURSOR }
		if (ctx.cursor !== this.lastMessageId) return { resume: false, reason: ResumeInvalidationReason.CONVERSATION_ADVANCED }
		return { resume: true, id: this.agentSessionId }
	}
}

export interface AgentSession extends AgentSessionProps {}
