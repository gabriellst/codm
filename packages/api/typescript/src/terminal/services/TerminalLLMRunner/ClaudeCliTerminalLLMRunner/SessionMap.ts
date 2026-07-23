import type { PtyHandle } from './spawner'
import type { WriteQueue } from './queue'
import type { TerminalRuntimeEvent } from '../types'
import type { RunnerLogger } from './logger/RunnerLogger'
import type { TuiActionParser } from './tui/TuiActionParser'

export interface SessionEmitter {
	current: (ev: TerminalRuntimeEvent) => void
}

/**
 * Owns the JSONL tail lifecycle for a session. `stop()` aborts the underlying async generator.
 */
export interface TranscriptTail {
	sessionId: string
	transcriptPath: string
	stop(): Promise<void>
}

export interface LiveSession {
	/** Fork B: the map key IS the issueId. */
	key: string
	issueId: string
	// Our internal id for this PTY conversation. Equal to the `--session-id` we passed to claude,
	// so the JSONL transcript path is derivable from it.
	terminalSessionId: string
	cwd: string
	pty: PtyHandle
	// Long-running JSONL tail handle. Drives turn-end detection (system/turn_duration record) and
	// assistant text extraction.
	tail: TranscriptTail
	queue: WriteQueue
	lastActivityAt: number
	// Session-scoped logger (badge already embedded).
	logger: RunnerLogger
	// TUI line parser owning both the action observability channel and the reliability-signal
	// channel. runTurn calls `parser?.armForSubmit()` before writing the bracketed paste so the
	// signal-channel state machine resets between turns.
	//
	// Optional: set when the session was constructed via `attemptSpawn` (cold spawn for an inbound
	// message). Pre-warmed sessions go through `bootAndConstructSession` only and never get a
	// parser attached — `runTurn` defensive-chains every access (`session.parser?.…`), so
	// pre-warmed sessions silently fall back to JSONL-only turn-end detection on their first turn.
	parser?: TuiActionParser
	// Raw PTY data subscribers (pty-data logger + TUI parser feed). Disposed in killOne() before
	// closePtyGracefully().
	traceSubs: Array<{ dispose(): void }>
	// True when `spawnSession` already ran the first turn. `stream()` flips this back to false
	// after consuming the priming turn so subsequent turns go through the write queue.
	primed: boolean
	// Mutable holder so each `stream()` invocation can rebind the active emit callback to its own
	// buffer. Without this, the tail callback stays bound to whichever stream's closure first set
	// up the session.
	emitter: SessionEmitter
}

/**
 * In-process map of live sessions keyed by issueId (Fork B). The runner owns one map; sessions
 * live until killed (explicit, idle, or shutdown). Includes an in-flight lock so concurrent
 * `getOrCreate` for the same key never double-spawns.
 */
export class SessionMap {
	private sessions = new Map<string, LiveSession>()
	private inflight = new Map<string, Promise<LiveSession>>()

	get(key: string): LiveSession | undefined {
		return this.sessions.get(key)
	}

	delete(key: string): void {
		this.sessions.delete(key)
	}

	async getOrCreate(key: string, factory: () => Promise<LiveSession>): Promise<LiveSession> {
		const existing = this.sessions.get(key)
		if (existing) return existing
		const pending = this.inflight.get(key)
		if (pending) return pending
		// Clear `inflight` in BOTH branches (success and failure). Without the failure cleanup, a
		// rejected spawnSession promise sticks here forever and every subsequent getOrCreate
		// re-throws the same stale error instead of retrying the spawn.
		const p = (async () => {
			try {
				const created = await factory()
				this.sessions.set(key, created)
				return created
			} finally {
				this.inflight.delete(key)
			}
		})()
		this.inflight.set(key, p)
		return p
	}

	async evictIdle(idleTimeoutMs: number, onEvict: (s: LiveSession) => Promise<void>): Promise<void> {
		const now = Date.now()
		const dead: LiveSession[] = []
		for (const s of this.sessions.values()) {
			if (now - s.lastActivityAt > idleTimeoutMs) dead.push(s)
		}
		for (const s of dead) {
			this.sessions.delete(s.key)
			await onEvict(s)
		}
	}

	async shutdown(onKill: (s: LiveSession) => Promise<void>): Promise<void> {
		const all = [...this.sessions.values()]
		this.sessions.clear()
		this.inflight.clear()
		await Promise.all(all.map(onKill))
	}

	size(): number {
		return this.sessions.size
	}

	values(): IterableIterator<LiveSession> {
		return this.sessions.values()
	}
}
