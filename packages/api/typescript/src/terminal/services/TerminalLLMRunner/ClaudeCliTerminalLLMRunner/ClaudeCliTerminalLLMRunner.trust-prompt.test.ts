/**
 * Trust-prompt auto-accept (whatscode port + D2 whitespace-squash gotcha).
 *
 * Claude prints the trust banner on first spawn per cwd. A headless runner can't show a dialog,
 * so the runner scans output for the prompt and replies with Enter BEFORE writing the first user
 * prompt. The banner is fed here in two flavors: the plain 2.x wording AND a cursor-motion-painted
 * variant whose spaces vanish after ANSI-stripping (the D2 spike observation) — both must match,
 * because ansi.ts compares against whitespace-SQUASHED text.
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

let lastPty: FakePty | null = null
// Toggled per test: 'spaced' emits the plain banner; 'squashed' emits the cursor-motion-painted
// variant (spaces lost after ANSI-strip).
let bannerMode: 'spaced' | 'squashed' = 'spaced'

const SPACED_BANNER =
	'Quick safety check: Is this a project you created or one you trust?\r\n' +
	' ❯ 1. Yes, I trust this folder\r\n' +
	'   2. No, exit\r\n' +
	'   Enter to confirm · Esc to cancel\r\n'

// What the D2 spike actually observed after stripping: cursor-motion spacing → concatenated words.
const SQUASHED_BANNER = 'Quicksafetycheck:Isthisaprojectyoucreatedoroneyoutrust?\r\n❯1.Yes,Itrustthisfolder\r\n'

mock.module(new URL('./spawner', import.meta.url).pathname, () => ({
	spawnPty: makeInertProbePty,
	spawnClaude(opts: { issueId: string; cwd: string; sessionId: string }) {
		const transcriptPath = sessionFilePath(opts.cwd, opts.sessionId)
		mkdirSync(dirname(transcriptPath), { recursive: true })
		writeFileSync(transcriptPath, '')
		const pty = makeFakePty(text => {
			// Ignore the trust-prompt `\r` accept — that's not a user turn.
			if (text === '\r') return
			appendJsonl(transcriptPath, {
				type: 'assistant',
				message: { content: [{ type: 'text', text: 'Trust ack — Hello' }] },
			})
			appendJsonl(transcriptPath, { type: 'system', subtype: 'turn_duration' })
		})
		lastPty = pty
		// Simulate the trust banner as the FIRST thing claude prints. Microtask so the runner's
		// pty.onData listeners are attached before we emit.
		queueMicrotask(() => pty.emitData(bannerMode === 'spaced' ? SPACED_BANNER : SQUASHED_BANNER))
		return pty
	},
}))

const { ClaudeCliTerminalLLMRunner } = await import('./ClaudeCliTerminalLLMRunner')

const request = (issueId: string, cwd: string): TerminalLLMRunnerStreamRequest => ({
	issueId,
	threadId: '00000000-0000-4000-8000-00000000ab02',
	ownerId: 'tenant',
	provider: ProviderKind.CLAUDE_CODE,
	cwd,
	prompt: 'hi',
	systemPrompt: 'test',
	context: [],
})

describe('ClaudeCliTerminalLLMRunner — trust-prompt auto-accept', () => {
	let projectsDir: string
	let cwd: string
	let runner: InstanceType<typeof ClaudeCliTerminalLLMRunner>

	beforeAll(() => {
		projectsDir = mkdtempSync(join(tmpdir(), 'codedm-projects-trust-'))
		cwd = mkdtempSync(join(tmpdir(), 'codedm-cwd-trust-'))
		process.env.CLAUDE_PROJECTS_DIR = projectsDir
		runner = new ClaudeCliTerminalLLMRunner()
	})

	beforeEach(() => {
		lastPty = null
	})

	afterAll(async () => {
		await runner.shutdown()
		rmSync(projectsDir, { recursive: true, force: true })
		rmSync(cwd, { recursive: true, force: true })
	})

	it('responds with `\\r` when the splash banner contains the trust prompt', async () => {
		bannerMode = 'spaced'
		const stream = runner.stream(request('00000000-0000-4000-8000-00000000ab11', cwd))
		for await (const ev of stream) if (ev.type === 'turn_completed') break

		expect(lastPty).not.toBeNull()
		// The first write to the PTY is the trust-accept Enter, before the user prompt.
		expect(lastPty?.writes[0]).toBe('\r')
		// The user prompt (fast path: one combined write) follows.
		expect(lastPty?.writes[1]).toBe('hi\r')
	})

	it('also matches the cursor-motion-painted banner (whitespace squashed — D2 gotcha)', async () => {
		bannerMode = 'squashed'
		const stream = runner.stream(request('00000000-0000-4000-8000-00000000ab22', cwd))
		for await (const ev of stream) if (ev.type === 'turn_completed') break

		expect(lastPty).not.toBeNull()
		expect(lastPty?.writes[0]).toBe('\r')
		expect(lastPty?.writes[1]).toBe('hi\r')
	})
})
