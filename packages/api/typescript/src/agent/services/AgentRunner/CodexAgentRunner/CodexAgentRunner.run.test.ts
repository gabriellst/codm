import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z, type ZodType } from 'zod'
import { AgentIdentityService, InMemoryAgentIdentityService, LoggingService } from '@codm/core-typescript'
import { AgentMessageRole, AgentName, AgentRunOutcome } from '../../../enums'
import type { AgentRunRequest } from '../../../types/AgentRunRequest'
import type { AgentRuntimeEvent } from '../../../types/AgentRuntimeEvent'
import type { AgentProcess, AgentProcessSpec } from '../ClaudeAgentRunner/AgentProcess'
import { CodexAgentRunner } from './CodexAgentRunner'

/**
 * `run()`, driven by the REAL captures through a fake process.
 *
 * The fake is the process, never the transport: the bytes come from
 * `.specs/codedm/codex-smoke/raw/*.jsonl`, which is what codex-cli 0.150.0 actually wrote. That
 * keeps the drain loop honest about a grammar a person did not invent while writing the test, and it
 * is why §8 rule 8 ("no test spawns a provider CLI") costs nothing here.
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
const capture = (file: string): string => readFileSync(join(repoRoot(), '.specs', 'codedm', 'codex-smoke', 'raw', file), 'utf8')

interface FakeProcess extends AgentProcess {
	spec: AgentProcessSpec
	killed: boolean
	writes: string[]
}

/** Emits `chunks`, then ends — or holds stdout open forever when `hold`, which is what provokes the watchdog. */
function fakeSpawner(chunks: string[], options: { hold?: boolean; exitCode?: number; stderr?: string } = {}) {
	let created: FakeProcess | undefined
	const spawner = (spec: AgentProcessSpec): AgentProcess => {
		const proc: FakeProcess = {
			spec,
			killed: false,
			writes: [],
			stdout: (async function* () {
				for (const chunk of chunks) yield chunk
				if (options.hold) await new Promise<void>(() => {})
			})(),
			stderr: (async function* () {
				if (options.stderr) yield options.stderr
			})(),
			write(chunk: string) {
				proc.writes.push(chunk)
			},
			endStdin() {
				/* codex never has stdin to end — asserted below */
			},
			kill() {
				proc.killed = true
			},
			exited: Promise.resolve(options.exitCode ?? 0),
		}
		created = proc
		return proc
	}
	return { spawner, process: () => created as FakeProcess }
}

const identities = (): AgentIdentityService => new InMemoryAgentIdentityService()

class SilentLogging extends LoggingService {
	log(): void {}
	info(): void {}
	warn(): void {}
	error(): void {}
	debug(): void {}
}

/**
 * GENERIC over the output schema, because `AgentRunRequest` is: a helper fixed at `undefined` cannot
 * express the structured half of the seam, and widening the call sites with a cast would hide exactly
 * the type the structured tests are there to exercise.
 */
function request<OutputSchema extends ZodType | undefined = undefined>(
	overrides: Partial<AgentRunRequest<OutputSchema>> = {},
): AgentRunRequest<OutputSchema> {
	return {
		agentName: AgentName.ISSUE_WORK,
		cwd: '/work/thread-1',
		messages: [{ role: AgentMessageRole.USER, content: 'reply with PONG' }],
		binaryPath: '/usr/local/bin/codex',
		...overrides,
	} as AgentRunRequest<OutputSchema>
}

async function drain<OutputSchema extends ZodType | undefined = undefined>(
	runner: CodexAgentRunner,
	req: AgentRunRequest<OutputSchema> = request<OutputSchema>(),
): Promise<AgentRuntimeEvent[]> {
	const events: AgentRuntimeEvent[] = []
	for await (const event of runner.run(req)) events.push(event)
	return events
}

const runnerWith = (spawner: ReturnType<typeof fakeSpawner>['spawner'], inactivityMs = 60_000): CodexAgentRunner =>
	CodexAgentRunner.withOptions(new SilentLogging(), identities(), { spawner, inactivityMs })

describe('CodexAgentRunner.run — a completed turn', () => {
	it('emits the frames, then ONE finished event carrying the reply', async () => {
		const events = await drain(runnerWith(fakeSpawner([capture('s1-text.jsonl')]).spawner))

		const finished = events.filter(e => e.type === 'finished')
		expect(finished).toHaveLength(1)
		expect(finished[0]).toMatchObject({
			type: 'finished',
			result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'PONG', failed: false },
		})
		// The session id the run reports is codex's thread id, which is what a later resume needs.
		expect((finished[0] as { result: { sessionId: string | null } }).result.sessionId).toBe('01a04541-3924-75f1-9f7e-221f3f57cee8')
	})

	it('the finished event is LAST — a consumer can stop draining when it arrives', async () => {
		const events = await drain(runnerWith(fakeSpawner([capture('s1-text.jsonl')]).spawner))

		expect(events.at(-1)?.type).toBe('finished')
	})

	it('survives the stream arriving in arbitrary chunks — frames straddle the boundaries', async () => {
		const whole = capture('s1-text.jsonl')
		const mid = Math.floor(whole.length / 2)
		const split = await drain(runnerWith(fakeSpawner([whole.slice(0, mid), whole.slice(mid)]).spawner))

		expect(split.filter(e => e.type === 'finished')[0]).toMatchObject({ result: { replyText: 'PONG' } })
	})
})

describe('CodexAgentRunner.run — the process contract', () => {
	it('spawns with stdin CLOSED and never writes to it — the prompt rode in on argv', async () => {
		const fake = fakeSpawner([capture('s1-text.jsonl')])
		await drain(runnerWith(fake.spawner))

		// Measured: a run with stdin left open hung for three minutes; with stdin at EOF it finished in
		// ~8s. `stdin: false` is what the seam spells `'ignore'`.
		expect(fake.process().spec.stdin).toBe(false)
		expect(fake.process().writes).toEqual([])
	})

	it('puts the prompt LAST on argv, after the flags', async () => {
		const fake = fakeSpawner([capture('s1-text.jsonl')])
		await drain(runnerWith(fake.spawner), request({ messages: [{ role: AgentMessageRole.USER, content: 'the ask' }] }))

		expect(fake.process().spec.cmd.at(-1)).toBe('the ask')
		expect(fake.process().spec.cmd[0]).toBe('/usr/local/bin/codex')
	})

	it('the system prompt LEADS the single prompt string rather than becoming a separate turn', async () => {
		const fake = fakeSpawner([capture('s1-text.jsonl')])
		await drain(
			runnerWith(fake.spawner),
			request({ systemPrompt: 'you are terse', messages: [{ role: AgentMessageRole.USER, content: 'the ask' }] }),
		)

		expect(fake.process().spec.cmd.at(-1)).toBe('you are terse\n\nthe ask')
	})

	it('kills the process on the way out, however the run ended', async () => {
		const fake = fakeSpawner([capture('s1-text.jsonl')])
		await drain(runnerWith(fake.spawner))

		expect(fake.process().killed).toBe(true)
	})
})

describe('CodexAgentRunner.run — structured output', () => {
	const Decision = z.object({ decision: z.string(), title: z.string() })

	it('hands the CLI a schema FILE and parses the reply against the same schema', async () => {
		const fake = fakeSpawner([capture('s3-schema.jsonl')])
		const events = await drain(runnerWith(fake.spawner), request({ outputSchema: Decision }))

		const cmd = fake.process().spec.cmd
		const schemaPath = cmd[cmd.indexOf('--output-schema') + 1] as string
		expect(schemaPath.endsWith('schema.json')).toBe(true)

		expect(events.filter(e => e.type === 'finished')[0]).toMatchObject({
			result: { outcome: AgentRunOutcome.COMPLETED, failed: false, output: { decision: 'IGNORE', title: 'Login Button Broken' } },
		})
	})

	it('removes the scratch schema directory when the run ends', async () => {
		const fake = fakeSpawner([capture('s3-schema.jsonl')])
		await drain(runnerWith(fake.spawner), request({ outputSchema: Decision }))

		const cmd = fake.process().spec.cmd
		expect(existsSync(cmd[cmd.indexOf('--output-schema') + 1] as string)).toBe(false)
	})

	it('a reply that is not JSON is DATA on the terminal event, never a throw', async () => {
		// s1 answers `PONG` — correct prose, invalid against a schema. The drain must still complete.
		const events = await drain(runnerWith(fakeSpawner([capture('s1-text.jsonl')]).spawner), request({ outputSchema: Decision }))

		expect(events.filter(e => e.type === 'finished')[0]).toMatchObject({
			result: { outcome: AgentRunOutcome.COMPLETED, failed: true, failure: 'terminal reply text was not JSON' },
		})
	})
})

describe('CodexAgentRunner.run — endings that are not a completed turn', () => {
	it('a killed run has NO terminal event, so the verdict comes from the exit code', async () => {
		// `raw/s6-cancel.jsonl` is a real SIGKILL 25s into a turn: three complete lines, no
		// `turn.completed`, no `turn.failed`.
		const events = await drain(runnerWith(fakeSpawner([capture('s6-cancel.jsonl')], { exitCode: 137 }).spawner))

		expect(events.filter(e => e.type === 'finished')[0]).toMatchObject({
			result: { outcome: AgentRunOutcome.STOPPED, stop: { kind: 'SERVER_ERROR' } },
		})
	})

	it('the watchdog fires when the stream goes quiet, and the run still ends on ONE finished event', async () => {
		const fake = fakeSpawner([capture('s6-cancel.jsonl')], { hold: true })
		const events = await drain(runnerWith(fake.spawner, 40))

		expect(fake.process().killed).toBe(true)
		const finished = events.filter(e => e.type === 'finished')
		expect(finished).toHaveLength(1)
		expect(finished[0]).toMatchObject({ result: { outcome: AgentRunOutcome.STOPPED } })
	})

	it('an auth failure on stderr is diagnosed from TRANSPORT evidence, not from the reply', async () => {
		const events = await drain(
			runnerWith(fakeSpawner([capture('s6-cancel.jsonl')], { exitCode: 1, stderr: 'Please run codex login to continue' }).spawner),
		)

		expect(events.filter(e => e.type === 'finished')[0]).toMatchObject({
			result: { stop: { kind: 'AUTH_REQUIRED' } },
		})
	})

	it('FALSIFIER — a run whose REPLY merely talks about logging in is NOT an auth failure', async () => {
		// The reply text is deliberately excluded from the diagnosis: an inbound message can make the
		// model say anything, and a transport verdict must not be reachable from the model's own words.
		const events = await drain(runnerWith(fakeSpawner([capture('s1-text.jsonl')], { stderr: '' }).spawner))

		expect(events.filter(e => e.type === 'finished')[0]).toMatchObject({ result: { outcome: AgentRunOutcome.COMPLETED } })
	})

	it('a spawn that throws arrives as the terminal event, not as an exception', async () => {
		const runner = CodexAgentRunner.withOptions(new SilentLogging(), identities(), {
			spawner: () => {
				throw new Error('ENOENT')
			},
		})

		const events = await drain(runner)
		expect(events).toHaveLength(1)
		expect(events[0]).toMatchObject({ result: { outcome: AgentRunOutcome.STOPPED, stop: { kind: 'SERVER_ERROR' } } })
	})
})
