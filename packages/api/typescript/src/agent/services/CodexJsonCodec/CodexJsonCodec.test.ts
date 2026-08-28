import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AgentStopReason } from '@codm/contracts-typescript/wire/enums'
import type { AgentFrame } from '../../types/AgentFrame'
import { CodexJsonCodec } from './CodexJsonCodec'

const smoke = resolve(import.meta.dir, '../../../../../../../.plans/codex-smoke')

function decode(relative: string): AgentFrame[] {
	const codec = new CodexJsonCodec()
	const text = readFileSync(resolve(smoke, relative), 'utf8')
	return [...codec.push(text), ...codec.flush()].flatMap(line => line.frames)
}

describe('CodexJsonCodec fixtures', () => {
	it('decodes the happy turn, command lifecycle, usage, and final answer', () => {
		const frames = decode('fixtures/happy-turn.jsonl')
		expect(frames.map(frame => frame.kind)).toEqual(['system_init', 'tool_use', 'tool_result', 'assistant_text', 'result'])
		expect(frames.at(-2)).toMatchObject({ kind: 'assistant_text', text: 'Repo contains docs, sdk, and examples directories.' })
		expect(frames.at(-1)).toEqual({ kind: 'result', stopReason: AgentStopReason.END_TURN, usage: { inputTokens: 24763, outputTokens: 122, cacheCreationInputTokens: 0, cacheReadInputTokens: 24448 } })
	})

	it('decodes an MCP call as one tool lifecycle', () => {
		const frames = decode('fixtures/mcp-tool-call.jsonl')
		expect(frames.filter(frame => frame.kind === 'tool_use')).toEqual([
			{ kind: 'tool_use', toolUseId: 'item_mcp_1', tool: 'mcp__codm__classify_issue', input: {}, target: 'classify_issue', parentToolUseId: null },
		])
		expect(frames.filter(frame => frame.kind === 'tool_result')).toEqual([{ kind: 'tool_result', toolUseId: 'item_mcp_1', ok: true, summary: '{"kind":"NEW_ISSUE"}', parentToolUseId: null }])
	})

	it('decodes the real authenticated MCP smoke capture', () => {
		const frames = decode('mcp-ping.jsonl')
		expect(frames.filter(frame => frame.kind === 'tool_use')).toMatchObject([{ tool: 'mcp__codm__ping' }])
		expect(frames.filter(frame => frame.kind === 'tool_result')).toMatchObject([{ ok: true, summary: 'CODM-MCP-PONG' }])
		expect(frames.find(frame => frame.kind === 'assistant_text')).toMatchObject({ text: 'CODM-MCP-PONG' })
	})

	it('decodes the real quota failure structurally and keeps the thread id', () => {
		const codec = new CodexJsonCodec()
		const decoded = [...codec.push(readFileSync(resolve(smoke, 'simple.jsonl'), 'utf8')), ...codec.flush()]
		const terminal = decoded.find(line => line.terminal)?.terminal
		expect(terminal).toMatchObject({ isError: true, sessionId: '01a0486e-4f9f-7db2-a83c-5b94e046f699' })
		expect(terminal?.text).toContain('usage limit')
	})

	it('reassembles chunks and tolerates malformed and unknown lines', () => {
		const warnings: string[] = []
		const codec = new CodexJsonCodec({ onWarn: message => warnings.push(message) })
		expect(codec.push('{"type":"thread.')).toEqual([])
		const frames = codec.push('started","thread_id":"abc"}\nnot-json\n{"type":"future.event"}\n').flatMap(line => line.frames)
		expect(frames).toEqual([{ kind: 'system_init', sessionId: 'abc', model: '' }])
		expect(warnings).toHaveLength(1)
	})
})
