import { describe, expect, it } from 'bun:test'
import { InMemoryAgentIdentityService, MockLoggingService } from '@codm/core-typescript'
import { PermissionPosture, StopKind } from '@codm/contracts-typescript/wire/enums'
import { AgentMessageRole, AgentName } from '../../../enums'
import type { AgentRunResult, AgentRuntimeEvent } from '../../../types/AgentRuntimeEvent'
import type { AgentProcess, AgentProcessSpec } from './AgentProcess'
import { ClaudeAgentRunner } from './ClaudeAgentRunner'

/**
 * The provider account hit its usage limit — the run must say WHEN a retry can succeed.
 *
 * The shapes come from 2026-10-30 (claude 2.1.314): the session transcript of a refused turn carries
 * `apiErrorParams.rate_limit_info` (`status: 'rejected'`, `resetsAt` in unix seconds) on an API-error
 * `assistant` line, and `rate_limit_event` is on the stream-json wire. Without the instant, the
 * dispatcher retried three times in seconds and poisoned the item; with it, the item waits for the reset.
 *
 * FALSIFIER: stop attaching `retryAfter` in `buildResult` and the first case goes red; attach it on any
 * verdict instead of a REJECTED one and the second goes red.
 */
const line = (value: unknown): string => `${JSON.stringify(value)}\n`

/** A child that prints `lines` and exits 0 once stdout runs dry — no real CLI is ever spawned. */
function fakeSpawner(lines: string[]) {
	return (_spec: AgentProcessSpec): AgentProcess => {
		let reap: (code: number) => void = () => {}
		const exited = new Promise<number>(resolve => {
			reap = resolve
		})
		return {
			stdout: (async function* () {
				for (const l of lines) yield l
				reap(0)
			})(),
			stderr: (async function* () {})(),
			write() {},
			endStdin() {},
			kill() {
				reap(0)
			},
			exited,
		}
	}
}

async function runOn(lines: unknown[]): Promise<AgentRunResult> {
	const runner = ClaudeAgentRunner.withOptions(new MockLoggingService(), new InMemoryAgentIdentityService(), {
		spawner: fakeSpawner([line({ type: 'system', subtype: 'init', session_id: 'sess-limit', model: 'claude' }), ...lines.map(line)]),
		inactivityMs: 5_000,
		postMortemMs: 50,
	})
	const events: AgentRuntimeEvent[] = []
	for await (const event of runner.run({
		agentName: AgentName.ORCHESTRATOR,
		cwd: '/tmp/w',
		binaryPath: '/opt/bin/claude',
		messages: [{ role: AgentMessageRole.USER, content: 'oi' }],
		posture: PermissionPosture.AUTO,
	}))
		events.push(event)
	const finished = events.find(event => event.type === 'finished')
	if (finished?.type !== 'finished') throw new Error('the run produced no terminal event')
	return finished.result
}

const ERROR_RESULT = {
	type: 'result',
	subtype: 'success',
	is_error: true,
	result: "You've hit your 5-hour limit · resets 6:50pm",
	session_id: 'sess-limit',
}

describe('a turn the provider refused for its usage limit', () => {
	it('stops with the reset instant as retryAfter (ms), read off the structured verdict', async () => {
		const result = await runOn([
			{
				type: 'assistant',
				isApiErrorMessage: true,
				error: 'rate_limit',
				apiErrorParams: { rate_limit_info: { status: 'rejected', resetsAt: 1793397000, rateLimitType: 'five_hour' } },
				message: { id: 'err-1', content: [{ type: 'text', text: "You've hit your 5-hour limit · resets 6:50pm" }] },
			},
			ERROR_RESULT,
		])
		expect(result.stop?.kind).toBe(StopKind.SERVER_ERROR)
		expect(result.stop?.retryAfter).toBe(Date.parse('2026-10-30T21:50:00.000Z'))
	})

	it('an ordinary error result with an ALLOWED verdict keeps retrying whenever — no retryAfter', async () => {
		const result = await runOn([
			{ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: 1793397000, rateLimitType: 'five_hour' } },
			ERROR_RESULT,
		])
		expect(result.stop?.kind).toBe(StopKind.SERVER_ERROR)
		expect(result.stop?.retryAfter).toBeUndefined()
	})

	it('a completed run reports the context of its last main-agent call', async () => {
		const result = await runOn([
			{ type: 'assistant', message: { id: 'a1', content: [], usage: { input_tokens: 2, cache_read_input_tokens: 40_000 } } },
			{
				type: 'assistant',
				message: { id: 'a2', content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 2, cache_read_input_tokens: 52_000 } },
			},
			{ type: 'result', subtype: 'success', result: 'ok', session_id: 'sess-limit', stop_reason: 'end_turn' },
		])
		expect(result.stop).toBeUndefined()
		expect(result.contextTokens).toBe(52_002)
	})
})
