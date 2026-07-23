/**
 * Idle eviction (whatscode port, Fork B rekey).
 *
 * After the priming turn drains, wait past `CODEDM_IDLE_TIMEOUT_MS` and call `evictIdleNow()` to
 * trigger eviction synchronously. Asserts that `{ type: 'idle_evicted' }` lands on the lifecycle
 * bus (the domain-only `terminal.session.idle_evicted` fact per the wave-0 amendment).
 */
process.env.CODEDM_JSONL_POLL_MS = '20'
process.env.CODEDM_SUBMIT_DELAY_MS = '0'
process.env.CODEDM_BOOT_SETTLE_MS = '20'
process.env.CODEDM_IDLE_TIMEOUT_MS = '100'

import { testId } from '@test/support'
import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { sessionFilePath } from './transcript'
import { makeFakePty, makeInertProbePty, appendJsonl } from './testFakePty'

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
				message: { content: [{ type: 'text', text: 'Hello eviction stub' }] },
			})
			appendJsonl(transcriptPath, { type: 'system', subtype: 'turn_duration' })
		})
		queueMicrotask(() => pty.emitData('claude 2.x ready\r\n'))
		return pty
	},
}))

const { ClaudeCliTerminalLLMRunner } = await import('./ClaudeCliTerminalLLMRunner')
type LifecycleEvent = import('./ClaudeCliTerminalLLMRunner').RunnerLifecycleEvent

describe('ClaudeCliTerminalLLMRunner — idle eviction', () => {
	let projectsDir: string
	let cwd: string
	let runner: InstanceType<typeof ClaudeCliTerminalLLMRunner>

	beforeAll(() => {
		projectsDir = mkdtempSync(join(tmpdir(), 'codedm-projects-evict-'))
		cwd = mkdtempSync(join(tmpdir(), 'codedm-cwd-evict-'))
		process.env.CLAUDE_PROJECTS_DIR = projectsDir
		runner = new ClaudeCliTerminalLLMRunner()
	})

	afterAll(async () => {
		await runner.shutdown()
		rmSync(projectsDir, { recursive: true, force: true })
		rmSync(cwd, { recursive: true, force: true })
		delete process.env.CODEDM_IDLE_TIMEOUT_MS
	})

	it('after idle timeout, emits idle_evicted on the lifecycle bus', async () => {
		const issueId = testId('engine-eviction', 'issue')
		const lifecycle: LifecycleEvent[] = []
		const off = runner.onLifecycle(ev => lifecycle.push(ev))

		const stream = runner.stream({
			issueId,
			threadId: testId('engine-eviction', 'thread'),
			ownerId: 'tenant',
			provider: ProviderKind.CLAUDE_CODE,
			cwd,
			prompt: 'hi',
			systemPrompt: 'test',
			context: [],
		})
		for await (const ev of stream) {
			if (ev.type === 'turn_completed') break
		}

		await new Promise(r => setTimeout(r, 200))
		await runner.evictIdleNow()

		off()

		const evicted = lifecycle.find(e => e.type === 'idle_evicted')
		expect(evicted).toBeDefined()
		expect(evicted).toMatchObject({ type: 'idle_evicted', issueId })
		expect((evicted as { idleForMs: number }).idleForMs).toBeGreaterThanOrEqual(100)

		// The session left the map — next stream would cold-spawn.
		expect(await runner.getSession(issueId)).toBeNull()
	})
})
