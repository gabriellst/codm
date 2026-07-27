/**
 * The PURE fold: `AgentFrame` → `AgentTurnFact | null` (GOAL-agent-abstraction §4.3 rule 2).
 *
 * Covers AC-2.2 (sub-agent scoping, orphan `tool_use` → FAILED on `flush()`), AC-2.4 (the
 * anti-double-publish guard) and AC-2.7 (exactly ONE `AgentUsageEvent`, from the terminal aggregate,
 * carrying all four buckets).
 *
 * Nothing here starts a process, reads a file or reads a clock — the clock is injected. That is the
 * whole point of the accumulator being separate from the runner: these rules are DOMAIN judgements,
 * so they are assertable without a CLI.
 */
import { describe, it, expect } from 'bun:test'
import { AgentStopReason } from '@codedm/contracts-typescript/wire/enums'
import { AgentMessageRole, AgentToolCallStatus } from '../../enums'
import { AgentMessageEvent, AgentToolCallEvent, AgentUsageEvent, type AgentTurnFact } from '../../events'
import type { AgentFrame, AgentTurnUsage } from '../../types'
import { StreamJsonToTurnFactAccumulator } from './StreamJsonToTurnFactAccumulator'

const OWNER = 'tenant'
const ENTITY = 'issue-1'

/** A pinned clock — no `Date.now()` reaches this suite, so timestamps are assertable. */
function makeAccumulator(): StreamJsonToTurnFactAccumulator {
	let tick = 0
	return new StreamJsonToTurnFactAccumulator({
		entityId: ENTITY,
		ownerId: OWNER,
		now: () => new Date(Date.UTC(2026, 6, 27, 0, 0, tick++)),
	})
}

/** The four buckets measured in `phase2-smoke/raw/s1-text.jsonl`. */
const MEASURED_USAGE: AgentTurnUsage = { inputTokens: 2, outputTokens: 10, cacheCreationInputTokens: 9188, cacheReadInputTokens: 15273 }

function fold(accumulator: StreamJsonToTurnFactAccumulator, frames: AgentFrame[]): AgentTurnFact[] {
	const facts: AgentTurnFact[] = []
	for (const frame of frames) {
		const fact = accumulator.apply(frame)
		if (fact) facts.push(fact)
	}
	return facts
}

const textFrame = (messageId: string, text: string, parentToolUseId: string | null = null): AgentFrame => ({ kind: 'assistant_text', messageId, text, parentToolUseId })
const toolUse = (toolUseId: string, tool: string, parentToolUseId: string | null = null): AgentFrame => ({ kind: 'tool_use', toolUseId, tool, input: { a: 1 }, parentToolUseId })
const toolResult = (toolUseId: string, ok: boolean, parentToolUseId: string | null = null): AgentFrame => ({ kind: 'tool_result', toolUseId, ok, summary: ok ? 'done' : 'ENOENT', parentToolUseId })
const resultFrame = (usage: AgentTurnUsage = MEASURED_USAGE): AgentFrame => ({ kind: 'result', stopReason: AgentStopReason.END_TURN, usage })

describe('StreamJsonToTurnFactAccumulator — transcript and tool lifecycle', () => {
	it('mints a transcript event per assistant text block and nothing for transport-only frames', () => {
		const accumulator = makeAccumulator()

		const facts = fold(accumulator, [
			{ kind: 'system_init', sessionId: 's1', model: 'claude-opus-5' },
			{ kind: 'text_delta', messageId: 'msg_1', delta: 'SMOKE' },
			{ kind: 'thinking_delta', delta: 'weighing it up' },
			textFrame('msg_1', 'SMOKE-OK'),
		])

		expect(facts).toHaveLength(1)
		expect(facts[0]).toBeInstanceOf(AgentMessageEvent)
		expect(facts[0]?.payload).toEqual({ messageId: 'msg_1', role: AgentMessageRole.ASSISTANT, text: 'SMOKE-OK' })
	})

	it('emits ONE tool-call event, at the END of the lifecycle, carrying start and finish', () => {
		const accumulator = makeAccumulator()

		const opened = accumulator.apply(toolUse('toolu_1', 'Read'))
		expect(opened).toBeNull() // nothing is emitted while the call is in flight

		const closed = accumulator.apply(toolResult('toolu_1', true))

		expect(closed).toBeInstanceOf(AgentToolCallEvent)
		expect(closed?.payload).toMatchObject({
			toolUseId: 'toolu_1',
			tool: 'Read',
			input: { a: 1 },
			status: AgentToolCallStatus.COMPLETED,
			startedAt: '2026-07-27T00:00:00.000Z',
			finishedAt: '2026-07-27T00:00:01.000Z',
		})
	})

	it('marks a failed tool_result FAILED and carries the summary as the error message', () => {
		const accumulator = makeAccumulator()
		accumulator.apply(toolUse('toolu_1', 'Read'))

		const closed = accumulator.apply(toolResult('toolu_1', false))

		expect(closed?.payload).toMatchObject({ status: AgentToolCallStatus.FAILED, errorMessage: 'ENOENT' })
	})

	it('materializes an ORPHAN tool_use as a FAILED tool call on flush() (AC-2.2)', () => {
		const accumulator = makeAccumulator()
		accumulator.apply(toolUse('toolu_open', 'Bash'))
		accumulator.apply(toolUse('toolu_closed', 'Read'))
		accumulator.apply(toolResult('toolu_closed', true))

		const flushed = accumulator.flush()

		// Only the one that never got its result. A silently vanishing tool call is the failure mode
		// the terminal-only `AgentToolCallStatus` exists to make impossible.
		expect(flushed).toHaveLength(1)
		expect(flushed[0]).toBeInstanceOf(AgentToolCallEvent)
		expect(flushed[0]?.payload).toMatchObject({ toolUseId: 'toolu_open', tool: 'Bash', status: AgentToolCallStatus.FAILED })
		expect(flushed[0]?.payload.errorMessage).toContain('never reported a result')

		// Idempotent: the in-flight map is drained, so a second flush cannot double-publish.
		expect(accumulator.flush()).toEqual([])
	})

	it('ignores a tool_result for a tool_use it never saw', () => {
		const accumulator = makeAccumulator()
		expect(accumulator.apply(toolResult('toolu_unknown', true))).toBeNull()
	})
})

describe('StreamJsonToTurnFactAccumulator — sub-agent SCOPE, keyed by parent_tool_use_id (AC-2.2)', () => {
	// Measured id from `phase2-smoke/raw/s3-subagent.jsonl`, on three consecutive frames.
	const SUB = 'toolu_01WpAVhnCvdR8Ywmh4rK4jed'

	it('does not let a sub-agent transcript contaminate the main transcript', () => {
		const accumulator = makeAccumulator()

		const facts = fold(accumulator, [
			textFrame('msg_sub', 'inner chatter', SUB),
			textFrame('msg_main', 'the answer', null),
		])

		expect(facts).toHaveLength(1)
		expect(facts[0]?.payload).toMatchObject({ messageId: 'msg_main', text: 'the answer' })
	})

	it('does not report a sub-agent tool call as the main agent’s — not even as an orphan', () => {
		const accumulator = makeAccumulator()

		const facts = fold(accumulator, [
			toolUse('toolu_inner', 'Read', SUB),
			toolResult('toolu_inner', true, SUB),
			// The PARENT's own call that dispatched the sub-agent. Scoped to null, so it DOES mint —
			// which is why nothing is lost by dropping the inner pair.
			toolUse('toolu_parent', 'Agent', null),
			toolResult('toolu_parent', true, null),
		])

		expect(facts).toHaveLength(1)
		expect(facts[0]?.payload).toMatchObject({ toolUseId: 'toolu_parent', tool: 'Agent' })
		// The inner call was never tracked, so flush() cannot resurrect it as a phantom failure.
		expect(accumulator.flush()).toEqual([])
	})

	it('keys scope on parent_tool_use_id ALONE — never on the tool name', () => {
		const accumulator = makeAccumulator()
		// `system/init.tools` announces `Task` while the emitted block is named `Agent` (divergence D5):
		// the two DISAGREE in this build, so nothing may switch on either literal. Here the dispatching
		// tool is called `Task`, and scoping must be unaffected.
		const facts = fold(accumulator, [toolUse('toolu_p', 'Task', null), toolResult('toolu_p', true, null), textFrame('m', 'inner', 'toolu_p')])

		expect(facts).toHaveLength(1)
		expect(facts[0]).toBeInstanceOf(AgentToolCallEvent)
	})
})

describe('StreamJsonToTurnFactAccumulator — ANTI-DOUBLE-PUBLISH (AC-2.4, §4.3 rule 3)', () => {
	it('mints NO fact for a codedm__ tool call — the use case that served it already persisted one', () => {
		const accumulator = makeAccumulator()

		const facts = fold(accumulator, [
			toolUse('toolu_declared', 'codedm__complete_issue'),
			toolResult('toolu_declared', true),
			toolUse('toolu_declared_2', 'codedm__raise_stop'),
			toolResult('toolu_declared_2', true),
		])

		// Without this guard ONE `complete_issue` publishes `integration.issue.completed` TWICE.
		expect(facts).toEqual([])
	})

	it('does not resurrect an UNFINISHED codedm__ call as an orphan failure on flush()', () => {
		const accumulator = makeAccumulator()
		accumulator.apply(toolUse('toolu_declared', 'codedm__record_artifact'))

		// The guard is at INGESTION — the call is never tracked — so the flush path is closed too.
		expect(accumulator.flush()).toEqual([])
	})

	it('still mints facts for ordinary tools in the same turn as a codedm__ call', () => {
		const accumulator = makeAccumulator()

		const facts = fold(accumulator, [
			toolUse('toolu_read', 'Read'),
			toolResult('toolu_read', true),
			toolUse('toolu_declared', 'codedm__complete_issue'),
			toolResult('toolu_declared', true),
		])

		// The guard is scoped to OUR prefix, not "any tool call in a turn that used our tools".
		expect(facts).toHaveLength(1)
		expect(facts[0]?.payload).toMatchObject({ toolUseId: 'toolu_read', tool: 'Read' })
	})
})

describe('StreamJsonToTurnFactAccumulator — usage is minted ONCE and is not lossy (AC-2.7, §4.3 rule 8)', () => {
	it('emits exactly ONE AgentUsageEvent, from the terminal aggregate, over a multi-assistant turn', () => {
		const accumulator = makeAccumulator()

		// Several assistant messages, each of which carried its OWN `message.usage` on the wire. The
		// decoder does not surface those at all — there is no `usage` frame (D4) — so the only usage
		// the accumulator can see is the run-level aggregate on the terminal frame.
		const facts = fold(accumulator, [
			textFrame('msg_1', 'first'),
			textFrame('msg_2', 'second'),
			textFrame('msg_3', 'third'),
			resultFrame(MEASURED_USAGE),
		])

		const usageFacts = facts.filter(f => f instanceof AgentUsageEvent)
		expect(usageFacts).toHaveLength(1)
	})

	it('carries all FOUR measured buckets through to the event — the assertion D4 would have failed', () => {
		const accumulator = makeAccumulator()

		const usage = fold(accumulator, [resultFrame(MEASURED_USAGE)]).find(f => f instanceof AgentUsageEvent)

		// The Fase-1 event had only {inputTokens, outputTokens}. Against that contract this assertion
		// fails, which is exactly why it is written this way: it proves the D4 repair landed end to
		// end, in the fold, and not merely in the schema.
		expect(usage?.payload).toEqual({ inputTokens: 2, outputTokens: 10, cacheCreationInputTokens: 9188, cacheReadInputTokens: 15273 })

		// The correctness stake, stated as arithmetic: persisting `inputTokens` alone would record 2
		// for the 24463 input tokens actually consumed — a cost quota wrong by ~4 orders of magnitude.
		const p = usage?.payload as { inputTokens: number; cacheCreationInputTokens: number; cacheReadInputTokens: number }
		expect(p.inputTokens + p.cacheCreationInputTokens + p.cacheReadInputTokens).toBe(24463)
	})

	it('does not mint a SECOND usage event if a second result frame ever arrives', () => {
		const accumulator = makeAccumulator()

		const facts = fold(accumulator, [resultFrame(MEASURED_USAGE), resultFrame(MEASURED_USAGE)])

		// The corpus never shows two — `type === 'result'` is one-per-run by construction (D1). The
		// guard is defensive: double-counting tokens must not be reachable by a wire surprise.
		expect(facts.filter(f => f instanceof AgentUsageEvent)).toHaveLength(1)
	})

	it('records zeroes for a provider that does not cache, rather than treating them as unknown', () => {
		const accumulator = makeAccumulator()

		const usage = fold(accumulator, [resultFrame({ inputTokens: 500, outputTokens: 42, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 })]).find(
			f => f instanceof AgentUsageEvent,
		)

		// Arithmetically CORRECT, not missing: with no cache all input lands in `inputTokens` and the
		// sum still holds. This is why the four fields are required rather than optional.
		expect(usage?.payload).toEqual({ inputTokens: 500, outputTokens: 42, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 })
	})

	it('mints outbox-bound domain events, not POJOs', () => {
		const accumulator = makeAccumulator()
		accumulator.apply(toolUse('toolu_1', 'Read'))

		const facts = [accumulator.apply(textFrame('m', 'hi')), accumulator.apply(toolResult('toolu_1', true)), accumulator.apply(resultFrame())]

		// Every member of the union is a BaseDomainEvent subclass — a POJO would reach the mediator
		// with no class to be rehydrated into.
		expect(facts[0]).toBeInstanceOf(AgentMessageEvent)
		expect(facts[1]).toBeInstanceOf(AgentToolCallEvent)
		expect(facts[2]).toBeInstanceOf(AgentUsageEvent)
		for (const fact of facts) expect(fact?.ownerId).toBe(OWNER)
	})
})
