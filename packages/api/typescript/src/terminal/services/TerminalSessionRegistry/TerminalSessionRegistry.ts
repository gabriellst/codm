import { injectable } from 'tsyringe-neo'
import { BaseError, tryCatchAsync } from '@template/core-typescript'
import type { ApplicationErrors, DomainErrors } from '../../errors'

/**
 * One TRANSPORT frame of the two-stream split — a single line of terminal output for an issue's
 * session. It rides the SSE side-channel (`browser.terminal_output_appended`) directly to the
 * observing browser; it is NOT a domain fact and never touches the outbox. Domain facts
 * (AgentReplyDrafted / IssueCompleted / StopRaised) flow through the outbox separately.
 */
export interface TerminalOutputFrame {
	issueId: string
	line: string
	at: string
	stream: 'stdout' | 'stderr'
}

export type TerminalStreamWriter = (frame: TerminalOutputFrame) => void | Promise<void>

interface StreamEntry {
	writer: TerminalStreamWriter
	ownerId: string
}

/**
 * The CodeDM descendant of whatscode's `AgentStreamRegistry`, rekeyed `chatId → issueId`. A
 * process-local, domain-free in-memory registry with two responsibilities:
 *
 *   1. OBSERVER channel — at most one live SSE writer per issue (`register`/`send`/`unregister`).
 *      Double-register throws `SESSION_ALREADY_STREAMING`; a per-owner soft cap throws
 *      `TOO_MANY_TERMINAL_STREAMS`; `send` drops silently when no observer is attached and force-
 *      unregisters a writer that throws. This is the ported AgentStreamRegistry, verbatim in spirit.
 *
 *   2. SINGLE-ACTIVE-RUN guard — `beginSession`/`endSession` enforce "one terminal session per
 *      issue" independent of whether a browser is observing. `RunTerminalSession` brackets its run
 *      with these; a second concurrent run for the same issue throws `TERMINAL_ALREADY_RUNNING`.
 *
 * TODO(scale): both maps are process-local — shard by issueId at the ingress before horizontal
 * scale (same documented limitation as the whatscode original).
 *
 * Registered as a container-scoped SINGLETON in `terminal/registry.ts` (all envs) — its in-memory
 * state must be shared across every controller/use case in the process.
 */
@injectable()
export class TerminalSessionRegistry {
	/** Soft cap on concurrent SSE observers per owner. Prevents trivial DoS. */
	static readonly MAX_STREAMS_PER_OWNER = 5

	private writers = new Map<string, StreamEntry>()
	private ownerCounts = new Map<string, number>()
	private activeSessions = new Set<string>()

	// ── Observer channel (ported AgentStreamRegistry) ───────────────────────────────────────────

	register(issueId: string, ownerId: string, writer: TerminalStreamWriter): () => void {
		if (this.writers.has(issueId)) {
			throw new BaseError<DomainErrors>('SESSION_ALREADY_STREAMING', `Issue ${issueId} is already streaming`)
		}

		const currentForOwner = this.ownerCounts.get(ownerId) ?? 0
		if (currentForOwner >= TerminalSessionRegistry.MAX_STREAMS_PER_OWNER) {
			throw new BaseError<ApplicationErrors>(
				'TOO_MANY_TERMINAL_STREAMS',
				`Owner ${ownerId} has reached the concurrent stream limit (${TerminalSessionRegistry.MAX_STREAMS_PER_OWNER})`,
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
	 * Deliver one transport frame to the observer registered for `issueId`. Dropped silently when no
	 * observer is attached (a headless run — triggered by the domain flow with no browser watching —
	 * still persists its outbox facts). On writer failure the observer is force-unregistered so
	 * subsequent frames are dropped; a mid-stream writer failure is terminal for that observer.
	 */
	async send(issueId: string, frame: TerminalOutputFrame): Promise<void> {
		const writer = this.writers.get(issueId)?.writer
		if (!writer) return

		const result = await tryCatchAsync(async () => writer(frame))
		if (!result.success) {
			this.unregister(issueId)
		}
	}

	// ── Single-active-run guard ─────────────────────────────────────────────────────────────────

	/**
	 * Claim the single terminal session for `issueId`. Throws `TERMINAL_ALREADY_RUNNING` if a run is
	 * already active for that issue — the "one terminal session per issue" invariant, enforced
	 * whether or not a browser is observing. Pair with `endSession` in a `finally`.
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
