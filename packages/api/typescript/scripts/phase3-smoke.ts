// ⚠️ FROZEN FASE-3 ARTIFACT — DOES NOT COMPILE AGAINST HEAD, and that is recorded rather than fixed.
// It is a point-in-time smoke record (§8 rule 8: the only contact with a real CLI), not a maintained
// entry point: it is outside every tsconfig `include` and outside every gate. Two later phases moved
// under it — Fase 4.5 replaced `StreamJsonAgentRunner` with one runner class per CLI
// (`ClaudeAgentRunner`) and dropped `provider` from the request, and Fase 5 split `IssueClassifier`
// into `ClassifyIssueAgent` + `IssueRouter`. Fase 5 re-pointed the PATHS below with the `git mv` so
// the file still says where things live; it deliberately did not rewrite the run, because a smoke
// record edited after the fact stops being a record. Re-run it by porting to `ClaudeAgentRunner` +
// `IssueRouter` in the phase that next needs the evidence.
/**
 * FASE 3 — VERTICAL SMOKE (GOAL-agent-abstraction.md §7 Fase 3, AC-3.6 second half).
 *
 * Drives the REAL installed `claude` binary through the TWO CONSUMERS this phase migrated, in order,
 * with the real `StreamJsonAgentRunner` underneath both:
 *
 *   1. INBOUND → ISSUE  — `IssueClassifier.classify({ message })`. This is `run({ outputSchema })`:
 *      one spawn, one turn, the terminal frame's assistant text validated against `LlmDecisionSchema`.
 *      A `NEW_ISSUE` (or `CLARIFY`) decision proves the structured half of the seam end to end.
 *   2. ISSUE → REPLY    — `AgentRunner.run()` with NO `outputSchema` and NO `mcp`, in a scratch cwd,
 *      exactly as `RunIssueTurn` drives it. The `finished` event's `replyText` is the drafted reply,
 *      and the frames it yielded are what the SSE panel would have shown.
 *
 * WHY NOT THE WHOLE DAEMON: the HTTP test-ingress that seeds an inbound message is guarded by
 * `CODM_E2E=true`, and that same flag is what swaps `StreamJsonAgentRunner` out for the e2e stub
 * (`agent/registry.ts`). Booting the daemon to reach the ingress would therefore guarantee the CLI
 * is NEVER spawned — the opposite of what this smoke exists to prove. So the smoke drives the two
 * consumers directly, which is precisely the surface Fase 3 changed; the rest of the chain
 * (outbox → bridge → integration events → issue row) is covered deterministically by the runtime e2e.
 *
 * Run OUTSIDE the driving Claude Code session semantics: the child inherits a scrubbed env (every var
 * prefixed CLAUDE / ANTHROPIC / CMUX removed) so the nested-invocation guard does not fire.
 *
 *   cd packages/api/typescript && bun scripts/phase3-smoke.ts
 *
 * Exit code 0 = both legs observed. Non-zero = ATTEMPT-FAILED; the report records the literal error,
 * and §8 rule 8-bis then parks ONLY this half of AC-3.6 (the deterministic substitute is the runtime
 * e2e `04-inbound-issue.spec.ts` over `E2eStubAgentRunner`, which is not degradable).
 */
import 'reflect-metadata'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LoggingService } from '@codm/core-typescript'
import { ProviderKind } from '@codm/contracts-typescript/wire/enums'
import { StreamJsonAgentRunner } from '../src/agent/services/AgentRunner/StreamJsonAgentRunner/StreamJsonAgentRunner'
import { IssueClassifier } from '../src/agent/services/IssueClassifier/IssueClassifier'
import { TerminalOutputAccumulator } from '../src/agent/services/TerminalOutputAccumulator/TerminalOutputAccumulator'
import { AgentMessageRole, AgentName } from '../src/agent/enums'

const BIN = process.env.CODM_SMOKE_CLAUDE_BIN ?? '/Applications/cmux.app/Contents/Resources/bin/claude'
// The RECORD lives with the other phase artifacts in `.specs/`; the SCRIPT lives here because it
// imports workspace packages (`reflect-metadata`, `@codm/core-typescript`) that only resolve from
// inside this package's `node_modules` — the Fase-2 smoke could sit under `.specs/` only because it
// imported nothing but `node:*` and spawned the binary directly.
const OUT = join(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
	'..',
	'.specs',
	'codedm',
	'phase3-smoke',
	'raw',
	'vertical.json',
)
const INBOUND = 'the login button does nothing when I click it — please fix'

for (const key of Object.keys(process.env)) {
	if (key.startsWith('CLAUDE') || key.startsWith('ANTHROPIC') || key.startsWith('CMUX')) delete process.env[key]
}

interface Report {
	binary: string
	inbound: string
	startedAt: string
	classify?: { ok: boolean; decision?: unknown; durationMs: number; error?: string }
	reply?: { ok: boolean; outcome?: string; replyText?: string; frames: number; durationMs: number; error?: string }
	verdict: 'OK' | 'ATTEMPT-FAILED'
}

const report: Report = { binary: BIN, inbound: INBOUND, startedAt: new Date().toISOString(), verdict: 'ATTEMPT-FAILED' }

async function main(): Promise<number> {
	const runner = new StreamJsonAgentRunner(new LoggingService(), { inactivityMs: 240_000 })
	const cwd = mkdtempSync(join(tmpdir(), 'codedm-phase3-smoke-'))
	writeFileSync(join(cwd, 'README.md'), '# scratch workspace for the fase-3 smoke\n')

	// ── LEG 1: inbound → issue decision (structured output through the ONE seam) ────────────────
	const t1 = Date.now()
	try {
		// `binaryPath` is threaded exactly as `RunIssueTurn`/`ProviderDetector` thread it.
		const classifier = new IssueClassifier(withBinary(runner, BIN))
		const decision = await classifier.classify({ message: INBOUND, openIssues: [], provider: ProviderKind.CLAUDE_CODE })
		report.classify = { ok: true, decision, durationMs: Date.now() - t1 }
	} catch (error) {
		report.classify = { ok: false, durationMs: Date.now() - t1, error: String(error) }
		return 1
	}

	// ── LEG 2: issue → drafted reply (streaming, no outputSchema, no mcp) ───────────────────────
	const t2 = Date.now()
	const accumulator = new TerminalOutputAccumulator({ issueId: '00000000-0000-4000-8000-000000000001' })
	let frames = 0
	try {
		for await (const event of runner.run({
			agentName: AgentName.ISSUE_WORK,
			provider: ProviderKind.CLAUDE_CODE,
			cwd,
			binaryPath: BIN,
			messages: [
				{
					role: AgentMessageRole.USER,
					content: `${INBOUND}\n\nReply with one short sentence describing what you would do. Do not edit files.`,
				},
			],
		})) {
			if (event.type === 'frame') frames++
			accumulator.feed(event)
		}
		const outcome = accumulator.outcome()
		report.reply = {
			ok: outcome.kind === 'COMPLETED' && outcome.replyText.length > 0,
			outcome: outcome.kind,
			replyText: outcome.kind === 'COMPLETED' ? outcome.replyText : outcome.detail,
			frames,
			durationMs: Date.now() - t2,
		}
	} catch (error) {
		report.reply = { ok: false, frames, durationMs: Date.now() - t2, error: String(error) }
		return 1
	} finally {
		await runner.shutdown()
	}

	return report.reply.ok ? 0 : 1
}

/** The classifier owns no `binaryPath` field, so the smoke supplies one by wrapping the seam. */
function withBinary(runner: StreamJsonAgentRunner, binaryPath: string): StreamJsonAgentRunner {
	const wrapped = Object.create(runner) as StreamJsonAgentRunner
	wrapped.run = (request => runner.run({ ...request, binaryPath })) as StreamJsonAgentRunner['run']
	return wrapped
}

const code = await main().catch(error => {
	report.verdict = 'ATTEMPT-FAILED'
	report.reply ??= { ok: false, frames: 0, durationMs: 0, error: String(error) }
	return 1
})
report.verdict = code === 0 ? 'OK' : 'ATTEMPT-FAILED'
writeFileSync(OUT, `${JSON.stringify(report, null, '\t')}\n`)
console.log(JSON.stringify(report, null, 2))
process.exit(code)
