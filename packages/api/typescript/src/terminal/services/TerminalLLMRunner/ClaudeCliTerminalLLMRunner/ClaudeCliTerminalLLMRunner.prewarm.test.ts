/**
 * Pre-warm tests (whatscode port, Fork B rekey).
 *
 * Test 1 — `prewarm` is a no-op when a session for the same issueId already exists in SessionMap.
 * Test 2 — `prewarm` boots a fresh session when none exists, registers it with `primed: false`,
 *   and emits NOTHING on the lifecycle bus. A subsequent `stream()` for the same issue reuses the
 *   session (no second spawn) and completes a regular turn via the queue path.
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
import type { TerminalLLMRunnerStreamRequest } from '../TerminalLLMRunner'
import { sessionFilePath } from './transcript'
import { makeFakePty, makeInertProbePty, appendJsonl } from './testFakePty'

let spawnCallCount = 0

mock.module(new URL('./spawner', import.meta.url).pathname, () => ({
	spawnPty: makeInertProbePty,
	spawnClaude(opts: { issueId: string; cwd: string; sessionId: string }) {
		spawnCallCount++
		const transcriptPath = sessionFilePath(opts.cwd, opts.sessionId)
		mkdirSync(dirname(transcriptPath), { recursive: true })
		writeFileSync(transcriptPath, '')
		const pty = makeFakePty(text => {
			if (text === '\r') return
			appendJsonl(transcriptPath, {
				type: 'assistant',
				message: { content: [{ type: 'text', text: 'pong' }] },
			})
			appendJsonl(transcriptPath, { type: 'system', subtype: 'turn_duration' })
		})
		// Emit boot bytes via queueMicrotask so ClaudeBootSequence's listeners are attached first.
		queueMicrotask(() => pty.emitData('claude 2.x ready\r\n'))
		return pty
	},
}))

const { ClaudeCliTerminalLLMRunner } = await import('./ClaudeCliTerminalLLMRunner')
type LifecycleEvent = import('./ClaudeCliTerminalLLMRunner').RunnerLifecycleEvent

const request = (issueId: string, cwd: string, prompt: string): TerminalLLMRunnerStreamRequest => ({
	issueId,
	threadId: testId('engine-prewarm', 'thread'),
	ownerId: 'tenant',
	provider: ProviderKind.CLAUDE_CODE,
	cwd,
	prompt,
	systemPrompt: 'sp',
	context: [],
})

describe('ClaudeCliTerminalLLMRunner — prewarm', () => {
	let projectsDir: string
	let cwd: string
	let runner: InstanceType<typeof ClaudeCliTerminalLLMRunner>

	beforeAll(() => {
		projectsDir = mkdtempSync(join(tmpdir(), 'codedm-projects-prewarm-'))
		cwd = mkdtempSync(join(tmpdir(), 'codedm-cwd-prewarm-'))
		process.env.CLAUDE_PROJECTS_DIR = projectsDir
		runner = new ClaudeCliTerminalLLMRunner()
	})

	beforeEach(() => {
		spawnCallCount = 0
	})

	afterAll(async () => {
		await runner.shutdown()
		rmSync(projectsDir, { recursive: true, force: true })
		rmSync(cwd, { recursive: true, force: true })
	})

	it('is a no-op when a session for the same issue already exists', async () => {
		const issueId = testId('engine-prewarm', 'issue-1')
		// First, spawn a real session via stream().
		const stream = runner.stream(request(issueId, cwd, 'hello'))
		for await (const ev of stream) if (ev.type === 'turn_completed') break
		const spawnsAfterStream = spawnCallCount

		// Now prewarm the SAME issue — should be a no-op.
		await runner.prewarm({ issueId, cwd, systemPrompt: 'sp' })
		expect(spawnCallCount).toBe(spawnsAfterStream)

		await runner.killSession(issueId)
	})

	it('boots a fresh session without a priming turn and without any lifecycle emission', async () => {
		const issueId = testId('engine-prewarm', 'issue-2')
		expect(spawnCallCount).toBe(0)

		const lifecycleEvents: LifecycleEvent[] = []
		const unsub = runner.onLifecycle(ev => lifecycleEvents.push(ev))

		await runner.prewarm({ issueId, cwd, systemPrompt: 'sp' })

		expect(spawnCallCount).toBe(1)
		// Pre-warm is invisible: nothing on the lifecycle bus (no spawned/killed/evicted).
		expect(lifecycleEvents).toHaveLength(0)

		// The session is now registered. A subsequent stream() must NOT spawn again (reuses the
		// prewarmed session) and must complete a regular turn via the queue path (primed=false).
		const stream = runner.stream(request(issueId, cwd, 'real'))
		let finished = false
		let resumed = false
		for await (const ev of stream) {
			if (ev.type === 'session' && ev.lifecycle === 'resumed') resumed = true
			if (ev.type === 'turn_completed') {
				finished = true
				break
			}
		}
		expect(finished).toBe(true)
		// Warm reuse surfaces as a `resumed` lifecycle runtime event on the stream.
		expect(resumed).toBe(true)
		expect(spawnCallCount).toBe(1) // no extra spawn

		unsub()
		await runner.killSession(issueId)
	})
})
