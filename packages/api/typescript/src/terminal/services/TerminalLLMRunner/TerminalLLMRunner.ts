import type { z, ZodType } from 'zod'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import type { AgentGenerateRequest, TerminalRuntimeEvent } from './types'

/**
 * Per-turn conversation history snapshot, prepended to the bracketed-paste payload as a plain-text
 * preamble (NO XML tags — claude's TUI file-ref scanner pops a chooser on angle-bracketed tokens).
 */
export interface ChatMessage {
	actor: 'USER' | 'AGENT'
	content: string
	occurredAt: Date
}

/**
 * Per-call input for `stream()`. Fork B: the session identity is `issueId` — one live REPL per
 * issue; `threadId`/`ownerId` ride along so the yielded events can be persisted as domain facts.
 */
export interface TerminalLLMRunnerStreamRequest {
	issueId: string
	threadId: string
	ownerId: string
	provider: ProviderKind
	/** Absolute path to the thread's workspace folder. */
	cwd: string
	prompt: string
	systemPrompt?: string
	context?: ChatMessage[]
	/** Resolved binary path from `ProviderDetector`; the runner re-resolves when absent. */
	binaryPath?: string
}

/** Lightweight projection of a live session, safe to expose to UI BFF queries. */
export interface TerminalLLMSessionSnapshot {
	issueId: string
	terminalSessionId: string | null
	cwd: string
	lastActivityAt: number
	idle: boolean
}

/**
 * Thrown by `stream(...)` when the per-session write queue is full.
 * Callers decide how to react (drop, merge, raise a stop, etc.).
 */
export class TerminalLLMRunnerBusyError extends Error {
	override readonly name = 'TerminalLLMRunnerBusyError'
	constructor(issueId: string) {
		super(`Terminal session ${issueId} write queue is full`)
	}
}

/**
 * The sole runtime abstraction of the terminal engine — the WIDE seam (Fork A1, ratified): the
 * whatscode `TerminalLLMRunner` session engine adopted whole, rekeyed `(channelId, remoteId)` →
 * `issueId` (Fork B), plus the `generate()` half codedm already used for `IssueClassifier`.
 *
 * Concrete implementations (bound per DI env in `terminal/registry.ts`):
 *   - `ClaudeCliTerminalLLMRunner` — real engine. Spawns `claude` in a Bun.Terminal PTY (Fork D2),
 *     tails the JSONL transcript, parses the TUI, queues turns, idle-evicts. Non-claude providers
 *     fall back to a one-shot pipes run. Registered in `real`.
 *   - `StubTerminalLLMRunner` — canned frames, never spawning. `mock` + `integration`.
 *   - `E2eStubTerminalLLMRunner` — deterministic e2e stand-in (`real` under CODEDM_E2E).
 *   - `MockTerminalLLMRunner` — scripted event sequences for engine-focused suites.
 */
export abstract class TerminalLLMRunner {
	abstract generate<OutputSchema extends ZodType>(request: AgentGenerateRequest<OutputSchema>): Promise<z.output<OutputSchema>>

	abstract stream(request: TerminalLLMRunnerStreamRequest): AsyncIterable<TerminalRuntimeEvent>

	abstract getSession(issueId: string): Promise<TerminalLLMSessionSnapshot | null>

	abstract killSession(issueId: string): Promise<void>

	/**
	 * Spawn + boot + register the session in the runner's internal map WITHOUT running a priming
	 * turn and WITHOUT yielding a `session` lifecycle event. The next `stream()` call for the same
	 * issue finds an already-booted REPL and goes straight to the regular queue/runTurn path — no
	 * cold-start cost on the user-visible request.
	 *
	 * Resolves when the session is registered (boot complete). Rejects if boot fails (binary
	 * missing, cwd missing, daemon wedged past retry). No-op if a session already exists.
	 * Stub/mock runners implement this as a no-op.
	 */
	abstract prewarm(opts: { issueId: string; cwd: string; systemPrompt?: string; binaryPath?: string }): Promise<void>
}
