import { AgentStopReason } from '@codm/contracts-typescript/wire/enums'
import { describeToolActivity } from '@codm/contracts/cues'
import type { AgentFrame, AgentTurnUsage } from '../../types/AgentFrame'
import { wireToolName } from '../../mcp/wire'

export interface CodexTerminalRecord {
	stopReason: AgentStopReason
	usage: AgentTurnUsage
	text: string
	isError: boolean
	sessionId: string | null
	apiErrorStatus: string | number | null
}

export interface CodexDecodedLine {
	frames: AgentFrame[]
	terminal?: CodexTerminalRecord
}

const EMPTY: CodexDecodedLine = { frames: [] }

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function string(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined
}

function count(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0
}

function usage(value: unknown): AgentTurnUsage {
	const raw = record(value) ?? {}
	return {
		inputTokens: count(raw.input_tokens),
		outputTokens: count(raw.output_tokens),
		cacheCreationInputTokens: count(raw.cache_write_input_tokens),
		cacheReadInputTokens: count(raw.cached_input_tokens),
	}
}

function render(value: unknown): string {
	if (typeof value === 'string') return value
	const raw = record(value)
	const content = raw?.content
	if (Array.isArray(content)) return content.map(part => string(record(part)?.text) ?? JSON.stringify(part)).join('\n')
	return value === undefined ? '' : JSON.stringify(value)
}

/** One Codex `exec --json` event to CODM's provider-neutral frames. */
export class CodexFrameDecoder {
	private sessionId: string | null = null
	private finalText = ''

	decode(rawValue: unknown): CodexDecodedLine {
		const raw = record(rawValue)
		if (!raw) return EMPTY
		switch (raw.type) {
			case 'thread.started': {
				this.sessionId = string(raw.thread_id) ?? null
				return { frames: [{ kind: 'system_init', sessionId: this.sessionId ?? '', model: '' }] }
			}
			case 'item.started':
			case 'item.updated':
			case 'item.completed':
				return { frames: this.decodeItem(record(raw.item), raw.type === 'item.completed') }
			case 'error':
				return { frames: [{ kind: 'error', detail: string(raw.message) ?? 'provider reported an error' }] }
			case 'turn.completed': {
				const turnUsage = usage(raw.usage)
				return {
					frames: [{ kind: 'result', stopReason: AgentStopReason.END_TURN, usage: turnUsage }],
					terminal: { stopReason: AgentStopReason.END_TURN, usage: turnUsage, text: this.finalText, isError: false, sessionId: this.sessionId, apiErrorStatus: null },
				}
			}
			case 'turn.failed': {
				const error = record(raw.error)
				const detail = string(error?.message) ?? string(raw.message) ?? 'provider reported a failed turn'
				const turnUsage = usage(raw.usage)
				return {
					frames: [{ kind: 'error', detail }, { kind: 'result', stopReason: AgentStopReason.UNKNOWN, usage: turnUsage }],
					terminal: { stopReason: AgentStopReason.UNKNOWN, usage: turnUsage, text: detail, isError: true, sessionId: this.sessionId, apiErrorStatus: string(error?.code) ?? null },
				}
			}
			default:
				return EMPTY
		}
	}

	private decodeItem(item: Record<string, unknown> | undefined, completed: boolean): AgentFrame[] {
		if (!item) return []
		const id = string(item.id) ?? ''
		if (item.type === 'agent_message') {
			if (!completed) return []
			const text = string(item.text) ?? ''
			this.finalText = text
			return [{ kind: 'assistant_text', messageId: id, text, parentToolUseId: null }]
		}
		if (item.type === 'mcp_tool_call') {
			const tool = wireToolName(string(item.tool) ?? '')
			if (!completed) return [{ kind: 'tool_use', toolUseId: id, tool, input: item.arguments, target: describeToolActivity(tool, item.arguments).target, parentToolUseId: null }]
			return [{ kind: 'tool_result', toolUseId: id, ok: item.status !== 'failed' && item.error == null, summary: render(item.result ?? item.error), parentToolUseId: null }]
		}
		if (item.type === 'command_execution') {
			if (!completed) return [{ kind: 'tool_use', toolUseId: id, tool: 'command_execution', input: { command: item.command }, target: describeToolActivity('command_execution', { command: item.command }).target, parentToolUseId: null }]
			return [{ kind: 'tool_result', toolUseId: id, ok: item.exit_code === 0, summary: string(item.aggregated_output) ?? '', parentToolUseId: null }]
		}
		if (item.type === 'reasoning' && completed) return [{ kind: 'thinking_delta', delta: string(item.text) ?? '' }]
		return []
	}
}
