/**
 * AC-2.2 — the codec over CANNED frames. No process is ever started here (§8 rule 8); every fixture
 * below is copied from the REAL capture committed at `.specs/codedm/phase2-smoke/raw/`, so the shapes
 * asserted are measured ones rather than shapes derived from the third-party product study that the
 * decision gate (`bf217a2a`) proved wrong in eight places.
 */
import { describe, it, expect } from 'bun:test'
import { AgentStopReason } from '@codm/contracts-typescript/wire/enums'
import type { AgentFrame } from '../../types/AgentFrame'
import { StreamJsonCodec } from './StreamJsonCodec'
import { LineBuffer } from './LineBuffer'

/** Feed a whole JSONL document and collect everything it decoded to, including the flush. */
function decodeAll(codec: StreamJsonCodec, text: string): { frames: AgentFrame[]; terminals: number } {
	const decoded = [...codec.push(text), ...codec.flush()]
	return { frames: decoded.flatMap(d => d.frames), terminals: decoded.filter(d => d.terminal).length }
}

// ── Fixtures, verbatim-shaped from `phase2-smoke/raw/` ────────────────────────────────────────────

/** `raw/s1-text.jsonl` — the plain text turn. */
const ASSISTANT_TEXT = JSON.stringify({
	type: 'assistant',
	message: {
		model: 'claude-opus-5',
		id: 'msg_011CdSnJ7J1bHQf7Q4ztPNW8',
		role: 'assistant',
		content: [{ type: 'text', text: 'SMOKE-OK' }],
		stop_reason: null,
	},
	parent_tool_use_id: null,
	session_id: '2e564f1b-2b2a-4929-83c1-e2e84a9290f4',
})

/** `raw/s1-text.jsonl` — the terminal aggregate. `type` is present; `parent_tool_use_id` is NOT (D1). */
const RESULT_SUCCESS = JSON.stringify({
	type: 'result',
	subtype: 'success',
	is_error: false,
	stop_reason: 'end_turn',
	result: 'SMOKE-OK',
	session_id: '2e564f1b-2b2a-4929-83c1-e2e84a9290f4',
	total_cost_usd: 0.0997765,
	usage: { input_tokens: 2, cache_creation_input_tokens: 9188, cache_read_input_tokens: 15273, output_tokens: 10 },
})

/** `raw/s1-text.jsonl` — ambient noise from the USER's own SessionStart hooks. Present in all four captures. */
const HOOK_RESPONSE = JSON.stringify({
	type: 'system',
	subtype: 'hook_response',
	hook_name: 'SessionStart:startup',
	output: '{"hookSpecificOutput":{}}',
})
const RATE_LIMIT = JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour' } })

describe('StreamJsonCodec — line reassembly and parse failures never abort the drain (AC-2.2)', () => {
	it('reassembles a frame split across chunk boundaries', () => {
		const codec = new StreamJsonCodec()
		// The real `system/init` line is 5555 bytes and routinely lands across two `data` events.
		const first = codec.push(ASSISTANT_TEXT.slice(0, 40))
		const second = codec.push(`${ASSISTANT_TEXT.slice(40)}\n`)

		expect(first.flatMap(d => d.frames)).toEqual([])
		expect(second.flatMap(d => d.frames)).toEqual([
			{ kind: 'assistant_text', messageId: 'msg_011CdSnJ7J1bHQf7Q4ztPNW8', text: 'SMOKE-OK', parentToolUseId: null },
		])
	})

	it('emits two frames when one chunk carries two complete lines', () => {
		const codec = new StreamJsonCodec()
		const { frames } = decodeAll(codec, `${ASSISTANT_TEXT}\n${RESULT_SUCCESS}\n`)
		expect(frames.map(f => f.kind)).toEqual(['assistant_text', 'result'])
	})

	it('drops a NON-JSON line, warns once, and keeps decoding the lines after it', () => {
		const warns: string[] = []
		const codec = new StreamJsonCodec({ onWarn: m => warns.push(m) })

		const { frames } = decodeAll(codec, `not json at all\n${ASSISTANT_TEXT}\n${RESULT_SUCCESS}\n`)

		// The drain SURVIVED: everything after the garbage line still decoded.
		expect(frames.map(f => f.kind)).toEqual(['assistant_text', 'result'])
		expect(warns).toHaveLength(1)
	})

	it('drops JSON truncated mid-line at end of stream without throwing, and keeps what came before', () => {
		const warns: string[] = []
		const codec = new StreamJsonCodec({ onWarn: m => warns.push(m) })

		// A stream that died mid-object — exactly what the watchdog's kill leaves behind.
		const { frames } = decodeAll(codec, `${ASSISTANT_TEXT}\n${RESULT_SUCCESS.slice(0, 60)}`)

		expect(frames.map(f => f.kind)).toEqual(['assistant_text'])
		expect(warns).toHaveLength(1)
	})

	it('decodes a well-formed FINAL line that has no trailing newline', () => {
		const codec = new StreamJsonCodec()
		// Not the same case as truncation, and the difference is load-bearing: dropping this one would
		// lose the terminal frame — i.e. the turn — on any CLI that omits the last `\n`.
		const { frames, terminals } = decodeAll(codec, RESULT_SUCCESS)
		expect(frames.map(f => f.kind)).toEqual(['result'])
		expect(terminals).toBe(1)
	})

	it('silently drops a WELL-FORMED frame of an UNKNOWN type — no warn, no abort (§4.3 rule 9)', () => {
		const warns: string[] = []
		const codec = new StreamJsonCodec({ onWarn: m => warns.push(m) })

		const { frames } = decodeAll(codec, `${HOOK_RESPONSE}\n${RATE_LIMIT}\n${ASSISTANT_TEXT}\n${RESULT_SUCCESS}\n`)

		expect(frames.map(f => f.kind)).toEqual(['assistant_text', 'result'])
		// SILENTLY: these two appear in ALL FOUR real captures, fired by the user's own hooks. Warning
		// on ambient noise the CODM does not control would make the log useless on a real machine.
		expect(warns).toEqual([])
	})
})

describe('FrameDecoder — content[] fan-out (AC-2.2, divergence D3)', () => {
	it('fans ONE assistant frame carrying several blocks out into several AgentFrames', () => {
		const codec = new StreamJsonCodec()
		const multi = JSON.stringify({
			type: 'assistant',
			message: {
				id: 'msg_multi',
				role: 'assistant',
				content: [
					{ type: 'thinking', thinking: 'weighing it up' },
					{ type: 'text', text: 'first' },
					{ type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/tmp/a' } },
					{ type: 'text', text: 'second' },
				],
			},
			parent_tool_use_id: null,
		})

		const { frames } = decodeAll(codec, `${multi}\n`)

		// FOUR frames out of ONE wire frame. This is the step the ~150 LOC budget explicitly cedes to.
		expect(frames).toEqual([
			{ kind: 'thinking_delta', delta: 'weighing it up' },
			{ kind: 'assistant_text', messageId: 'msg_multi', text: 'first', parentToolUseId: null },
			{ kind: 'tool_use', toolUseId: 'toolu_1', tool: 'Read', input: { file_path: '/tmp/a' }, target: 'a', parentToolUseId: null },
			{ kind: 'assistant_text', messageId: 'msg_multi', text: 'second', parentToolUseId: null },
		])
	})

	it('treats a tool_result with NO is_error key as ok — the success shape in the real corpus', () => {
		const codec = new StreamJsonCodec()
		// `raw/s2-tool.jsonl`: on success the key is ABSENT, never `false`. So `ok` must be
		// `is_error !== true`; `!is_error` would coincidentally work, `is_error === false` would not.
		const toolResult = JSON.stringify({
			type: 'user',
			message: {
				role: 'user',
				content: [{ tool_use_id: 'toolu_014gZzVmz9aD3PJw93yUXYWy', type: 'tool_result', content: '1\tSMOKE-TOOL-OK\n2\t' }],
			},
			parent_tool_use_id: null,
		})

		const { frames } = decodeAll(codec, `${toolResult}\n`)

		expect(frames).toEqual([
			{
				kind: 'tool_result',
				toolUseId: 'toolu_014gZzVmz9aD3PJw93yUXYWy',
				ok: true,
				summary: '1\tSMOKE-TOOL-OK\n2\t',
				parentToolUseId: null,
			},
		])
	})

	it('accepts tool_result.content as an ARRAY of blocks as well as a string — both occur', () => {
		const codec = new StreamJsonCodec()
		// `raw/s3-subagent.jsonl` carries the sub-agent's rolled-up answer as an array of {type,text}.
		const arrayResult = JSON.stringify({
			type: 'user',
			message: {
				role: 'user',
				content: [
					{
						tool_use_id: 'toolu_2',
						type: 'tool_result',
						content: [
							{ type: 'text', text: 'SMOKE' },
							{ type: 'text', text: 'OK' },
						],
					},
				],
			},
			parent_tool_use_id: null,
		})

		const { frames } = decodeAll(codec, `${arrayResult}\n`)

		expect(frames).toEqual([{ kind: 'tool_result', toolUseId: 'toolu_2', ok: true, summary: 'SMOKE\nOK', parentToolUseId: null }])
	})

	it('marks a tool_result with is_error true as NOT ok', () => {
		const codec = new StreamJsonCodec()
		const failed = JSON.stringify({
			type: 'user',
			message: { role: 'user', content: [{ tool_use_id: 'toolu_3', type: 'tool_result', is_error: true, content: 'ENOENT' }] },
			parent_tool_use_id: null,
		})

		const { frames } = decodeAll(codec, `${failed}\n`)
		expect(frames).toEqual([{ kind: 'tool_result', toolUseId: 'toolu_3', ok: false, summary: 'ENOENT', parentToolUseId: null }])
	})

	it('carries parent_tool_use_id onto assistant and user frames — the accumulator SCOPE key (D1)', () => {
		const codec = new StreamJsonCodec()
		const subAgentToolUse = JSON.stringify({
			type: 'assistant',
			message: { id: 'msg_sub', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_inner', name: 'Read', input: {} }] },
			// Measured on three consecutive frames of `raw/s3-subagent.jsonl`.
			parent_tool_use_id: 'toolu_01WpAVhnCvdR8Ywmh4rK4jed',
		})

		const { frames } = decodeAll(codec, `${subAgentToolUse}\n`)

		expect(frames[0]).toMatchObject({ kind: 'tool_use', parentToolUseId: 'toolu_01WpAVhnCvdR8Ywmh4rK4jed' })
	})

	it('reads the terminal record: four usage buckets, stop reason, session id and reply text', () => {
		const codec = new StreamJsonCodec()
		const decoded = [...codec.push(`${RESULT_SUCCESS}\n`), ...codec.flush()]
		const terminal = decoded.find(d => d.terminal)?.terminal

		expect(terminal).toEqual({
			stopReason: AgentStopReason.END_TURN,
			// The four measured buckets — the numbers that make AC-2.7 falsifiable.
			usage: { inputTokens: 2, outputTokens: 10, cacheCreationInputTokens: 9188, cacheReadInputTokens: 15273 },
			text: 'SMOKE-OK',
			isError: false,
			sessionId: '2e564f1b-2b2a-4929-83c1-e2e84a9290f4',
			// `null` on every clean turn measured — RESULT_SUCCESS carries no `api_error_status`.
			apiErrorStatus: null,
		})
	})

	it('threads a non-null `api_error_status` through as TRANSPORT evidence, not text', () => {
		const codec = new StreamJsonCodec()
		const withApiError = JSON.stringify({
			type: 'result',
			subtype: 'error_during_execution',
			is_error: true,
			stop_reason: 'end_turn',
			result: 'the model was mid-sentence when this happened',
			session_id: '2e564f1b-2b2a-4929-83c1-e2e84a9290f4',
			usage: {},
			api_error_status: 'authentication_error',
		})

		const decoded = [...codec.push(`${withApiError}\n`), ...codec.flush()]
		const terminal = decoded.find(d => d.terminal)?.terminal

		expect(terminal?.apiErrorStatus).toBe('authentication_error')
	})

	it('degrades an unnamed stop_reason to UNKNOWN with a warn instead of crashing (§4.2)', () => {
		const warns: string[] = []
		const codec = new StreamJsonCodec({ onWarn: m => warns.push(m) })
		const odd = JSON.stringify({ type: 'result', subtype: 'success', stop_reason: 'teleported', usage: {}, result: '' })

		const { frames } = decodeAll(codec, `${odd}\n`)

		expect(frames).toEqual([
			{
				kind: 'result',
				stopReason: AgentStopReason.UNKNOWN,
				usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
			},
		])
		expect(warns).toHaveLength(1)
	})

	it('emits an error frame BEFORE the result frame when the CLI itself reports a failed run', () => {
		const codec = new StreamJsonCodec()
		const errored = JSON.stringify({
			type: 'result',
			subtype: 'error_during_execution',
			is_error: true,
			stop_reason: 'end_turn',
			result: 'boom',
			usage: {},
		})

		const { frames } = decodeAll(codec, `${errored}\n`)

		// Order matters: an observer must see the diagnosis before the turn closes underneath it.
		expect(frames.map(f => f.kind)).toEqual(['error', 'result'])
		expect(frames[0]).toEqual({ kind: 'error', detail: 'boom' })
	})

	it('turns stream_event partial deltas into text_delta frames carrying the id from message_start', () => {
		const codec = new StreamJsonCodec()
		// `raw/s4-partial.jsonl` — the delta frames carry NO message id; it was announced earlier.
		const start = JSON.stringify({
			type: 'stream_event',
			event: { type: 'message_start', message: { id: 'msg_011CdSnLLFRZ5pTQ22nZEFX5', role: 'assistant', content: [] } },
		})
		const delta = JSON.stringify({
			type: 'stream_event',
			event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'part' } },
		})

		const { frames } = decodeAll(codec, `${start}\n${delta}\n`)

		expect(frames).toEqual([{ kind: 'text_delta', messageId: 'msg_011CdSnLLFRZ5pTQ22nZEFX5', delta: 'part' }])
	})
})

describe('LineBuffer — the boring half', () => {
	it('keeps a trailing partial line buffered until its newline arrives', () => {
		const buffer = new LineBuffer()
		expect(buffer.push('{"a":')).toEqual([])
		expect(buffer.push('1}\n{"b":2}\n')).toEqual(['{"a":1}', '{"b":2}'])
		expect(buffer.flush()).toEqual([])
	})

	it('surfaces (rather than swallows) whatever was left when the stream ended mid-line', () => {
		const buffer = new LineBuffer()
		buffer.push('{"a":1}\n{"trunc')
		expect(buffer.flush()).toEqual(['{"trunc'])
		// Idempotent — a second flush after the drain has nothing left to release.
		expect(buffer.flush()).toEqual([])
	})

	it('strips CR so a CRLF pipe does not corrupt every line', () => {
		const buffer = new LineBuffer()
		expect(buffer.push('{"a":1}\r\n')).toEqual(['{"a":1}'])
	})

	it('decodes a multi-byte character split across two chunks', () => {
		const buffer = new LineBuffer()
		const bytes = new TextEncoder().encode('{"t":"é"}\n')
		// Split INSIDE the 2-byte `é`. `chunk.toString()` per chunk would yield replacement characters
		// here and produce invalid JSON; the streaming TextDecoder is what makes this line parse.
		expect(buffer.push(bytes.slice(0, 7))).toEqual([])
		expect(buffer.push(bytes.slice(7))).toEqual(['{"t":"é"}'])
	})
})
