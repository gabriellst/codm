import { describe, expect, it } from 'bun:test'
import { AgentStopReason, StopKind } from '@codedm/contracts-typescript/wire/enums'
import { TerminalOutputAccumulator } from './TerminalOutputAccumulator'
import { AgentMessageRole, TerminalRunOutcome, type TransportStopKind } from '../../enums'
import { AgentMessageEvent } from '../../events'
import type { AgentFrame, AgentRunResult, AgentRuntimeEvent } from '../../types'

const frame = (f: AgentFrame): AgentRuntimeEvent => ({ type: 'frame', frame: f })
const finished = (result: Partial<AgentRunResult> = {}): AgentRuntimeEvent => ({
	type: 'finished',
	result: { outcome: TerminalRunOutcome.COMPLETED, replyText: '', sessionId: null, failed: false, ...result },
})
const text = (value: string): AgentRuntimeEvent => frame({ kind: 'assistant_text', messageId: 'msg-1', text: value, parentToolUseId: null })

describe('TerminalOutputAccumulator (two-stream split over AgentRuntimeEvent)', () => {
	it('returns a transport frame for an assistant_text frame, tagged with the issueId', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		const sse = acc.feed(text('compiling…'))
		expect(sse).toMatchObject({ name: 'browser.terminal_output_appended', issueId: 'issue-1', line: 'compiling…', stream: 'stdout' })
	})

	it('renders a tool call as an output line — the action frame is Fase 7, not a silent drop', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		const sse = acc.feed(
			frame({ kind: 'tool_use', toolUseId: 'toolu_1', tool: 'Edit', input: { file_path: 'src/a.ts' }, parentToolUseId: null }),
		)
		expect(sse).toMatchObject({ name: 'browser.terminal_output_appended', line: '⏺ Edit(file_path: src/a.ts)' })
	})

	it('routes a FAILED tool result to the stderr stream so the panel can tint it', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		const sse = acc.feed(frame({ kind: 'tool_result', toolUseId: 'toolu_1', ok: false, summary: 'ENOENT', parentToolUseId: null }))
		expect(sse).toMatchObject({ stream: 'stderr', line: '  ⎿ error: ENOENT' })
	})

	it('transports nothing for deltas — the decoder also emits the consolidated block, and both would double-print', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		expect(acc.feed(frame({ kind: 'text_delta', messageId: 'msg-1', delta: 'com' }))).toBeNull()
		expect(acc.feed(frame({ kind: 'thinking_delta', delta: 'hmm' }))).toBeNull()
	})

	it('transports nothing for an observed FACT — it is outbox vocabulary, never SSE', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		const fact = new AgentMessageEvent({ payload: { messageId: 'msg-1', role: AgentMessageRole.ASSISTANT, text: 'hi' } })
		expect(acc.feed({ type: 'fact', fact })).toBeNull()
	})

	it('marks the run exited on the terminal event and exposes the reported session id', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		expect(acc.exited).toBe(false)
		expect(acc.feed(finished({ sessionId: 'sess-9' }))).toBeNull()
		expect(acc.exited).toBe(true)
		expect(acc.sessionId).toBe('sess-9')
	})

	it('folds a clean run into COMPLETED carrying the terminal replyText — ONE conclusion, not a re-derivation', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		acc.feed(text('Fixed the coupon focus bug.'))
		acc.feed(frame({ kind: 'result', stopReason: AgentStopReason.END_TURN, usage: usage() }))
		acc.feed(finished({ replyText: '  Fixed the coupon focus bug.\nOpened PR #214.  ' }))

		expect(acc.outcome()).toEqual({ kind: 'COMPLETED', replyText: 'Fixed the coupon focus bug.\nOpened PR #214.' })
	})

	it('folds a TRANSPORT stop into STOPPED with the kind and detail the runner classified', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		acc.feed(
			finished({
				outcome: TerminalRunOutcome.STOPPED,
				stop: { kind: StopKind.AUTH_REQUIRED as TransportStopKind, detail: 'provider CLI is asking for interactive login' },
			}),
		)

		expect(acc.outcome()).toEqual({
			kind: 'STOPPED',
			stopKind: StopKind.AUTH_REQUIRED,
			detail: 'provider CLI is asking for interactive login',
		})
	})

	it('folds a FAILED structured validation into STOPPED(SERVER_ERROR) — a failure is never a completion', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		acc.feed(finished({ failed: true, failure: 'terminal reply text was not JSON' }))

		expect(acc.outcome()).toEqual({ kind: 'STOPPED', stopKind: StopKind.SERVER_ERROR, detail: 'terminal reply text was not JSON' })
	})

	it('a drain that never saw the terminal event is STOPPED, never a silent COMPLETED', () => {
		const acc = new TerminalOutputAccumulator({ issueId: 'issue-1' })
		acc.feed(text('half a run'))

		expect(acc.outcome()).toEqual({ kind: 'STOPPED', stopKind: StopKind.SERVER_ERROR, detail: 'agent run produced no terminal event' })
	})
})

function usage() {
	return { inputTokens: 1, outputTokens: 2, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 }
}
