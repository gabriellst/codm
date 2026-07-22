import { StopKind } from '@codedm/contracts-typescript/wire/enums'
import type { TerminalRuntimeEvent } from '../AgentRunner'
import type { TerminalOutputFrame } from '../TerminalSessionRegistry'

/**
 * The domain OUTCOME of one terminal session — the "fact" side of the two-stream split, distilled
 * from a whole run. `COMPLETED` carries the agent's reply text (the collected stdout); `STOPPED`
 * carries the stop kind + detail (a non-zero exit maps to `SERVER_ERROR`, the runtime failure mode).
 */
export type TerminalOutcome = { kind: 'COMPLETED'; replyText: string } | { kind: 'STOPPED'; stopKind: StopKind; detail: string }

export interface TerminalAccumulatorContext {
	issueId: string
}

/**
 * The CodeDM analog of whatscode's `AgUiToChatEventAccumulator` — the bridge that realizes the
 * two-stream split for a terminal session. It consumes the raw `TerminalRuntimeEvent`s a runner
 * yields and produces:
 *
 *   - TRANSPORT frames — `feed(event)` returns a `TerminalOutputFrame` for every `output` event, to
 *     be fanned straight to the SSE observer via `TerminalSessionRegistry.send`. Returns `null` for
 *     the terminal `exit` event (nothing to transport).
 *   - the DOMAIN outcome — `outcome()` folds the accumulated stdout/stderr + exit code into a
 *     `TerminalOutcome` the use case turns into outbox facts (AgentReplyDrafted + IssueCompleted, or
 *     IssueStopRaised).
 *
 * Testable in isolation — zero subprocess/DI dependencies.
 */
export class TerminalOutputAccumulator {
	private readonly stdout: string[] = []
	private readonly stderr: string[] = []
	private exitCode: number | undefined

	constructor(private readonly ctx: TerminalAccumulatorContext) {}

	feed(event: TerminalRuntimeEvent): TerminalOutputFrame | null {
		if (event.type === 'output') {
			;(event.line.stream === 'stderr' ? this.stderr : this.stdout).push(event.line.line)
			return { issueId: this.ctx.issueId, line: event.line.line, at: event.line.at, stream: event.line.stream }
		}
		this.exitCode = event.code
		return null
	}

	get exited(): boolean {
		return this.exitCode !== undefined
	}

	outcome(): TerminalOutcome {
		if (this.exitCode === 0) {
			return { kind: 'COMPLETED', replyText: this.stdout.join('\n').trim() }
		}
		const detail = this.stderr.join('\n').trim() || `terminal session exited with code ${this.exitCode ?? 'unknown'}`
		return { kind: 'STOPPED', stopKind: StopKind.SERVER_ERROR, detail }
	}
}
