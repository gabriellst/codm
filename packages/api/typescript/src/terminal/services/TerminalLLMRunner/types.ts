import type { ZodType } from 'zod'
import type { StopKind } from '@codedm/contracts-typescript/wire/enums'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import type { TuiActionType, TurnEndSignal } from '../../enums'

/**
 * One line of terminal output produced by a provider CLI session. `stream` distinguishes the pipe
 * it came from so the UI can tint stderr; `at` is an ISO-8601 timestamp. This is the TRANSPORT
 * unit of the two-stream split — it rides the SSE side-channel
 * (`browser.terminal_output_appended`), never the outbox.
 */
export interface TerminalLine {
	at: string
	line: string
	stream: 'stdout' | 'stderr'
}

/** Why a live session's PTY died. */
import type { TerminalSessionKillReason } from '../../enums'

/** Engine-side literal union — DERIVED from the named enum (one vocabulary, zero drift). */
export type SessionKillReason = `${TerminalSessionKillReason}`

/**
 * Everything a runner yields during one interactive session turn — the WIDE seam (Fork A1,
 * ratified): the full whatscode engine shape (its 9-variant `AgentGenerationEvent` union) mapped
 * onto the wave-0 amendment set:
 *
 *   - `output`         — a raw PTY/pipe line → SSE `browser.terminal_output_appended` (AgUiFrame analog).
 *   - `action`         — a claude TUI action line (`⏺ Bash(...)`) → SSE `browser.terminal_action_detected`
 *                        ONLY (amendment: SSE frame, NO wire event).
 *   - `reply`          — one assistant text record from the JSONL transcript (AgentReplyChunk analog);
 *                        the accumulator folds these into the final `terminal.agent.reply_drafted` fact.
 *   - `session`        — PTY lifecycle: spawned (cold) or resumed (warm reuse of the live REPL) →
 *                        domain `terminal.session.{started,resumed}` facts.
 *   - `turn_completed` — the turn finished (AgentProcessFinished analog) → `terminal.session.completed`.
 *   - `killed`         — the PTY died mid-stream (crash/explicit/idle/shutdown) → domain
 *                        `terminal.session.killed` + a STOPPED outcome.
 *   - `stop`           — an explicit stop with a `StopKind` (e.g. AUTH_REQUIRED when claude wants
 *                        re-login — amendment) → `terminal.stop.raised`.
 *   - `exit`           — subprocess exit for ONE-SHOT (non-interactive) runs: the pipes fallback for
 *                        non-claude providers and the stub runners. 0 → COMPLETED, else STOPPED.
 */
export type TerminalRuntimeEvent =
	| { type: 'output'; line: TerminalLine }
	| { type: 'action'; action: TuiActionType; value: string; at: string }
	| { type: 'reply'; text: string }
	| { type: 'session'; lifecycle: 'spawned' | 'resumed'; terminalSessionId: string; cwd: string }
	| { type: 'turn_completed'; signal: TurnEndSignal }
	| { type: 'killed'; reason: SessionKillReason; terminalSessionId: string | null }
	| { type: 'stop'; kind: StopKind; detail: string }
	| { type: 'exit'; code: number; signal?: string }

/**
 * Structured, one-shot execution request. The runner invokes the provider CLI in non-interactive
 * "print" mode (e.g. `claude -p <prompt> --output-format json`), parses the JSON, and validates it
 * against `outputSchema`. No streaming, no terminal session — the pure `generate()` half of the
 * seam, used by `IssueClassifier` for LLM structured-generate.
 */
export interface AgentGenerateRequest<OutputSchema extends ZodType> {
	provider: ProviderKind
	systemPrompt?: string
	prompt: string
	outputSchema: OutputSchema
	/** Working directory for the CLI (defaults to the process cwd when omitted). */
	cwd?: string
	/** Resolved binary path from `ProviderDetector`; the runner re-resolves when absent. */
	binaryPath?: string
}
