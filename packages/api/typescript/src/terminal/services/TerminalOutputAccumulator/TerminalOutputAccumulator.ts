import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import type { TerminalRuntimeEvent } from '../TerminalLLMRunner'
import type { TerminalSseFrame } from '../AgentStreamRegistry'

/**
 * The domain OUTCOME of one terminal session turn — the "fact" side of the two-stream split,
 * distilled from a whole run. `COMPLETED` carries the agent's reply text; `STOPPED` carries the
 * stop kind + detail.
 */
export type TerminalOutcome = { kind: 'COMPLETED'; replyText: string } | { kind: 'STOPPED'; stopKind: StopKind; detail: string }

export interface TerminalAccumulatorContext {
	issueId: string
}

/**
 * The bridge that realizes the two-stream split for a terminal session, adapted to the WIDE seam
 * (Fork A1). It consumes the rich `TerminalRuntimeEvent` union a runner yields and produces:
 *
 *   - TRANSPORT frames — `feed(event)` returns a `TerminalSseFrame` for every `output` and
 *     `action` event (action frames per the wave-0 amendment: SSE-only), to be fanned straight to
 *     the SSE observer via `AgentStreamRegistry.send`. All other variants return `null`.
 *   - the DOMAIN outcome — `outcome()` folds what the run produced into a `TerminalOutcome`:
 *       stop            → STOPPED with the runner-provided kind (e.g. AUTH_REQUIRED),
 *       killed          → STOPPED(SERVER_ERROR, "terminal session killed: <reason>"),
 *       turn_completed  → COMPLETED with the accumulated `reply` chunks (the claude engine path),
 *       exit 0          → COMPLETED with the collected stdout (one-shot/stub path),
 *       exit != 0       → STOPPED(SERVER_ERROR) with the stderr detail.
 *
 * Testable in isolation — zero subprocess/DI dependencies.
 */
export class TerminalOutputAccumulator {
	private readonly stdout: string[] = []
	private readonly stderr: string[] = []
	private readonly replyParts: string[] = []
	private exitCode: number | undefined
	private turnCompleted = false
	private stop: { kind: StopKind; detail: string } | undefined
	private killedReason: string | undefined

	constructor(private readonly ctx: TerminalAccumulatorContext) {}

	feed(event: TerminalRuntimeEvent): TerminalSseFrame | null {
		switch (event.type) {
			case 'output': {
				;(event.line.stream === 'stderr' ? this.stderr : this.stdout).push(event.line.line)
				return {
					name: 'browser.terminal_output_appended',
					issueId: this.ctx.issueId,
					line: event.line.line,
					at: event.line.at,
					stream: event.line.stream,
				}
			}
			case 'action':
				return {
					name: 'browser.terminal_action_detected',
					issueId: this.ctx.issueId,
					action: event.action,
					value: event.value,
					at: event.at,
				}
			case 'reply':
				this.replyParts.push(event.text)
				return null
			case 'turn_completed':
				this.turnCompleted = true
				return null
			case 'stop':
				this.stop = { kind: event.kind, detail: event.detail }
				return null
			case 'killed':
				this.killedReason = event.reason
				return null
			case 'exit':
				this.exitCode = event.code
				return null
			case 'session':
				// Lifecycle facts are persisted by the use case, not transported.
				return null
		}
	}

	get exited(): boolean {
		return this.exitCode !== undefined || this.turnCompleted || this.stop !== undefined || this.killedReason !== undefined
	}

	outcome(): TerminalOutcome {
		if (this.stop) {
			return { kind: 'STOPPED', stopKind: this.stop.kind, detail: this.stop.detail }
		}
		if (this.killedReason) {
			return { kind: 'STOPPED', stopKind: StopKind.SERVER_ERROR, detail: `terminal session killed: ${this.killedReason}` }
		}
		if (this.turnCompleted) {
			return { kind: 'COMPLETED', replyText: this.replyParts.join('\n').trim() }
		}
		if (this.exitCode === 0) {
			return { kind: 'COMPLETED', replyText: this.stdout.join('\n').trim() }
		}
		const detail = this.stderr.join('\n').trim() || `terminal session exited with code ${this.exitCode ?? 'unknown'}`
		return { kind: 'STOPPED', stopKind: StopKind.SERVER_ERROR, detail }
	}
}
