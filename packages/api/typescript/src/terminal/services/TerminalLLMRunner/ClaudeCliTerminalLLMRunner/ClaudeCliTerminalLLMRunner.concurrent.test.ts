/**
 * Concurrent-write tests (whatscode port, Fork B rekey).
 *
 * Test 1 — In-flight lock: two concurrent `runner.stream(...)` calls for the same issueId must
 *   share a single spawn. The SessionMap.getOrCreate inflight lock ensures exactly one
 *   spawnClaude call.
 *
 * Test 2 — Bounded write queue: overflow is tested directly against `createWriteQueue` so the
 *   assertion is deterministic.
 */
process.env.CODEDM_JSONL_POLL_MS = '20'
process.env.CODEDM_SUBMIT_DELAY_MS = '0'
process.env.CODEDM_BOOT_SETTLE_MS = '20'

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { TerminalLLMRunnerBusyError, type TerminalLLMRunnerStreamRequest } from '../TerminalLLMRunner'
import type { TerminalRuntimeEvent } from '../types'
import { createWriteQueue } from './queue'
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
				message: { content: [{ type: 'text', text: 'Reply' }] },
			})
			appendJsonl(transcriptPath, { type: 'system', subtype: 'turn_duration' })
		})
		// Satisfy ClaudeBootSequence's "at least 1 byte during boot" guard.
		queueMicrotask(() => pty.emitData('claude 2.x ready\r\n'))
		return pty
	},
}))

// Import AFTER mock registration so the runner picks up the mocked spawner.
const { ClaudeCliTerminalLLMRunner } = await import('./ClaudeCliTerminalLLMRunner')

async function drainTurn(stream: AsyncIterable<TerminalRuntimeEvent>): Promise<void> {
	for await (const ev of stream) {
		if (ev.type === 'turn_completed') return
	}
}

describe('ClaudeCliTerminalLLMRunner — concurrent writes', () => {
	let projectsDir: string
	let cwd: string
	let runner: InstanceType<typeof ClaudeCliTerminalLLMRunner>

	beforeAll(() => {
		projectsDir = mkdtempSync(join(tmpdir(), 'codedm-projects-concurrent-'))
		cwd = mkdtempSync(join(tmpdir(), 'codedm-cwd-concurrent-'))
		spawnCallCount = 0
		process.env.CLAUDE_PROJECTS_DIR = projectsDir
		runner = new ClaudeCliTerminalLLMRunner()
	})

	afterAll(async () => {
		await runner.shutdown()
		rmSync(projectsDir, { recursive: true, force: true })
		rmSync(cwd, { recursive: true, force: true })
	})

	it('two concurrent stream() calls for the same issueId result in exactly one spawn (in-flight lock)', async () => {
		const issueId = '00000000-0000-4000-8000-00000000cc01'
		const reqBase: Omit<TerminalLLMRunnerStreamRequest, 'prompt'> = {
			issueId,
			threadId: '00000000-0000-4000-8000-00000000cc02',
			ownerId: 'tenant',
			provider: ProviderKind.CLAUDE_CODE,
			cwd,
			systemPrompt: 'test',
			context: [],
		}

		const spawnsBefore = spawnCallCount

		// Start both streams concurrently. Both race to getOrCreate — exactly one triggers the
		// factory (spawnSession); the other reuses the inflight promise. drainB is intentionally
		// started but not awaited: stream B shares the session created by stream A and its emit
		// callback is bound to whichever stream rebinds last — we only assert spawn isolation.
		const drainA = drainTurn(runner.stream({ ...reqBase, prompt: 'first' }))
		const _drainB = drainTurn(runner.stream({ ...reqBase, prompt: 'second' }))

		await drainA

		// Exactly one spawn regardless of how many concurrent callers raced.
		expect(spawnCallCount - spawnsBefore).toBe(1)

		// The session must be alive.
		const snap = await runner.getSession(issueId)
		expect(snap).not.toBeNull()
		expect(snap?.terminalSessionId).toBeTruthy()

		// Terminate the session so stream B's pending resources are released before afterAll.
		await runner.killSession(issueId)
	})

	it('a write that would overflow the bounded queue (depth 4) throws TerminalLLMRunnerBusyError', async () => {
		// The write queue is the sole unit responsible for the busy invariant; testing it directly
		// is the only deterministic path because stream()'s inline IIFE dequeues each item before
		// the next enqueue runs in normal usage.
		const issueId = '00000000-0000-4000-8000-00000000cc99'
		const q = createWriteQueue(issueId, 4)

		const pending: Promise<void>[] = []
		for (let i = 0; i < 4; i++) {
			const p = q.enqueue(`msg${i}`)
			p.catch(() => {}) // suppress unhandled rejection in test runner
			pending.push(p)
		}

		let threw: unknown = null
		try {
			await q.enqueue('overflow')
		} catch (e) {
			threw = e
		}

		expect(threw).toBeInstanceOf(TerminalLLMRunnerBusyError)
		expect((threw as TerminalLLMRunnerBusyError).message).toContain(issueId)
	})
})
