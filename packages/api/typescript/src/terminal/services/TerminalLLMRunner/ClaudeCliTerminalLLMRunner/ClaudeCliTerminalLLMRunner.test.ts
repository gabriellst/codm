/**
 * ClaudeCliTerminalLLMRunner — PTY + JSONL tail happy path (whatscode port, Fork B/D2 rekey).
 *
 * Strategy: mock `./spawner` so we never spawn a real `claude` (nor a real Bun.Terminal). The fake
 * `spawnClaude` receives the runner's pre-generated `sessionId`, creates an empty JSONL file at
 * the same path the runner will tail, and on each PTY write appends fake assistant +
 * `system/turn_duration` records — exactly what real claude writes when a turn completes. The
 * runner's tail picks those up and emits `reply` + `turn_completed` runtime events.
 */
process.env.CODEDM_JSONL_POLL_MS = '20'
process.env.CODEDM_SUBMIT_DELAY_MS = '0'
process.env.CODEDM_BOOT_SETTLE_MS = '20'

import { testId } from '@test/support'
import { describe, it, expect, beforeAll, beforeEach, afterAll, mock } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import type { TerminalRuntimeEvent } from '../types'
import type { TerminalLLMRunnerStreamRequest } from '../TerminalLLMRunner'
import { sessionFilePath } from './transcript'
import { makeFakePty, makeInertProbePty, appendJsonl, type FakePty } from './testFakePty'

let lastPty: FakePty | null = null
let lastTranscriptPath: string | null = null

mock.module(new URL('./spawner', import.meta.url).pathname, () => ({
	spawnPty: makeInertProbePty,
	spawnClaude(opts: { issueId: string; cwd: string; sessionId: string }) {
		const transcriptPath = sessionFilePath(opts.cwd, opts.sessionId)
		lastTranscriptPath = transcriptPath
		mkdirSync(dirname(transcriptPath), { recursive: true })
		writeFileSync(transcriptPath, '')

		const pty = makeFakePty(text => {
			// Each PTY write corresponds to one user turn. Append assistant text + turn_duration
			// records so the tail picks them up.
			if (text === '\r') return // trust-prompt accept; ignore
			appendJsonl(transcriptPath, {
				type: 'assistant',
				message: { content: [{ type: 'text', text: 'Hello from stub' }] },
			})
			appendJsonl(transcriptPath, { type: 'system', subtype: 'turn_duration' })
		})
		lastPty = pty
		// Satisfy ClaudeBootSequence's "at least 1 byte during boot" guard. queueMicrotask defers
		// the emit until after the runner attaches its pty.onData listener.
		queueMicrotask(() => pty.emitData('claude 2.x ready\r\n'))
		return pty
	},
}))

const { ClaudeCliTerminalLLMRunner } = await import('./ClaudeCliTerminalLLMRunner')

const baseRequest = (cwd: string): TerminalLLMRunnerStreamRequest => ({
	issueId: testId('engine-core', 'issue'),
	threadId: testId('engine-core', 'thread'),
	ownerId: 'tenant',
	provider: ProviderKind.CLAUDE_CODE,
	cwd,
	prompt: 'hi',
	systemPrompt: 'test',
	context: [],
})

describe('ClaudeCliTerminalLLMRunner — happy path (PTY + JSONL tail)', () => {
	let projectsDir: string
	let cwd: string
	let runner: InstanceType<typeof ClaudeCliTerminalLLMRunner>

	beforeAll(() => {
		projectsDir = mkdtempSync(join(tmpdir(), 'codedm-projects-'))
		cwd = mkdtempSync(join(tmpdir(), 'codedm-cwd-'))
		process.env.CLAUDE_PROJECTS_DIR = projectsDir
		runner = new ClaudeCliTerminalLLMRunner()
	})

	beforeEach(() => {
		lastPty = null
		lastTranscriptPath = null
	})

	afterAll(async () => {
		await runner.shutdown()
		rmSync(projectsDir, { recursive: true, force: true })
		rmSync(cwd, { recursive: true, force: true })
	})

	it('spawns claude, tails the JSONL transcript, yields session(spawned) → reply → turn_completed', async () => {
		const events: TerminalRuntimeEvent[] = []
		const stream = runner.stream(baseRequest(cwd))

		for await (const ev of stream) {
			events.push(ev)
			if (ev.type === 'turn_completed') break
		}

		expect(events[0]).toMatchObject({ type: 'session', lifecycle: 'spawned' })
		expect(events[events.length - 1]?.type).toBe('turn_completed')

		const reply = events.find(e => e.type === 'reply')
		expect(reply).toBeDefined()
		expect((reply as { type: 'reply'; text: string }).text).toContain('Hello from stub')

		// Sanity: the runner wrote the transcript to the cwd-encoded folder under
		// CLAUDE_PROJECTS_DIR (pitfall — encodeCwd must replace both `/` AND `.`).
		expect(lastTranscriptPath).toContain(projectsDir)
		expect(lastPty).not.toBeNull()
	})
})
