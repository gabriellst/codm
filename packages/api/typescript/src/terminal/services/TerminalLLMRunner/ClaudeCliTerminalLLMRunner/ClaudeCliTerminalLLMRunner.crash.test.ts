/**
 * Unexpected-PTY-exit detection (whatscode port, Fork B rekey).
 *
 * After the priming turn completes, force the fake PTY to exit. The runner's `pty.onExit` wiring
 * must:
 *   1. Emit `{ type: 'killed', reason: 'crash' }` via the lifecycle bus.
 *   2. Remove the session from `SessionMap` so the next `stream()` call spawns fresh.
 *   3. *Not* double-emit when `killSession` itself is what reaped the PTY.
 */
process.env.CODEDM_JSONL_POLL_MS = '20'
process.env.CODEDM_SUBMIT_DELAY_MS = '0'
process.env.CODEDM_BOOT_SETTLE_MS = '20'

import { describe, it, expect, beforeAll, beforeEach, afterAll, mock } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import type { TerminalLLMRunnerStreamRequest } from '../TerminalLLMRunner'
import { sessionFilePath } from './transcript'
import { makeFakePty, makeInertProbePty, appendJsonl, type FakePty } from './testFakePty'

let lastFakePty: FakePty | null = null

mock.module(new URL('./spawner', import.meta.url).pathname, () => ({
	spawnPty: makeInertProbePty,
	spawnClaude(opts: { issueId: string; cwd: string; sessionId: string }) {
		const transcriptPath = sessionFilePath(opts.cwd, opts.sessionId)
		mkdirSync(dirname(transcriptPath), { recursive: true })
		writeFileSync(transcriptPath, '')
		const pty = makeFakePty(text => {
			if (text === '\r') return
			appendJsonl(transcriptPath, {
				type: 'assistant',
				message: { content: [{ type: 'text', text: 'Hello' }] },
			})
			appendJsonl(transcriptPath, { type: 'system', subtype: 'turn_duration' })
		})
		lastFakePty = pty
		queueMicrotask(() => pty.emitData('claude 2.x ready\r\n'))
		return pty
	},
}))

const { ClaudeCliTerminalLLMRunner } = await import('./ClaudeCliTerminalLLMRunner')
type LifecycleEvent = import('./ClaudeCliTerminalLLMRunner').RunnerLifecycleEvent

const request = (issueId: string, cwd: string): TerminalLLMRunnerStreamRequest => ({
	issueId,
	threadId: '00000000-0000-4000-8000-00000000dd02',
	ownerId: 'tenant',
	provider: ProviderKind.CLAUDE_CODE,
	cwd,
	prompt: 'hello',
	systemPrompt: 'test',
	context: [],
})

describe('ClaudeCliTerminalLLMRunner — unexpected PTY exit', () => {
	let projectsDir: string
	let cwd: string
	let runner: InstanceType<typeof ClaudeCliTerminalLLMRunner>

	beforeAll(() => {
		projectsDir = mkdtempSync(join(tmpdir(), 'codedm-projects-crash-'))
		cwd = mkdtempSync(join(tmpdir(), 'codedm-cwd-crash-'))
		process.env.CLAUDE_PROJECTS_DIR = projectsDir
		runner = new ClaudeCliTerminalLLMRunner()
	})

	beforeEach(() => {
		lastFakePty = null
	})

	afterAll(async () => {
		await runner.shutdown()
		rmSync(projectsDir, { recursive: true, force: true })
		rmSync(cwd, { recursive: true, force: true })
	})

	it('PTY exit after a turn emits killed(reason=crash) on the lifecycle bus and removes the session', async () => {
		const issueId = '00000000-0000-4000-8000-00000000dd11'
		const lifecycle: LifecycleEvent[] = []
		const off = runner.onLifecycle(ev => lifecycle.push(ev))

		const stream = runner.stream(request(issueId, cwd))
		for await (const ev of stream) if (ev.type === 'turn_completed') break

		expect(await runner.getSession(issueId)).not.toBeNull()
		expect(lastFakePty).not.toBeNull()

		lastFakePty?.triggerExit(137)
		await new Promise(r => setTimeout(r, 50))

		const killed = lifecycle.find(e => e.type === 'killed')
		expect(killed).toBeDefined()
		expect(killed).toMatchObject({ type: 'killed', reason: 'crash', issueId })

		expect(await runner.getSession(issueId)).toBeNull()

		off()
	})

	it('explicit killSession does NOT cause a duplicate killed event from the exit handler', async () => {
		const issueId = '00000000-0000-4000-8000-00000000dd22'
		const lifecycle: LifecycleEvent[] = []
		const off = runner.onLifecycle(ev => lifecycle.push(ev))

		const stream = runner.stream(request(issueId, cwd))
		for await (const ev of stream) if (ev.type === 'turn_completed') break

		await runner.killSession(issueId)
		await new Promise(r => setTimeout(r, 50))

		const killedEvents = lifecycle.filter(e => e.type === 'killed')
		expect(killedEvents.length).toBe(1)
		expect(killedEvents[0]).toMatchObject({ reason: 'explicit' })

		off()
	})
})
