import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { InMemoryAgentIdentityService, MockLoggingService } from '@codm/core-typescript'
import { PermissionPosture, StopKind } from '@codm/contracts-typescript/wire/enums'
import { AgentMessageRole, AgentName } from '../../../enums'
import type { AgentRunResult, AgentRuntimeEvent } from '../../../types/AgentRuntimeEvent'
import { StreamJsonCodec } from '../../StreamJsonCodec'
import { TerminalOutputAccumulator } from '../../TerminalOutputAccumulator'
import type { AgentProcess, AgentProcessSpec } from './AgentProcess'
import { ClaudeAgentRunner } from './ClaudeAgentRunner'

/**
 * AC-9 (participant-permission-posture, Decisions 9 + 10) — a turn the permission filter blocked ends
 * `STOPPED(PERMISSION_DENIED)`. The two MEASURED terminal frames (claude 2.1.295, headless `auto`) are
 * the fixtures: the classifier's block shows up in `safety_stops`, NOT in `permission_denials` — so the
 * runner reads both, and a turn where the model refused on its own (no tool call) is NOT a stop.
 *
 * FALSIFIER: drop the `safetyStops > 0` half of the predicate and the classifier-block case goes red;
 * drop the `permissionDenials` half and the synthetic-denials case goes red; widen it to "any non-empty
 * reply" and the no-tool case goes red.
 */
const fixture = (name: string): Record<string, unknown> =>
	JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8')) as Record<string, unknown>

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

async function runOn(terminalFrame: Record<string, unknown>): Promise<AgentRunResult> {
	const runner = ClaudeAgentRunner.withOptions(new MockLoggingService(), new InMemoryAgentIdentityService(), {
		spawner: fakeSpawner([line({ type: 'system', subtype: 'init', session_id: 'sess-p', model: 'claude' }), line(terminalFrame)]),
		inactivityMs: 5_000,
		postMortemMs: 50,
	})
	const events: AgentRuntimeEvent[] = []
	for await (const event of runner.run({
		agentName: AgentName.ISSUE_WORK,
		cwd: '/tmp/w',
		binaryPath: '/opt/bin/claude',
		messages: [{ role: AgentMessageRole.USER, content: 'grava em produção' }],
		posture: PermissionPosture.AUTO,
	}))
		events.push(event)
	const finished = events.find(event => event.type === 'finished')
	if (finished?.type !== 'finished') throw new Error('the run produced no terminal event')
	return finished.result
}

describe('the terminal frame — what the codec reads off it', () => {
	it('carries safety_stops and permission_denials (tool name + input KEYS only — never values)', () => {
		const [decoded] = new StreamJsonCodec().push(
			line({
				...fixture('auto-no-tool.result.json'),
				permission_denials: [{ tool_name: 'Bash', tool_use_id: 'tu_1', tool_input: { command: 'psql $PROD_URL', description: 'x' } }],
			}),
		)
		expect(decoded?.terminal?.safetyStops).toBe(0)
		expect(decoded?.terminal?.permissionDenials).toEqual([{ tool: 'Bash', inputKeys: ['command', 'description'] }])
	})

	it('reads the measured classifier block as two safety stops', () => {
		const [decoded] = new StreamJsonCodec().push(line(fixture('auto-classifier-block.result.json')))
		expect(decoded?.terminal?.safetyStops).toBe(2)
		expect(decoded?.terminal?.permissionDenials).toEqual([])
	})
})

describe('ClaudeAgentRunner — a blocked action is a PERMISSION_DENIED transport stop', () => {
	it('AC-9 — the measured classifier block (safety_stops: 2) stops the turn with PERMISSION_DENIED', async () => {
		const result = await runOn(fixture('auto-classifier-block.result.json'))
		expect(result.stop?.kind).toBe(StopKind.PERMISSION_DENIED)
		// The agent's own final words ride the detail — that is the approval request the operator reads.
		expect((result.stop?.detail ?? '').length).toBeGreaterThan(0)
	})

	it('AC-9 — a non-empty permission_denials stops it too, and the detail names the denied tool', async () => {
		const result = await runOn({
			...fixture('auto-no-tool.result.json'),
			permission_denials: [
				{ tool_name: 'Write', tool_use_id: 'tu_2', tool_input: { file_path: '/etc/hosts', content: 'sk_live_SENTINEL_VALUE_9f3a' } },
			],
		})
		expect(result.stop?.kind).toBe(StopKind.PERMISSION_DENIED)
		expect(result.stop?.detail).toContain('Write')
		expect(result.stop?.detail).toContain('file_path')
		// The input's VALUES never reach the detail — an input can carry a credential. The sentinel is a
		// string the measured fixture's own reply text cannot contain (that text says "secret key" itself).
		expect(result.stop?.detail).not.toContain('sk_live_SENTINEL_VALUE_9f3a')
		expect(result.stop?.detail).not.toContain('/etc/hosts')
	})

	it('AC-9 — the measured self-refusal (safety_stops: 0, no denials) is NOT a stop', async () => {
		const result = await runOn(fixture('auto-no-tool.result.json'))
		expect(result.stop).toBeUndefined()
	})

	it('AC-9 — TerminalOutputAccumulator.outcome() reports STOPPED(PERMISSION_DENIED)', async () => {
		const result = await runOn(fixture('auto-classifier-block.result.json'))
		const accumulator = new TerminalOutputAccumulator({ issueId: '00000000-0000-4000-8000-0000000000cc' })
		accumulator.feed({ type: 'finished', result })
		expect(accumulator.outcome()).toMatchObject({ kind: 'STOPPED', stopKind: StopKind.PERMISSION_DENIED })
	})
})
