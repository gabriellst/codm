import { describe, expect, it } from 'bun:test'
import { MockLoggingService, InMemoryAgentIdentityService } from '@codm/core-typescript'
import { AgentModelId } from '@codm/contracts-typescript/wire/enums'
import { AgentMessageRole, AgentName, AgentRunOutcome } from '../../../enums'
import type { AgentRunRequest } from '../../../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../../../types/AgentRuntimeEvent'
import type { AgentMcpInvocation } from '../../../types/AgentMcpInvocation'
import type { AgentProcess, AgentProcessSpec } from '../ClaudeAgentRunner/AgentProcess'
import { CodexAgentRunner } from './CodexAgentRunner'

function fakeSpawner(lines: string[]) {
	let spec: AgentProcessSpec | undefined
	const spawner = (value: AgentProcessSpec): AgentProcess => {
		spec = value
		return {
			stdout: (async function* () { for (const line of lines) yield line })(),
			stderr: (async function* () {})(),
			write() {}, endStdin() {}, kill() {}, exited: Promise.resolve(0),
		}
	}
	return { spawner, spec: () => spec as AgentProcessSpec }
}

const request = (overrides: Partial<AgentRunRequest> = {}): AgentRunRequest => ({
	agentName: AgentName.ISSUE_WORK,
	cwd: '/tmp/workspace',
	binaryPath: '/opt/bin/codex',
	messages: [{ role: AgentMessageRole.USER, content: 'reply briefly' }],
	...overrides,
})

async function drain(stream: AsyncIterable<AgentRuntimeEvent>): Promise<AgentRuntimeEvent[]> {
	const events: AgentRuntimeEvent[] = []
	for await (const event of stream) events.push(event)
	return events
}

describe('CodexAgentRunner.buildArgs', () => {
	const mcp: AgentMcpInvocation = {
		transport: 'http', endpoint: 'http://127.0.0.1:3030/mcp/issue-handling', token: 'opaque-secret', allowedTools: [],
	}
	it('builds the measured new-turn argv', () => {
		expect(CodexAgentRunner.buildArgs({ cwd: '/repo', prompt: 'pong', extraDirs: ['/shared'] })).toEqual([
			'exec', '-C', '/repo', '--approve-for-me', '--json', '--add-dir', '/shared', 'pong',
		])
	})

	it('uses the exec resume subcommand and excludes new-turn-only flags', () => {
		expect(CodexAgentRunner.buildArgs({ cwd: '/repo', prompt: 'again', resumeSessionId: 'thread-1', extraDirs: ['/shared'] })).toEqual([
			'exec', '--approve-for-me', 'resume', 'thread-1', '--json', 'again',
		])
	})

	it('configures HTTP MCP per run without putting the bearer token in argv', () => {
		const args = CodexAgentRunner.buildArgs({ cwd: '/repo', prompt: 'use a tool', mcp })
		expect(args).toContain('mcp_servers.codm.url="http://127.0.0.1:3030/mcp/issue-handling"')
		expect(args).toContain('mcp_servers.codm.bearer_token_env_var="CODM_RUN_TOKEN"')
		expect(args.join(' ')).not.toContain('opaque-secret')
	})

	it('passes a materialized native output schema path', () => {
		const args = CodexAgentRunner.buildArgs({ cwd: '/repo', prompt: 'classify', outputSchemaPath: '/tmp/schema.json' })
		expect(args.slice(args.indexOf('--output-schema'), args.indexOf('--output-schema') + 2)).toEqual(['--output-schema', '/tmp/schema.json'])
	})

	it('maps Codex model ids to the CLI --model slugs', () => {
		expect(CodexAgentRunner.buildArgs({ cwd: '/repo', prompt: 'pong', model: AgentModelId.GPT_5_3_CODEX })).toContain('--model')
		expect(CodexAgentRunner.buildArgs({ cwd: '/repo', prompt: 'pong', model: AgentModelId.GPT_5_3_CODEX })).toContain('gpt-5.3-codex')
	})
})

describe('CodexAgentRunner.run', () => {
	it('drains JSONL, returns the final message and persists thread_id', async () => {
		const line = (value: unknown): string => `${JSON.stringify(value)}\n`
		const fake = fakeSpawner([
			line({ type: 'thread.started', thread_id: 'thread-1' }),
			line({ type: 'item.completed', item: { id: 'item-1', type: 'agent_message', text: 'done' } }),
			line({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 3, output_tokens: 2 } }),
		])
		const runner = CodexAgentRunner.withOptions(new MockLoggingService(), new InMemoryAgentIdentityService(), { spawner: fake.spawner })
		const events = await drain(runner.run(request()))

		expect(fake.spec()).toMatchObject({ cwd: '/tmp/workspace', stdin: false })
		expect(fake.spec().cmd).toEqual(['/opt/bin/codex', 'exec', '-C', '/tmp/workspace', '--approve-for-me', '--json', 'reply briefly'])
		expect(events.at(-1)).toMatchObject({ type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'done', sessionId: 'thread-1', failed: false } })
	})

	it('surfaces turn.failed as a transport stop', async () => {
		const fake = fakeSpawner([
			`${JSON.stringify({ type: 'thread.started', thread_id: 'thread-2' })}\n`,
			`${JSON.stringify({ type: 'turn.failed', error: { message: 'usage limit' } })}\n`,
		])
		const runner = CodexAgentRunner.withOptions(new MockLoggingService(), new InMemoryAgentIdentityService(), { spawner: fake.spawner })
		const finished = (await drain(runner.run(request()))).at(-1)
		expect(finished).toMatchObject({ type: 'finished', result: { outcome: AgentRunOutcome.STOPPED, replyText: 'usage limit', sessionId: 'thread-2' } })
	})

	it('passes the opaque MCP token only through the child environment', async () => {
		const fake = fakeSpawner([`${JSON.stringify({ type: 'turn.completed', usage: {} })}\n`])
		const runner = CodexAgentRunner.withOptions(new MockLoggingService(), new InMemoryAgentIdentityService(), { spawner: fake.spawner })
		await drain(runner.run(request({ mcp: { transport: 'http', endpoint: 'http://127.0.0.1:3030/mcp/system', token: 'opaque-secret', allowedTools: [] } })))
		expect(fake.spec().env?.CODM_RUN_TOKEN).toBe('opaque-secret')
		expect(fake.spec().cmd.join(' ')).not.toContain('opaque-secret')
	})
})
