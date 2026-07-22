import type { ZodType } from 'zod'
import { ProviderKind } from '@template/contracts-typescript/wire/enums'

/**
 * One line of terminal output produced by a provider CLI subprocess. `stream` distinguishes the
 * pipe it came from so the UI can tint stderr; `at` is an ISO-8601 timestamp. This is the
 * TRANSPORT unit of the two-stream split — it rides the SSE side-channel
 * (`browser.terminal_output_appended`), never the outbox.
 */
export interface TerminalLine {
	at: string
	line: string
	stream: 'stdout' | 'stderr'
}

/**
 * Everything a subprocess/PTY runner yields during one interactive session turn. The port is
 * deliberately narrow — an `output` per line and a single terminal `exit`. Higher layers
 * (`TerminalOutputAccumulator`) map this to transport frames + a domain outcome. This is the
 * CodeDM analog of whatscode's `AgentGenerationEvent` (AG-UI frame | ChatEvent |
 * AgentProcessFinishedEvent), collapsed to what a CLI subprocess actually produces.
 */
export type TerminalRuntimeEvent = { type: 'output'; line: TerminalLine } | { type: 'exit'; code: number; signal?: string }

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

/**
 * Streaming execution request — drives a full terminal session for one issue. The runner spawns the
 * provider CLI in `cwd` (the thread's workspace folder) with `prompt`, streams stdout/stderr as
 * `TerminalRuntimeEvent`s, and closes on process exit. `signal` tears the subprocess down on abort.
 */
export interface AgentStreamRequest {
	provider: ProviderKind
	/** One session per issue — the single-active invariant is keyed by this. */
	issueId: string
	/** Absolute path to the thread's workspace folder. */
	cwd: string
	prompt: string
	binaryPath?: string
	signal?: AbortSignal
}
