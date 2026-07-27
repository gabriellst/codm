/**
 * `generate()` is now a THIN ADAPTER over `AgentRunner.run()` (Fase 2, AC-2.6).
 *
 * The point of this suite is that the claim "behaviour visible to the app is unchanged" has a
 * SUBJECT. `generate()` kept its signature and its two named failure modes, but everything under it
 * was replaced: no more `claude -p --output-format json`, no more shrinking-window `extractJson`
 * scavenger. These tests pin both halves — the contract the caller sees, and the transport it now
 * rides on — so a regression in either is a red test rather than a discovery in production.
 *
 * No process is spawned: the `AgentRunner` is a real `StreamJsonAgentRunner` driven by a fake
 * process, so the assertions cover the actual adapter wiring rather than a mock of it.
 */
import { describe, it, expect } from 'bun:test'
import { z } from 'zod'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { BaseError, MockLoggingService } from '@codedm/core-typescript'
import { StreamJsonAgentRunner } from '../../AgentRunner'
import type { AgentProcess, AgentProcessSpec } from '../../AgentRunner/StreamJsonAgentRunner/AgentProcess'
import { ClaudeCliTerminalLLMRunner } from './ClaudeCliTerminalLLMRunner'

const DecisionSchema = z.object({ decision: z.enum(['MATCH_ISSUE', 'NEW_ISSUE']), confidence: z.number() })

const usage = { input_tokens: 2, cache_creation_input_tokens: 9188, cache_read_input_tokens: 15273, output_tokens: 10 }

function resultLine(text: string): string {
	return `${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, stop_reason: 'end_turn', result: text, session_id: 'sess-1', usage })}\n`
}

function harness(lines: string[], options: { exitCode?: number; stderr?: string } = {}) {
	let spec: AgentProcessSpec | undefined
	const writes: string[] = []
	const spawner = (received: AgentProcessSpec): AgentProcess => {
		spec = received
		return {
			spec: received,
			stdout: (async function* () {
				for (const l of lines) yield l
			})(),
			stderr: (async function* () {
				if (options.stderr) yield options.stderr
			})(),
			write: c => void writes.push(c),
			endStdin() {},
			kill() {},
			exited: Promise.resolve(options.exitCode ?? 0),
		} as AgentProcess
	}
	const agentRunner = new StreamJsonAgentRunner(new MockLoggingService(), { spawner, inactivityMs: 5_000 })
	return { runner: new ClaudeCliTerminalLLMRunner(agentRunner), spec: () => spec as AgentProcessSpec, writes }
}

const generateRequest = {
	provider: ProviderKind.CLAUDE_CODE,
	prompt: 'classify this',
	systemPrompt: 'you demultiplex messages',
	outputSchema: DecisionSchema,
	cwd: '/tmp/ws',
}

describe('ClaudeCliTerminalLLMRunner.generate — thin adapter over run() (AC-2.6)', () => {
	it('returns the schema-validated object, exactly as the old one-shot path did', async () => {
		const { runner } = harness([resultLine('{"decision":"NEW_ISSUE","confidence":0.82}')])

		await expect(runner.generate(generateRequest)).resolves.toEqual({ decision: 'NEW_ISSUE', confidence: 0.82 })
	})

	it('drives the CLI in STREAM-JSON now — not the old `-p --output-format json` one-shot', async () => {
		const h = harness([resultLine('{"decision":"NEW_ISSUE","confidence":1}')])

		await h.runner.generate(generateRequest)

		const cmd = h.spec().cmd
		// The transport really changed underneath the unchanged signature.
		expect(cmd).toContain('--input-format')
		expect(cmd.join(' ')).toContain('--output-format stream-json')
		expect(cmd).toContain('--verbose')
		// The prompt rides on STDIN as a JSONL user line, not on argv — which is what dodges E2BIG on a
		// long classification prompt and what keeps the turn open for more input.
		expect(cmd).not.toContain('classify this')
		expect(JSON.parse(h.writes.join('').trim())).toEqual({ type: 'user', message: { role: 'user', content: 'you demultiplex messages\n\nclassify this' } })
	})

	it('raises CLASSIFICATION_FAILED — the same named error — when the reply is not valid JSON', async () => {
		const { runner } = harness([resultLine('I am not sure')])

		// Note the layering: `run()` NEVER throws (§4.3 rule 4) and reports `failed: true` on its
		// terminal event; the ADAPTER is what turns that into this seam's named error. That is the whole
		// job of an adapter, and it is why `IssueClassifier` needs no change in this phase.
		await expect(runner.generate(generateRequest)).rejects.toThrow(BaseError)
		await expect(runner.generate(generateRequest)).rejects.toMatchObject({ name: 'CLASSIFICATION_FAILED' })
	})

	it('raises CLASSIFICATION_FAILED when the JSON parses but violates the schema', async () => {
		const { runner } = harness([resultLine('{"decision":"TELEPORT","confidence":"high"}')])

		await expect(runner.generate(generateRequest)).rejects.toMatchObject({ name: 'CLASSIFICATION_FAILED' })
	})

	it('raises TERMINAL_SPAWN_FAILED when the run ends in a transport stop', async () => {
		const { runner } = harness([], { exitCode: 127, stderr: 'command not found' })

		await expect(runner.generate(generateRequest)).rejects.toMatchObject({ name: 'TERMINAL_SPAWN_FAILED' })
	})

	it('fails NAMED rather than silently falling back to a private spawn when no AgentRunner is injected', async () => {
		// The PTY-engine suites construct this class bare; `generate()` must not quietly resurrect the
		// old one-shot path in that configuration.
		const bare = new ClaudeCliTerminalLLMRunner()

		await expect(bare.generate(generateRequest)).rejects.toMatchObject({ name: 'TERMINAL_SPAWN_FAILED' })
	})
})
