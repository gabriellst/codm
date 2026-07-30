import { injectable } from 'tsyringe-neo'
import { BaseError, tryCatchAsync, z } from '@codm/core-typescript'
import type Z from 'zod'
import type { ApplicationErrors, DomainErrors } from '../../errors'

/**
 * TRANSPORT frames of the two-stream split — what rides the SSE side-channel straight to the
 * observing browser. NOT domain facts; they never touch the outbox.
 *
 *   - `browser.terminal_output_appended` — one line of terminal output (T12 panel).
 *   - `browser.terminal_action_detected` — one tool the agent invoked, named (wave-0 AMENDMENT:
 *     action_detected is an SSE frame ONLY — no wire event).
 *
 * Declared as ZOD (types inferred) so the emitting surface (`StreamTerminalSession`) publishes the
 * MATERIALIZED discriminated union on the wire — never z.unknown().
 */
export const TerminalOutputFrameSchema = z.object({
	name: z.literal('browser.terminal_output_appended'),
	issueId: z.uuid(),
	line: z.string(),
	at: z.iso.datetime(),
	stream: z.enum(['stdout', 'stderr']),
})

/**
 * One tool call, as the panel shows it — "Claude is editing `foo.ts`" (§4.9's net gain).
 *
 * ### `tool` is `z.string()`, and that is not a lapse of the closed-set rule
 * Until Fase 7 this frame was keyed on a nine-member enum of TUI action types — the output of a
 * regex parser over claude's terminal UI, i.e. a guess at a vocabulary nobody publishes. The
 * decoder now reads the REAL tool name off the `tool_use` frame of `--output-format stream-json`, and
 * that set is OPEN by construction: every MCP server a run mounts adds tools at runtime, including
 * our own (`mcp__codm__TransitionIssueStatus` and friends). `CLAUDE.md`'s "closed set → enum" rule
 * is about closed sets; enumerating an open one is what produced the brittle thing this replaces.
 * The same carve-out is already written on `AgentToolCallEvent.tool`, for the same reason.
 *
 * `input` is a one-line SUMMARY of the tool's arguments, not the argument object: the panel wants
 * "which file", and a transport frame is not a place to mirror an unbounded payload.
 */
export const TerminalActionFrameSchema = z.object({
	name: z.literal('browser.terminal_action_detected'),
	issueId: z.uuid(),
	tool: z.string(),
	input: z.string(),
	at: z.iso.datetime(),
})

export const TerminalSseFrameSchema = z.discriminatedUnion('name', [TerminalOutputFrameSchema, TerminalActionFrameSchema])

export type TerminalOutputFrame = Z.infer<typeof TerminalOutputFrameSchema>
export type TerminalActionFrame = Z.infer<typeof TerminalActionFrameSchema>
export type TerminalSseFrame = Z.infer<typeof TerminalSseFrameSchema>

export type TerminalStreamWriter = (frame: TerminalSseFrame) => void | Promise<void>

interface StreamEntry {
	writer: TerminalStreamWriter
	ownerId: string
}

/**
 * Whatscode's `AgentStreamRegistry`, ADOPTED WHOLE (Fork C, ratified: option 1 — not the fold)
 * and rekeyed `chatId → issueId` (Fork B). It additionally ABSORBS the single-active-run guard that
 * codm's interim per-issue session registry carried — that guard is an INVARIANT ("one agent run
 * per issue") and migrates INTO the adopted registry; the interim registry is superseded and deleted.
 * (Its class name is not repeated: Fase 5 dissolved the `terminal` context and AC-5.11 keeps the dead
 * `Terminal*` symbols out of the tree, prose included.)
 *
 *   1. OBSERVER channel — at most one live SSE writer per issue (`register`/`send`/`unregister`).
 *      Double-register throws `SESSION_ALREADY_STREAMING`; a per-owner soft cap throws
 *      `TOO_MANY_TERMINAL_STREAMS`; `send` delivers nothing when no observer is attached and
 *      force-unregisters a writer that throws.
 *
 *   1b. REPLAY buffer (F3) — every frame `send` handles is also RECORDED, attached observer or not,
 *      and `historyFor` hands the tail to an observer the moment it takes the slot. Without it this
 *      channel was a pure live tail: opening a panel mid-run showed a blank terminal that filled from
 *      wherever the run happened to be, and leaving the screen discarded everything said meanwhile.
 *      Bounded twice — frames per issue, and issues holding a buffer — so neither a long run nor a
 *      busy day can grow the daemon without limit.
 *
 *   2. SINGLE-ACTIVE-RUN guard — `beginSession`/`endSession` enforce one run per issue
 *      independent of whether a browser is observing. `RunIssueTurn` brackets its run with
 *      these; a second concurrent run for the same issue throws `TERMINAL_ALREADY_RUNNING`.
 *
 * TODO(scale): both maps are process-local — shard by issueId at the ingress before horizontal
 * scale (same documented limitation as the whatscode original).
 *
 * Registered as a container-scoped SINGLETON in `agent/registry.ts` (all envs).
 */
@injectable()
export class AgentStreamRegistry {
	/** Soft cap on concurrent SSE streams per owner. Prevents trivial DoS. */
	static readonly MAX_STREAMS_PER_OWNER = 5

	/**
	 * Replay depth per issue. Matches the browser panel's own `MAX_FRAMES` on purpose: retaining more
	 * than the client will keep would only be memory nobody can see.
	 */
	static readonly MAX_HISTORY_FRAMES = 500

	/** How many issues keep a replay buffer at once. Least-recently-written is evicted first. */
	static readonly MAX_HISTORY_ISSUES = 50

	private writers = new Map<string, StreamEntry>()
	private ownerCounts = new Map<string, number>()
	private activeSessions = new Set<string>()
	// Insertion-ordered by design: a `Map` iterates in insertion order, and `record` re-inserts the
	// issue it touches, so the FIRST key is always the least-recently-written one to evict.
	private history = new Map<string, TerminalSseFrame[]>()

	// ── Observer channel (whatscode AgentStreamRegistry, verbatim in spirit) ────────────────────

	register(issueId: string, ownerId: string, writer: TerminalStreamWriter): () => void {
		if (this.writers.has(issueId)) {
			throw new BaseError<DomainErrors>('SESSION_ALREADY_STREAMING', `Issue ${issueId} is already streaming`)
		}

		const currentForOwner = this.ownerCounts.get(ownerId) ?? 0
		if (currentForOwner >= AgentStreamRegistry.MAX_STREAMS_PER_OWNER) {
			throw new BaseError<ApplicationErrors>(
				'TOO_MANY_TERMINAL_STREAMS',
				`Owner ${ownerId} has reached the concurrent stream limit (${AgentStreamRegistry.MAX_STREAMS_PER_OWNER})`,
			)
		}

		this.writers.set(issueId, { writer, ownerId })
		this.ownerCounts.set(ownerId, currentForOwner + 1)

		return () => this.unregister(issueId)
	}

	private unregister(issueId: string): void {
		const entry = this.writers.get(issueId)
		if (!entry) return
		this.writers.delete(issueId)

		const count = this.ownerCounts.get(entry.ownerId) ?? 0
		if (count <= 1) {
			this.ownerCounts.delete(entry.ownerId)
		} else {
			this.ownerCounts.set(entry.ownerId, count - 1)
		}
	}

	/**
	 * Removes the writer for `issueId` without going through the closure returned by `register()`.
	 * Used when a writer throws — idempotent because `unregister` checks `writers.has(issueId)`.
	 */
	forceUnregister(issueId: string): void {
		this.unregister(issueId)
	}

	get(issueId: string): TerminalStreamWriter | undefined {
		return this.writers.get(issueId)?.writer
	}

	has(issueId: string): boolean {
		return this.writers.has(issueId)
	}

	ownerCount(ownerId: string): number {
		return this.ownerCounts.get(ownerId) ?? 0
	}

	/**
	 * Deliver one transport frame to the observer registered for `issueId`. Dropped silently when
	 * no observer is attached (a headless run still persists its outbox facts). On writer failure
	 * the observer is force-unregistered so subsequent frames are dropped; a mid-stream writer
	 * failure is terminal for that observer.
	 */
	async send(issueId: string, frame: TerminalSseFrame): Promise<void> {
		// RECORDED FIRST, and unconditionally — this is the half F3 was missing. A run whose observer
		// has not attached yet (the panel is opened seconds after the turn starts) or has gone away (the
		// operator navigated to another screen) still produces the output that explains what happened;
		// dropping it because nobody happened to be looking is what made the panel show a run already in
		// progress as if it had just begun.
		this.record(issueId, frame)

		const writer = this.writers.get(issueId)?.writer
		if (!writer) return

		const result = await tryCatchAsync(async () => writer(frame))
		if (!result.success) {
			this.unregister(issueId)
		}
	}

	/**
	 * What this issue has emitted so far, oldest first — replayed to an observer the moment it attaches.
	 *
	 * DELIBERATELY IN MEMORY. These are transport frames: the two-stream split says they ride no outbox
	 * and cross no service, and the durable account of what an agent did is the `AgentMessageEvent` /
	 * `AgentToolCallEvent` facts, which do. Persisting every frame would also put a SELECT+INSERT inside
	 * the run's hot streaming loop to buy something nobody asked for (surviving a daemon restart). If
	 * that is wanted later, `issue_terminal_lines` already exists for it.
	 */
	historyFor(issueId: string): readonly TerminalSseFrame[] {
		return this.history.get(issueId) ?? []
	}

	/** Bounded append: cap the frames per issue, then cap the issues that hold frames at all. */
	private record(issueId: string, frame: TerminalSseFrame): void {
		const frames = this.history.get(issueId) ?? []
		frames.push(frame)
		if (frames.length > AgentStreamRegistry.MAX_HISTORY_FRAMES) {
			frames.splice(0, frames.length - AgentStreamRegistry.MAX_HISTORY_FRAMES)
		}

		// Re-insert so this issue becomes the most recent key — see the field's note on Map ordering.
		this.history.delete(issueId)
		this.history.set(issueId, frames)

		while (this.history.size > AgentStreamRegistry.MAX_HISTORY_ISSUES) {
			const oldest = this.history.keys().next()
			if (oldest.done) break
			this.history.delete(oldest.value)
		}
	}

	// ── Single-active-run guard (absorbed from the superseded interim session registry) ──────────

	/**
	 * Claim the single terminal session for `issueId`. Throws `TERMINAL_ALREADY_RUNNING` if a run
	 * is already active for that issue. Pair with `endSession` in a `finally`.
	 */
	beginSession(issueId: string): void {
		if (this.activeSessions.has(issueId)) {
			throw new BaseError<DomainErrors>('TERMINAL_ALREADY_RUNNING', `Issue ${issueId} already has an active terminal session`)
		}
		this.activeSessions.add(issueId)
	}

	endSession(issueId: string): void {
		this.activeSessions.delete(issueId)
	}

	isActive(issueId: string): boolean {
		return this.activeSessions.has(issueId)
	}
}
