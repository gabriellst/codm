import { injectable } from 'tsyringe-neo'
import { BaseError, tryCatchAsync, z } from '@codedm/core-typescript'
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
 * our own (`mcp__codedm__TransitionIssueStatus` and friends). `CLAUDE.md`'s "closed set → enum" rule
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
 * codedm's interim per-issue session registry carried — that guard is an INVARIANT ("one agent run
 * per issue") and migrates INTO the adopted registry; the interim registry is superseded and deleted.
 * (Its class name is not repeated: Fase 5 dissolved the `terminal` context and AC-5.11 keeps the dead
 * `Terminal*` symbols out of the tree, prose included.)
 *
 *   1. OBSERVER channel — at most one live SSE writer per issue (`register`/`send`/`unregister`).
 *      Double-register throws `SESSION_ALREADY_STREAMING`; a per-owner soft cap throws
 *      `TOO_MANY_TERMINAL_STREAMS`; `send` drops silently when no observer is attached and
 *      force-unregisters a writer that throws.
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

	private writers = new Map<string, StreamEntry>()
	private ownerCounts = new Map<string, number>()
	private activeSessions = new Set<string>()

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
		const writer = this.writers.get(issueId)?.writer
		if (!writer) return

		const result = await tryCatchAsync(async () => writer(frame))
		if (!result.success) {
			this.unregister(issueId)
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
