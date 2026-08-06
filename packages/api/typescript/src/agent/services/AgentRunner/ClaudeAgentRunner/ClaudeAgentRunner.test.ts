/**
 * `ClaudeAgentRunner.run()` over a FAKE process (§8 rule 8 — no test ever spawns a real CLI).
 *
 * Covers AC-2.3 (structured-output failure surfaces as `failed: true` and the stream still drains to
 * the end), the structural turn-end of §4.3 rule 5 including the `stdin.end()` that actually ends the
 * turn, the sub-agent case AS AMENDED (the risk is the run NEVER closing, not a sub-agent closing it
 * early), and the inactivity watchdog backstop.
 */
import { describe, it, expect } from 'bun:test'
import { z } from 'zod'
import { MockLoggingService } from '@codm/core-typescript'
import { AgentMessageRole, AgentName } from '../../../enums'
import { AgentMessageEvent, AgentToolCallEvent, AgentUsageEvent } from '../../../events'
import { AgentRunOutcome } from '../../../enums'
import type { AgentRunRequest, AgentRuntimeEvent } from '../../../types'
import type { AgentProcess, AgentProcessSpec } from './AgentProcess'
import { ClaudeAgentRunner } from './ClaudeAgentRunner'
// The real token service, not a double: it is a Map with a clock, so a stub would only be a second
// implementation of the thing under test. Every agent takes one now because the base MINTS in `run()`.
import { InMemoryAgentIdentityService } from '@codm/core-typescript'

// ── A fake process: canned stdout, observable stdin ───────────────────────────────────────────────

interface FakeProcess extends AgentProcess {
	readonly spec: AgentProcessSpec
	readonly writes: string[]
	stdinClosedAfter: number | null
	killed: boolean
}

/**
 * Emits `lines` one chunk at a time, recording how many had been emitted when stdin was closed. That
 * counter is what makes "the turn ended at the terminal frame" an assertion rather than a claim.
 *
 * `hold` keeps stdout open forever after the lines run out — the shape that provokes the watchdog.
 */
function fakeSpawner(lines: string[], options: { hold?: boolean; exitCode?: number; stderr?: string } = {}) {
	let created: FakeProcess | undefined
	const spawner = (spec: AgentProcessSpec): AgentProcess => {
		let emitted = 0
		const proc: FakeProcess = {
			spec,
			writes: [],
			stdinClosedAfter: null,
			killed: false,
			stdout: (async function* () {
				for (const line of lines) {
					// Incremented BEFORE the yield so the counter reads "lines emitted INCLUDING the one
					// being consumed right now" — otherwise the generator sits suspended at the yield and
					// every reading is one behind the chunk the runner is actually acting on.
					emitted++
					yield line
				}
				if (options.hold) await new Promise<void>(() => {}) // never resolves; the watchdog must fire
			})(),
			stderr: (async function* () {
				if (options.stderr) yield options.stderr
			})(),
			write(chunk) {
				proc.writes.push(chunk)
			},
			endStdin() {
				if (proc.stdinClosedAfter === null) proc.stdinClosedAfter = emitted
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

function makeRunner(spawner: ReturnType<typeof fakeSpawner>['spawner'], inactivityMs = 60_000): ClaudeAgentRunner {
	return ClaudeAgentRunner.withOptions(new MockLoggingService(), new InMemoryAgentIdentityService(), { spawner, inactivityMs })
}

const request = (overrides: Partial<AgentRunRequest<z.ZodType | undefined>> = {}): AgentRunRequest<z.ZodType | undefined> => ({
	agentName: AgentName.ISSUE_WORK,
	cwd: '/tmp/workspace',
	messages: [{ role: AgentMessageRole.USER, content: 'do the thing' }],
	...overrides,
})

async function drain(events: AsyncIterable<AgentRuntimeEvent>): Promise<AgentRuntimeEvent[]> {
	const collected: AgentRuntimeEvent[] = []
	for await (const event of events) collected.push(event)
	return collected
}

// ── Canned frames, shaped from `.specs/codedm/phase2-smoke/raw/` ─────────────────────────────────

const line = (value: unknown): string => `${JSON.stringify(value)}\n`

const INIT = line({ type: 'system', subtype: 'init', session_id: 'sess-1', model: 'claude-opus-5[1m]' })
const HOOK = line({ type: 'system', subtype: 'hook_started', hook_name: 'SessionStart:startup' })
const TEXT = line({
	type: 'assistant',
	message: { id: 'msg_1', role: 'assistant', content: [{ type: 'text', text: 'SMOKE-OK' }] },
	parent_tool_use_id: null,
})
const usage = { input_tokens: 2, cache_creation_input_tokens: 9188, cache_read_input_tokens: 15273, output_tokens: 10 }
const RESULT = line({
	type: 'result',
	subtype: 'success',
	is_error: false,
	stop_reason: 'end_turn',
	result: 'SMOKE-OK',
	session_id: 'sess-1',
	usage,
})

describe('ClaudeAgentRunner — the happy turn', () => {
	it('yields frames, facts and exactly ONE finished event, with finished LAST', async () => {
		const { spawner } = fakeSpawner([INIT, HOOK, TEXT, RESULT])

		const events = await drain(makeRunner(spawner).run(request()))

		expect(events.filter(e => e.type === 'finished')).toHaveLength(1)
		expect(events.at(-1)?.type).toBe('finished')
		expect(events.filter(e => e.type === 'frame').map(e => (e as { frame: { kind: string } }).frame.kind)).toEqual([
			'system_init',
			'assistant_text',
			'result',
		])
	})

	it('folds the transcript and the terminal usage aggregate into domain facts', async () => {
		const { spawner } = fakeSpawner([INIT, TEXT, RESULT])

		const facts = (await drain(makeRunner(spawner).run(request()))).filter(e => e.type === 'fact').map(e => (e as { fact: unknown }).fact)

		expect(facts[0]).toBeInstanceOf(AgentMessageEvent)
		expect(facts[1]).toBeInstanceOf(AgentUsageEvent)
		expect((facts[1] as AgentUsageEvent).payload).toEqual({
			inputTokens: 2,
			outputTokens: 10,
			cacheCreationInputTokens: 9188,
			cacheReadInputTokens: 15273,
		})
	})

	it('reports COMPLETED with the terminal reply text and the session id', async () => {
		const { spawner } = fakeSpawner([INIT, TEXT, RESULT])

		const finished = (await drain(makeRunner(spawner).run(request()))).at(-1)

		expect(finished).toMatchObject({
			type: 'finished',
			result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'SMOKE-OK', sessionId: 'sess-1', failed: false },
		})
	})

	it('writes the turn to stdin as stream-json JSONL, one line per message', async () => {
		const fake = fakeSpawner([INIT, TEXT, RESULT])

		await drain(
			makeRunner(fake.spawner).run(
				request({ systemPrompt: 'be terse', messages: [{ role: AgentMessageRole.USER, content: 'do the thing' }] }),
			),
		)

		expect(JSON.parse(fake.process().writes.join('').trim())).toEqual({
			type: 'user',
			message: { role: 'user', content: 'be terse\n\ndo the thing' },
		})
	})

	it('an outputSchema puts a JSON-only directive carrying the derived JSON Schema on the LAST stdin line', async () => {
		const fake = fakeSpawner([INIT, TEXT, RESULT])
		const schema = z.object({ decision: z.string(), confidence: z.number().nullish() })

		await drain(
			makeRunner(fake.spawner).run(request({ messages: [{ role: AgentMessageRole.USER, content: 'route this' }], outputSchema: schema })),
		)

		const written = fake.process().writes.join('').trim()
		const content = (JSON.parse(written) as { message: { content: string } }).message.content
		expect(content.startsWith('route this')).toBe(true)
		expect(content).toContain('exactly ONE JSON object')
		// The SCHEMA itself travels, derived from the same Zod object that validates the reply — one
		// source of truth, rather than a prose paraphrase that drifts.
		expect(content).toContain(JSON.stringify(z.toJSONSchema(schema)))
	})

	it('a run WITHOUT an outputSchema carries no directive — the switch is the field, and it is off', async () => {
		const fake = fakeSpawner([INIT, TEXT, RESULT])

		await drain(makeRunner(fake.spawner).run(request({ messages: [{ role: AgentMessageRole.USER, content: 'just work' }] })))

		expect(fake.process().writes.join('')).not.toContain('exactly ONE JSON object')
	})

	it('builds its own argv — there is no provider to branch on, and no def to look up', async () => {
		const fake = fakeSpawner([INIT, TEXT, RESULT])

		await drain(makeRunner(fake.spawner).run(request({ binaryPath: '/opt/bin/claude', session: { resumeId: 'sess-prev' } })))

		const cmd = fake.process().spec.cmd
		expect(cmd[0]).toBe('/opt/bin/claude')
		expect(cmd).toContain('--output-format')
		expect(cmd).toContain('stream-json')
		expect(cmd.slice(cmd.indexOf('--resume'))[1]).toBe('sess-prev')
		// Capability-gated: `caps` was not threaded, so the optional flag must NOT be passed.
		expect(cmd).not.toContain('--include-partial-messages')
		// Bidirectional: stdin is OPEN at spawn, because the turn IS a stream and closing it is the act
		// that ends the turn. This used to read `def.promptViaStdin`; it is now simply what this CLI is.
		expect(fake.process().spec.stdin).toBe(true)
	})

	it('falls back to its OWN binary name when detection resolved no path', async () => {
		const fake = fakeSpawner([INIT, TEXT, RESULT])

		await drain(makeRunner(fake.spawner).run(request()))

		// `ClaudeAgentRunner.binary.bin` — the same static `ProviderDetector` probes with, so the name
		// this class spawns and the name the detector looks for cannot drift apart.
		expect(fake.process().spec.cmd[0]).toBe(ClaudeAgentRunner.binary.bin)
	})

	it('passes a capability-gated flag only once the probe reported it', async () => {
		const fake = fakeSpawner([INIT, TEXT, RESULT])

		await drain(makeRunner(fake.spawner).run(request({ caps: { partialMessages: true } })))

		expect(fake.process().spec.cmd).toContain('--include-partial-messages')
	})
})

describe('ClaudeAgentRunner — turn-end is STRUCTURAL (§4.3 rule 5)', () => {
	it('closes stdin exactly at the terminal result frame — the act that ends the turn', async () => {
		const fake = fakeSpawner([INIT, HOOK, TEXT, RESULT])

		await drain(makeRunner(fake.spawner).run(request()))

		// Four lines emitted, and stdin closed once the FOURTH (the result) had been consumed. The
		// measured counterfactual: holding stdin open left a real child alive 17358ms later.
		expect(fake.process().stdinClosedAfter).toBe(4)
	})

	it('does NOT close the turn on stopReason TOOL_USE — the model is mid-loop', async () => {
		// UNFALSIFIED, not measured: `stop_reason` was null on every assistant frame of the corpus and
		// no TOOL_USE result frame could be provoked. Kept as cheap defence; must never be reported as
		// a measured behaviour.
		const TOOL_USE_RESULT = line({ type: 'result', subtype: 'success', stop_reason: 'tool_use', result: '', usage })
		const fake = fakeSpawner([INIT, TOOL_USE_RESULT, TEXT, RESULT])

		await drain(makeRunner(fake.spawner).run(request()))

		// Not 2 — the TOOL_USE frame left the turn open; the END_TURN frame at position 4 closed it.
		expect(fake.process().stdinClosedAfter).toBe(4)
	})

	it('a sub-agent doing a full tool cycle does not end the run, and does not pollute the facts', async () => {
		// The AMENDED risk (D1): a sub-agent emits NO result frame at all, so the danger is the run
		// never closing, not a sub-agent closing it early. Scope is keyed on `parent_tool_use_id`.
		const SUB = 'toolu_01WpAVhnCvdR8Ywmh4rK4jed'
		const subToolUse = line({
			type: 'assistant',
			message: { id: 'msg_sub', content: [{ type: 'tool_use', id: 'toolu_inner', name: 'Read', input: {} }] },
			parent_tool_use_id: SUB,
		})
		const subToolResult = line({
			type: 'user',
			message: { content: [{ tool_use_id: 'toolu_inner', type: 'tool_result', content: 'inner' }] },
			parent_tool_use_id: SUB,
		})
		const parentToolUse = line({
			type: 'assistant',
			message: { id: 'msg_p', content: [{ type: 'tool_use', id: SUB, name: 'Agent', input: {} }] },
			parent_tool_use_id: null,
		})
		const parentToolResult = line({
			type: 'user',
			message: { content: [{ tool_use_id: SUB, type: 'tool_result', content: [{ type: 'text', text: 'SMOKE' }] }] },
			parent_tool_use_id: null,
		})

		const fake = fakeSpawner([INIT, parentToolUse, subToolUse, subToolResult, parentToolResult, TEXT, RESULT])
		const events = await drain(makeRunner(fake.spawner).run(request()))

		// The run closed at the ONE result frame, position 7 — not at the sub-agent's work.
		expect(fake.process().stdinClosedAfter).toBe(7)

		const toolFacts = events
			.filter(e => e.type === 'fact')
			.map(e => (e as { fact: unknown }).fact)
			.filter(f => f instanceof AgentToolCallEvent)
		// Exactly the PARENT's call. The inner pair is transport-only; nothing is lost, because the
		// sub-agent's work is summarized in the parent's own tool_result.
		expect(toolFacts).toHaveLength(1)
		expect((toolFacts[0] as AgentToolCallEvent).payload).toMatchObject({ toolUseId: SUB })

		// And the sub-agent's frames were still OBSERVABLE — scoping suppresses facts, not transport.
		const frames = events.filter(e => e.type === 'frame').map(e => (e as { frame: { kind: string } }).frame)
		expect(frames.filter(f => f.kind === 'tool_use')).toHaveLength(2)
	})

	it('materializes a tool_use left open when the turn ended as a FAILED fact', async () => {
		const orphan = line({
			type: 'assistant',
			message: { id: 'm', content: [{ type: 'tool_use', id: 'toolu_orphan', name: 'Bash', input: {} }] },
			parent_tool_use_id: null,
		})
		const { spawner } = fakeSpawner([INIT, orphan, RESULT])

		const events = await drain(makeRunner(spawner).run(request()))

		const toolFact = events
			.filter(e => e.type === 'fact')
			.map(e => (e as { fact: unknown }).fact)
			.find(f => f instanceof AgentToolCallEvent) as AgentToolCallEvent
		expect(toolFact.payload).toMatchObject({ toolUseId: 'toolu_orphan', status: 'FAILED' })
	})
})

describe('ClaudeAgentRunner — structured output NEVER throws mid-drain (AC-2.3)', () => {
	const DecisionSchema = z.object({ decision: z.enum(['MATCH_ISSUE', 'NEW_ISSUE']), confidence: z.number() })

	const jsonResult = (text: string): string =>
		line({ type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: text, session_id: 'sess-1', usage })

	it('returns the validated object on the terminal event when the reply parses', async () => {
		const { spawner } = fakeSpawner([INIT, jsonResult('{"decision":"NEW_ISSUE","confidence":0.9}')])

		const finished = (await drain(makeRunner(spawner).run(request({ outputSchema: DecisionSchema })))).at(-1)

		expect(finished).toMatchObject({ type: 'finished', result: { failed: false, output: { decision: 'NEW_ISSUE', confidence: 0.9 } } })
	})

	it('a SCHEMA violation becomes failed:true — it does not throw, and the stream still drains fully', async () => {
		const { spawner } = fakeSpawner([INIT, TEXT, jsonResult('{"decision":"TELEPORT","confidence":"high"}')])

		// If this threw, the `for await` inside `drain` would reject and the test would fail here.
		const events = await drain(makeRunner(spawner).run(request({ outputSchema: DecisionSchema })))

		const finished = events.at(-1) as { type: 'finished'; result: { failed: boolean; failure?: string; output?: unknown } }
		expect(finished.result.failed).toBe(true)
		expect(finished.result.failure).toBeDefined()
		expect(finished.result.output).toBeUndefined()

		// FULL DRAIN — every frame before the failure still arrived, and the count proves it: the
		// consumer is never left holding a half-consumed stream.
		expect(events.filter(e => e.type === 'frame')).toHaveLength(3)
		expect(events.filter(e => e.type === 'fact').length).toBeGreaterThan(0)
		expect(events.filter(e => e.type === 'finished')).toHaveLength(1)
	})

	it('a reply that is not JSON at all also becomes failed:true rather than throwing', async () => {
		const { spawner } = fakeSpawner([INIT, jsonResult('I could not decide, sorry.')])

		const finished = (await drain(makeRunner(spawner).run(request({ outputSchema: DecisionSchema })))).at(-1)

		expect(finished).toMatchObject({ type: 'finished', result: { failed: true, failure: 'terminal reply text was not JSON' } })
	})

	it('does not validate — and never reports failed — when no outputSchema was asked for', async () => {
		const { spawner } = fakeSpawner([INIT, jsonResult('not json')])

		const finished = (await drain(makeRunner(spawner).run(request()))).at(-1)

		expect(finished).toMatchObject({ type: 'finished', result: { failed: false } })
	})
})

describe('ClaudeAgentRunner — transport stops and the watchdog backstop', () => {
	it('kills the run and reports SERVER_ERROR when the child goes silent', async () => {
		const fake = fakeSpawner([INIT, TEXT], { hold: true })

		const finished = (await drain(makeRunner(fake.spawner, 25).run(request()))).at(-1)

		expect(finished).toMatchObject({ type: 'finished', result: { outcome: AgentRunOutcome.STOPPED, stop: { kind: 'SERVER_ERROR' } } })
		// A codec that misses the turn-end LEAKS a live process; the watchdog is what makes that bounded.
		expect(fake.process().killed).toBe(true)
	})

	it('a terminal frame that already closed the turn WINS over a watchdog that fires later (race)', async () => {
		// The terminal RESULT frame arrives and closes the turn structurally (stdin.end() fires), but
		// the child then lingers with zero further output — exactly the measured counterfactual from
		// `stdin-hold-control.json` (17.4s alive, no further frames). The watchdog still fires (it has
		// to, to bound the process), but a structurally-closed turn must win the classification: the
		// watchdog is a backstop for a turn that NEVER closes, not license to reclassify one that did.
		const fake = fakeSpawner([INIT, TEXT, RESULT], { hold: true })

		const finished = (await drain(makeRunner(fake.spawner, 25).run(request()))).at(-1)

		expect(finished).toMatchObject({ type: 'finished', result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'SMOKE-OK' } })
		// The watchdog still had to fire and kill the lingering child — it just must not win the verdict.
		expect(fake.process().killed).toBe(true)
	})

	it('reports AUTH_REQUIRED — a TRANSPORT stop a run with no tools can still produce', async () => {
		const { spawner } = fakeSpawner([INIT], { exitCode: 1, stderr: 'Not logged in. Run /login to continue.' })

		const finished = (await drain(makeRunner(spawner).run(request()))).at(-1)

		// The DOMAIN stops (APPROVAL_NEEDED, HUMAN_REQUESTED, BLOCKED_BY_CLASSIFICATION) are
		// unrepresentable here by TYPE — they can only ever come from a RaiseStop call.
		expect(finished).toMatchObject({ type: 'finished', result: { outcome: AgentRunOutcome.STOPPED, stop: { kind: 'AUTH_REQUIRED' } } })
	})

	it('does NOT classify AUTH_REQUIRED from auth-sounding ASSISTANT REPLY TEXT — transport signals decide', async () => {
		// The exact injection surface the judge flagged: the model's own words (or an inbound message
		// that asks it to say this) must never manufacture a transport stop. Transport signals here are
		// clean — is_error: false, no stderr, exit 0 — so a run that merely TALKS about logging in must
		// still be reported COMPLETED, not STOPPED.
		const AUTH_SOUNDING_RESULT = line({
			type: 'result',
			subtype: 'success',
			is_error: false,
			stop_reason: 'end_turn',
			result: 'Not logged in. Run /login to continue.',
			session_id: 'sess-1',
			usage,
		})
		const { spawner } = fakeSpawner([INIT, AUTH_SOUNDING_RESULT])

		const finished = (await drain(makeRunner(spawner).run(request()))).at(-1)

		expect(finished).toMatchObject({
			type: 'finished',
			result: { outcome: AgentRunOutcome.COMPLETED, replyText: 'Not logged in. Run /login to continue.', failed: false },
		})
	})

	it('reports SERVER_ERROR when the process dies without ever producing a terminal frame', async () => {
		const { spawner } = fakeSpawner([INIT], { exitCode: 127, stderr: 'command not found' })

		const finished = (await drain(makeRunner(spawner).run(request()))).at(-1)

		expect(finished).toMatchObject({ type: 'finished', result: { outcome: AgentRunOutcome.STOPPED, stop: { kind: 'SERVER_ERROR' } } })
	})

	/**
	 * O WATCHDOG MEDE AVANÇO, NÃO TAGARELICE.
	 *
	 * Medido em 2026-08-05: um turno ficou 8m12s parado esperando o classificador de permissão do
	 * provider responder, com o orçamento de inatividade em 3 minutos, e não foi morto. O relógio
	 * reiniciava a cada CHUNK de stdout, então qualquer byte que o CLI emitisse enquanto não progredia
	 * — retries, mensagens parciais — o mantinha vivo indefinidamente. O item do mailbox só voltou à
	 * fila quando o lease expirou, 20 minutos depois.
	 *
	 * O falsificador é exato: volte o reset para o chunk e este teste pendura, porque o spawner abaixo
	 * emite para sempre e nunca fecha um frame.
	 */
	it('mata um run que emite bytes sem nunca completar um frame', async () => {
		const spawner = (): AgentProcess => {
			let stop = false
			return {
				stdout: (async function* () {
					while (!stop) {
						// Meio de uma linha JSON: o codec bufferiza e NÃO entrega frame algum.
						yield new TextEncoder().encode('{"type":"assis')
						await new Promise(resolve => setTimeout(resolve, 10))
					}
				})(),
				stderr: (async function* () {})(),
				write: () => {},
				endStdin: () => {},
				kill: () => {
					stop = true
				},
				exited: Promise.resolve(0),
			}
		}

		const finished = (await drain(makeRunner(spawner, 60).run(request()))).at(-1) as {
			type: string
			result: { stop?: { detail: string } }
		}

		expect(finished.type).toBe('finished')
		expect(finished.result.stop?.detail).toContain('inactivity watchdog')
	}, 5_000)

	it('surfaces a spawn failure as the terminal event instead of throwing out of run()', async () => {
		const runner = ClaudeAgentRunner.withOptions(new MockLoggingService(), new InMemoryAgentIdentityService(), {
			spawner: () => {
				throw new Error('ENOENT')
			},
		})

		const events = await drain(runner.run(request()))

		expect(events).toHaveLength(1)
		expect(events[0]).toMatchObject({ type: 'finished', result: { outcome: AgentRunOutcome.STOPPED, stop: { kind: 'SERVER_ERROR' } } })
	})

	it('shutdown() kills whatever is still running', async () => {
		const fake = fakeSpawner([INIT, TEXT], { hold: true })
		const runner = makeRunner(fake.spawner, 20)
		await drain(runner.run(request()))

		await runner.shutdown()

		expect(fake.process().killed).toBe(true)
	})
})
