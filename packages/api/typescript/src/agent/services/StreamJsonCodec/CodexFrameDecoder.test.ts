import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AgentStopReason } from '@codm/contracts-typescript/wire/enums'
import type { AgentFrame } from '../../types/AgentFrame'
import { CodexFrameDecoder } from './CodexFrameDecoder'
import { StreamJsonCodec } from './StreamJsonCodec'
import type { TerminalResultRecord } from './FrameDecoder'

/**
 * The codex decoder, driven by the CAPTURES rather than by hand-written lines.
 *
 * `.specs/codedm/codex-smoke/raw/*.jsonl` is what codex-cli 0.150.0 actually wrote to stdout, byte
 * for byte, and it is committed. Replaying it is what makes these assertions falsifiable by a real
 * CLI upgrade instead of by my memory of one: a fixture I type here can only ever agree with what I
 * believed while typing it.
 *
 * Two shapes are deliberately NOT replayed, because no capture contains them — `turn.failed` and the
 * top-level `error`. They are exercised from literals below, under a name that says so.
 */

/**
 * The captures directory, found by WALKING UP to the repo root rather than by counting `..`.
 *
 * A literal `'..','..','..'` chain encodes this file's depth into an assertion about codex, and it
 * breaks silently the day the file moves — `readFileSync` then throws ENOENT from a path nobody
 * reads. Walking up to a marker asks the question that is actually meant: "where is the repo root".
 */
function repoRoot(): string {
	let dir = import.meta.dir
	while (!existsSync(join(dir, '.specs'))) {
		const parent = dirname(dir)
		if (parent === dir) throw new Error('repo root (the directory holding .specs/) not found above this file')
		dir = parent
	}
	return dir
}

const RAW = join(repoRoot(), '.specs', 'codedm', 'codex-smoke', 'raw')

/** Feed a whole capture through the real codec, one chunk, the way the runner would. */
function replay(capture: string): { frames: AgentFrame[]; terminals: TerminalResultRecord[]; warnings: string[] } {
	const warnings: string[] = []
	const codec = new StreamJsonCodec({ onWarn: m => warnings.push(m), decoder: new CodexFrameDecoder(m => warnings.push(m)) })
	const decoded = [...codec.push(readFileSync(join(RAW, capture), 'utf8')), ...codec.flush()]
	return {
		frames: decoded.flatMap(line => line.frames),
		terminals: decoded.flatMap(line => (line.terminal ? [line.terminal] : [])),
		warnings,
	}
}

describe('CodexFrameDecoder — replayed against the committed captures', () => {
	it('the corpus is present and non-empty — a green run over zero bytes proves nothing', () => {
		const captures = ['s1-text.jsonl', 's2-tool.jsonl', 's3-schema.jsonl', 's4-resume.jsonl', 's5-mcp.jsonl', 's6-cancel.jsonl']
		for (const capture of captures) {
			expect(readFileSync(join(RAW, capture), 'utf8').trim().length, `${capture} is empty`).toBeGreaterThan(0)
		}
	})

	it('a plain text turn: thread id, reasoning, the answer, and the terminal record', () => {
		const { frames, terminals } = replay('s1-text.jsonl')

		// `thread.started` is codex's session identity and arrives FIRST.
		expect(frames[0]).toEqual({ kind: 'system_init', sessionId: '01a04541-3924-75f1-9f7e-221f3f57cee8', model: '' })

		expect(frames.filter(f => f.kind === 'thinking_delta')).toHaveLength(1)
		const answer = frames.find(f => f.kind === 'assistant_text')
		expect(answer).toMatchObject({ kind: 'assistant_text', text: 'PONG', parentToolUseId: null })

		// The answer is NOT on the terminal event — the decoder carried it forward from the last
		// `agent_message`, which is the whole reason it holds state.
		expect(terminals).toHaveLength(1)
		expect(terminals[0]).toMatchObject({
			stopReason: AgentStopReason.END_TURN,
			text: 'PONG',
			isError: false,
			sessionId: '01a04541-3924-75f1-9f7e-221f3f57cee8',
			apiErrorStatus: null,
		})
	})

	it('FALSIFIER — an `item` of type error does NOT fail the turn; it warns and the turn still completes', () => {
		const { frames, terminals, warnings } = replay('s1-text.jsonl')

		// Every capture opens with the stale-model-cache warning as `item.completed{type:'error'}`.
		expect(warnings.some(w => w.includes('Model metadata'))).toBe(true)
		// And none of it reaches the frame stream as a failure, nor flips the terminal verdict.
		expect(frames.filter(f => f.kind === 'error')).toEqual([])
		expect(terminals[0]?.isError).toBe(false)
	})

	it('all five token buckets are read, including the one the vendor does not document', () => {
		const { terminals } = replay('s1-text.jsonl')

		expect(terminals[0]?.usage).toEqual({
			inputTokens: 2050,
			outputTokens: 122,
			// `cache_write_input_tokens` — absent from the published schema, present on the wire.
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
			reasoningOutputTokens: 0,
		})
	})

	it('resume replays context and keeps the SAME thread id — the input count is the evidence', () => {
		const first = replay('s1-text.jsonl')
		const resumed = replay('s4-resume.jsonl')

		expect(resumed.terminals[0]?.sessionId).toBe(first.terminals[0]?.sessionId ?? null)
		// 2050 → 4100: the earlier turn was re-sent, which is what makes resume worth having.
		expect(resumed.terminals[0]?.usage.inputTokens ?? 0).toBeGreaterThan(first.terminals[0]?.usage.inputTokens ?? 0)
	})

	it('a run killed mid-turn yields NO terminal record — the result has to be synthesized from its absence', () => {
		const { frames, terminals } = replay('s6-cancel.jsonl')

		expect(frames.some(f => f.kind === 'system_init')).toBe(true)
		expect(terminals).toEqual([])
	})

	it('every capture decodes without throwing, and only s6 lacks a terminal', () => {
		for (const capture of ['s1-text.jsonl', 's2-tool.jsonl', 's3-schema.jsonl', 's4-resume.jsonl', 's5-mcp.jsonl']) {
			expect(replay(capture).terminals, capture).toHaveLength(1)
		}
	})
})

describe('CodexFrameDecoder — shapes observed live but ABSENT from the corpus', () => {
	// Named this way on purpose: these two are transcribed from a session, not replayable from a
	// capture, and the class docblock says so. The assertions pin the mapping we chose, not the wire.
	const decode = (raw: unknown) => new CodexFrameDecoder().decode(raw)

	it('turn.failed ends the turn with isError, and a stop reason we do not pretend to know', () => {
		const line = decode({ type: 'turn.failed', error: { message: 'boom' } })

		expect(line.frames).toEqual([{ kind: 'error', detail: 'boom' }])
		expect(line.terminal).toMatchObject({ stopReason: AgentStopReason.UNKNOWN, isError: true })
	})

	it('the top-level error frames but does NOT end the turn — it arrives paired with turn.failed', () => {
		const line = decode({ type: 'error', message: 'boom' })

		expect(line.frames).toEqual([{ kind: 'error', detail: 'boom' }])
		// No terminal: minting one here AND on the paired `turn.failed` would end one run twice.
		expect(line.terminal).toBeUndefined()
	})

	it('a double-encoded message is passed through verbatim, never re-parsed on a guess', () => {
		const encoded = '{"type":"error","status":400,"error":{"message":"unsupported model"}}'

		expect(decode({ type: 'error', message: encoded }).frames).toEqual([{ kind: 'error', detail: encoded }])
	})
})

describe('CodexFrameDecoder — the item types no capture contains', () => {
	it('drops them silently rather than guessing their field names', () => {
		const decoder = new CodexFrameDecoder()
		for (const type of ['command_execution', 'file_change', 'mcp_tool_call', 'web_search', 'todo_list']) {
			expect(decoder.decode({ type: 'item.completed', item: { id: 'i', type } }).frames, type).toEqual([])
		}
		// Same for the two lifecycle events the corpus never showed.
		expect(decoder.decode({ type: 'item.started', item: { id: 'i', type: 'agent_message' } }).frames).toEqual([])
		expect(decoder.decode({ type: 'item.updated', item: { id: 'i', type: 'agent_message' } }).frames).toEqual([])
	})
})
