import { StopKind } from '@codm/contracts-typescript/wire/enums'
import { AgentRunOutcome } from '../../enums'
import type { AgentFrame, AgentRunResult, AgentRuntimeEvent } from '../../types'
import type { TerminalSseFrame } from '../AgentStreamRegistry'

/**
 * The domain OUTCOME of one agent turn — the "fact" side of the two-stream split, distilled from a
 * whole run. `COMPLETED` carries the agent's reply text; `STOPPED` carries the stop kind + detail.
 */
export type TerminalOutcome = { kind: 'COMPLETED'; replyText: string } | { kind: 'STOPPED'; stopKind: StopKind; detail: string }

export interface TerminalAccumulatorContext {
	issueId: string
}

/**
 * The bridge that realizes the two-stream split for one agent turn, over `AgentRuntimeEvent`.
 *
 *   - TRANSPORT — `feed(event)` maps a `frame` event to a `TerminalSseFrame` to be fanned straight to
 *     the SSE observer. Everything else returns `null`.
 *   - the DOMAIN outcome — `outcome()` reports what the run's ONE terminal event said.
 *
 * ### What SHRANK in Fase 3, and why the removal is the point
 * This class used to hold two independent completion paths: `turn_completed` folded the accumulated
 * reply chunks, while `exit === 0` folded raw stdout. The second existed ONLY to serve the one-shot
 * pipes runner, which is deleted — and with it this class's ability to disagree with itself about how
 * a run ended. There is now exactly ONE conclusion, and it is not inferred here at all: `run()` yields
 * exactly one `finished` event carrying an `AgentRunResult`, and `outcome()` translates that record
 * into the vocabulary the use case persists. An accumulator that re-derived the outcome from the
 * frames would be a second, quieter opinion about the same run.
 *
 * ### `fact` events are NOT consumed here, and that is deliberate
 * Observed facts (`AgentMessageEvent` / `AgentToolCallEvent` / `AgentUsageEvent`) are minted by the
 * runner's accumulator UNSTAMPED — no `ownerId`, no `entityId` — because `AgentRunRequest` carries no
 * identity by design (AC-1.11: identity rides inside the opaque MCP run token). Stamping and
 * persisting them belongs to the layer that holds the envelope, which is the base `Agent` of Fase 5.
 * Dropping them HERE, with that said out loud, is the honest state of this phase; folding them into
 * the transcript would invent identity the seam refuses to carry.
 *
 * Testable in isolation — zero subprocess/DI dependencies.
 */
export class TerminalOutputAccumulator {
	private result: AgentRunResult | undefined

	constructor(private readonly ctx: TerminalAccumulatorContext) {}

	feed(event: AgentRuntimeEvent): TerminalSseFrame | null {
		switch (event.type) {
			case 'frame':
				return this.transport(event.frame)
			case 'fact':
				// See the class docstring: unstamped, persisted by the envelope-holding layer (Fase 5).
				return null
			case 'finished':
				this.result = event.result
				return null
		}
	}

	/** Whether the run's one terminal event has been observed. */
	get exited(): boolean {
		return this.result !== undefined
	}

	/** The durable session identity the CLI reported, when it reported one. */
	get sessionId(): string | null {
		return this.result?.sessionId ?? null
	}

	outcome(): TerminalOutcome {
		if (!this.result) {
			// A drain that ended without the terminal event means the iteration was cut short — a
			// STOPPED run, never a silently COMPLETED one.
			return { kind: 'STOPPED', stopKind: StopKind.SERVER_ERROR, detail: 'agent run produced no terminal event' }
		}
		if (this.result.stop) {
			return { kind: 'STOPPED', stopKind: this.result.stop.kind, detail: this.result.stop.detail }
		}
		if (this.result.failed) {
			return { kind: 'STOPPED', stopKind: StopKind.SERVER_ERROR, detail: this.result.failure ?? 'agent run failed structural validation' }
		}
		if (this.result.outcome === AgentRunOutcome.STOPPED) {
			return { kind: 'STOPPED', stopKind: StopKind.SERVER_ERROR, detail: 'agent run stopped without a transport stop kind' }
		}
		return { kind: 'COMPLETED', replyText: this.result.replyText.trim() }
	}

	/**
	 * One transport frame → at most one SSE frame.
	 *
	 * ### Fase 7 — a `tool_use` stops being a LINE and becomes the structured action frame
	 * Both members of the `TerminalSseFrame` union are now produced. Until this phase
	 * `browser.terminal_action_detected` was keyed on the nine-member TUI action enum (the output of the
	 * deleted regex parser), so a tool call was flattened into a `⏺ Tool(args)` STRING on the output frame —
	 * the panel could print it but could not read it. Re-keyed onto the real `tool` name (§4.9), the
	 * frame carries the name the CLI actually reported plus a one-line summary of the input, and the
	 * panel can finally say *"Claude is editing `foo.ts`"* without parsing prose back out of a line it
	 * just rendered. The `⏺ ` glyph moves to the panel, where presentation belongs.
	 *
	 * `text_delta` is dropped on purpose: the decoder emits deltas AND, at block close, the
	 * consolidated `assistant_text`. Rendering both would print every token twice.
	 */
	private transport(frame: AgentFrame): TerminalSseFrame | null {
		const at = new Date().toISOString()
		const line = (text: string, stream: 'stdout' | 'stderr'): TerminalSseFrame => ({
			name: 'browser.terminal_output_appended',
			issueId: this.ctx.issueId,
			line: text,
			at,
			stream,
		})

		switch (frame.kind) {
			case 'system_init':
				return line(`· session ${frame.sessionId} · ${frame.model}`, 'stdout')
			case 'assistant_text':
				return frame.text.length > 0 ? line(frame.text, 'stdout') : null
			case 'tool_use':
				return { name: 'browser.terminal_action_detected', issueId: this.ctx.issueId, tool: frame.tool, input: summarize(frame.input), at }
			case 'tool_result':
				return line(`  ⎿ ${frame.ok ? frame.summary : `error: ${frame.summary}`}`, frame.ok ? 'stdout' : 'stderr')
			case 'error':
				return line(frame.detail, 'stderr')
			case 'text_delta':
			case 'thinking_delta':
			case 'result':
				return null
		}
	}
}

/** A tool's input as ONE short line — the panel wants "which file", not the whole argument object. */
function summarize(input: unknown): string {
	if (typeof input === 'string') return clamp(input)
	if (typeof input !== 'object' || input === null) return ''
	const entries = Object.entries(input as Record<string, unknown>)
		.filter(([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
		.map(([key, value]) => `${key}: ${String(value)}`)
	return clamp(entries.join(', '))
}

function clamp(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim()
	return flat.length > 120 ? `${flat.slice(0, 117)}…` : flat
}
