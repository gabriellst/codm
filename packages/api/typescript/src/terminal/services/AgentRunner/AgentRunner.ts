import type { z, ZodType } from 'zod'
import type { AgentGenerateRequest, AgentStreamRequest, TerminalRuntimeEvent } from './types'

/**
 * The sole runtime abstraction of the terminal engine — the CodeDM descendant of whatscode's
 * `LlmRunner`. Renamed because the concrete implementation drives a provider CLI SUBPROCESS
 * (claude-code / codex / opencode), not an LLM tool-loop: `stream()` runs an interactive terminal
 * session and yields raw output; `generate()` runs the CLI in one-shot structured mode.
 *
 * Two symmetrical halves, exactly as the whatscode seam:
 *   - `generate()` — a single structured call returning an object validated against `outputSchema`.
 *     `IssueClassifier` delegates to this for LLM structured-generate; nothing else uses it.
 *   - `stream()`   — a full terminal-session turn, yielding `TerminalRuntimeEvent`s (one per output
 *     line, then a terminal `exit`). `RunTerminalSession` consumes it, fanning transport frames to
 *     the SSE observer and mapping the exit to a domain outcome.
 *
 * Concrete implementations (bound per DI env in `terminal/registry.ts`):
 *   - `CliAgentRunner`  — real subprocess driver (`Bun.spawn`). Registered in `real`.
 *   - `StubAgentRunner` — deterministic fake yielding canned frames, never spawning. Registered in
 *     `mock` and `integration` so tests never touch a provider binary.
 */
export abstract class AgentRunner {
	abstract generate<OutputSchema extends ZodType>(request: AgentGenerateRequest<OutputSchema>): Promise<z.output<OutputSchema>>

	abstract stream(request: AgentStreamRequest): AsyncIterable<TerminalRuntimeEvent>
}
