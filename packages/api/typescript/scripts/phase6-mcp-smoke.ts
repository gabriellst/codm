// ⚠️ ARTEFATO CONGELADO DA FASE 6 — NÃO COMPILA CONTRA O HEAD, e isso está registrado em vez de
// consertado. Mesma espécie do `phase3-smoke.ts`: é um REGISTRO pontual da única pergunta que só o
// CLI real responde, não um ponto de entrada mantido. Dois módulos que ele usa morreram depois:
// `migrateEmbeddedDatabase` (removido no T4, `37ea918c`) e `src/routers` (substituído pela
// composição explícita da W3 — `manifest.ts` + `compose.ts`). Reescrevê-lo agora apagaria o registro.
//
// Fica FORA do `tsconfig` por DECLARAÇÃO (o `exclude` daquele arquivo), e não mais por acidente: o
// `include` dizia `../scripts/**/*.ts` — um diretório que não existe — então NENHUM script deste
// pacote era type-checado. Re-rode-o portando para o caminho de boot atual na fase que precisar da
// evidência de novo.
/**
 * FASE 6 — AC-6.1 smoke: a REAL `claude` calling OUR MCP door.
 *
 * This is the ONE question only the real CLI can answer (§8 rule 8-bis): the literal spelling of our
 * tool name in the raw `tool_use` frame, and the `--allowedTools` string that actually made the call
 * work. Everything else in Fase 6 is proved deterministically (AC-6.2, AC-6.16) precisely so this
 * script only has to settle that one question.
 *
 * WHY IT BOOTS THE WHOLE DAEMON, unlike the Fase-3 smoke (`phase3-smoke.ts`), which explicitly did
 * NOT. The Fase-3 smoke avoided booting the daemon because reaching its HTTP test-ingress requires
 * `CODM_ENV=e2e`, and that same value swaps the real runner for a stub — the opposite of what that
 * smoke needed to prove. This smoke does not go through the agent pipeline or the test-ingress AT
 * ALL: it seeds an `Issue` directly via the repository (the `given*` helper pattern, never a use
 * case) and mints a run token directly via the SAME `RunTokenService` singleton the router verifies
 * against — both in-process, in the SAME script that boots the HTTP listener. `CODM_ENV` stays
 * unset (defaulting to `real`), so nothing is stubbed; the MCP router, the generated tool, the controller and the use case
 * are all the real production wiring. The only thing this script substitutes for is the `IssueWorkAgent`
 * itself minting the token — which is legitimate, because the claim this AC exists to verify is "does
 * a real `claude` process, given this MCP config, actually call this tool with this spelling", not
 * "does our own agent orchestration decide to call it".
 *
 * Run OUTSIDE the driving Claude Code session semantics: the child gets a scrubbed env (every var
 * prefixed CLAUDE / ANTHROPIC / CMUX removed) so the nested-invocation guard does not fire and the
 * child does not inherit the parent session's identity (same discipline as `phase2-smoke/capture.ts`
 * and `phase3-smoke.ts`).
 *
 *   cd packages/api/typescript
 *   CODM_DATA_DIR=<scratch> API_PORT=<free-port> NODE_ENV=development bun scripts/phase6-mcp-smoke.ts
 *
 * Exit code 0 = the tool call round-tripped and the issue reached COMPLETED. Non-zero =
 * ATTEMPT-FAILED; the report records the literal command, exit code and stderr, and §8 rule 8-bis
 * parks ONLY AC-6.1 (the deterministic substitute, AC-6.16, is unaffected).
 */
import 'reflect-metadata'
// src/boot.ts foi apagado: o lock virou uma chamada explicita em src/index.ts (passo 6).
// Este script e um REGISTRO congelado e ja nao compila contra o HEAD — a linha some para nao
// apontar para um arquivo que nao existe.
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, appendFileSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { container } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import {
	Config,
	MainRouter,
	openapi,
	Controller,
	HttpRouter,
	Middleware,
	Router,
	traceClass,
	OutboxDispatcher,
} from '@codm/core-typescript'
import { migrateEmbeddedDatabase } from '@shared/registry'
import { ProviderKind, IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { Issue } from '@issue/entities/Issue'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { AgentIdentityService } from '@codm/core-typescript'
import type { AgentRunIdentity } from '@agent/types/AgentRunIdentity'
import { AgentName } from '@agent/enums'
import { McpScope } from '@codm/contracts-typescript/wire/enums'
import { wireToolName, operationIdOf, TransitionIssueStatusController } from '@agent/mcp/exposure'
import { MCP_ROUTE_PREFIX } from '@agent/mcp/route'

const BIN = process.env.CODM_SMOKE_CLAUDE_BIN ?? '/Applications/cmux.app/Contents/Resources/bin/claude'
const SPEC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '.specs', 'codm', 'phase6-mcp-smoke')
const RAW_PATH = join(SPEC_DIR, 'raw', 'smoke.jsonl')
const REPORT_PATH = join(SPEC_DIR, 'raw', 'report.json')
const TIMEOUT_MS = 240_000

const TOOL_OPERATION = operationIdOf(TransitionIssueStatusController) // 'TransitionIssueStatus', derived — never a literal
const TOOL_WIRE = wireToolName(TOOL_OPERATION) // WIRE(C) = mcp__codm__TransitionIssueStatus, computed, never typed

interface Report {
	binary: string
	startedAt: string
	command: string
	mcpConfig: unknown
	allowedTools: string
	issueId: string
	threadId: string
	exitCode: number | null
	signal: string | null
	durationMs: number
	/** every `tool` field seen on a `tool_use` content block in the raw JSONL — the MEASURED spelling */
	measuredToolNames: string[]
	toolResultIsError: boolean | null
	issueStatusAfter: string | undefined
	verdict: 'OK' | 'ATTEMPT-FAILED'
	stderr?: string
	error?: string
}

/** Scrubbed env: no CLAUDE / ANTHROPIC / CMUX leakage from the driving (this very) session. */
function childEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {}
	for (const [k, v] of Object.entries(process.env)) {
		if (k.startsWith('CLAUDE') || k.startsWith('ANTHROPIC') || k.startsWith('CMUX')) continue
		env[k] = v
	}
	return env
}

async function main(): Promise<Report> {
	mkdirSync(dirname(RAW_PATH), { recursive: true })
	writeFileSync(RAW_PATH, '')

	// ── Boot the real daemon, in-process, exactly as src/index.ts does ──────────────────────────
	traceClass([Controller, HttpRouter, Middleware, Router, MainRouter])
	await migrateEmbeddedDatabase()
	const { ALL_ROUTERS } = await import('../src/routers')
	await openapi.generateSpecification(ALL_ROUTERS)
	// biome-ignore lint/suspicious/noExplicitAny: tsyringe-neo can't type an abstract class as an injection token.
	const mainRouter = new MainRouter({
		httpRouter: container.resolve(HttpRouter as any) as HttpRouter,
		routers: ALL_ROUTERS,
	})
	await mainRouter.start()

	// ── Seed a real Issue directly via the repository (given*-helper pattern, never a use case) ──
	const threadId = uuidv7()
	const issue = Issue.open({
		ownerId: MOCK_CLOUD_OWNER_ID,
		threadId,
		key: 'phase6-mcp-smoke',
		title: 'AC-6.1 real-claude MCP smoke',
		provider: ProviderKind.CLAUDE_CODE,
		status: IssueStatus.WORKING,
	})
	const issueRepo = container.resolve(IssueRepository)
	await issueRepo.save(issue)
	const issueId = issue.id.value

	// ── Issue a run credential — the SAME AgentIdentityService singleton instance the router resolves
	// against, because this script and the HTTP listener share one process. ────────────────────
	const identities = container.resolve<AgentIdentityService<AgentRunIdentity>>(AgentIdentityService)
	const token = identities.issue({
		ownerId: MOCK_CLOUD_OWNER_ID,
		issueId,
		threadId,
		agentName: AgentName.ISSUE_WORK,
		scope: McpScope.ISSUE_HANDLING,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000),
	})

	const endpoint = `http://127.0.0.1:${Config.env.API_PORT}${MCP_ROUTE_PREFIX}/issue-handling`
	const mcpConfig = { mcpServers: { codm: { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${token}` } } } }
	const allowedTools = TOOL_WIRE

	const args = [
		'-p',
		'--input-format',
		'stream-json',
		'--output-format',
		'stream-json',
		'--verbose',
		'--mcp-config',
		JSON.stringify(mcpConfig),
		'--allowedTools',
		allowedTools,
		'--permission-mode',
		'auto',
	]
	const command = `${BIN} -p --input-format stream-json --output-format stream-json --verbose --mcp-config <redacted-token> --allowedTools ${allowedTools} --permission-mode auto`

	const prompt = [
		'You are finishing automated work on an issue tracker.',
		`Call the tool named exactly "${TOOL_WIRE}" right now — do not use any other tool, do not ask questions, do not explain.`,
		`Call it with exactly these arguments: {"threadId": "${threadId}", "issueId": "${issueId}", "data": {"status": "COMPLETED", "summary": "phase6-mcp-smoke: completed via real claude MCP call"}}`,
		'After the tool call returns, reply with exactly the single word DONE and nothing else.',
	].join('\n')

	const cwd = mkdtempSync(join(tmpdir(), 'codm-phase6-mcp-smoke-'))

	const report: Report = {
		binary: BIN,
		startedAt: new Date().toISOString(),
		command,
		mcpConfig: { mcpServers: { codm: { type: 'http', url: endpoint, headers: { Authorization: 'Bearer <redacted>' } } } },
		allowedTools,
		issueId,
		threadId,
		exitCode: null,
		signal: null,
		durationMs: 0,
		measuredToolNames: [],
		toolResultIsError: null,
		issueStatusAfter: undefined,
		verdict: 'ATTEMPT-FAILED',
	}

	const startedAt = Date.now()
	let stderr = ''

	try {
		const { exitCode, signal } = await new Promise<{ exitCode: number | null; signal: string | null }>((resolve, reject) => {
			const child = spawn(BIN, args, {
				cwd,
				env: childEnv(),
				stdio: ['pipe', 'pipe', 'pipe'],
				shell: false,
				detached: process.platform !== 'win32',
			})

			child.on('error', reject)

			child.stdin.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: prompt }] } })}\n`)

			let buffer = ''
			let stdinEnded = false
			child.stdout.setEncoding('utf8')
			child.stdout.on('data', (chunk: string) => {
				buffer += chunk
				let nl = buffer.indexOf('\n')
				while (nl !== -1) {
					const line = buffer.slice(0, nl)
					buffer = buffer.slice(nl + 1)
					nl = buffer.indexOf('\n')
					if (line.trim().length === 0) continue
					appendFileSync(RAW_PATH, `${line}\n`)
					try {
						const parsed = JSON.parse(line) as Record<string, unknown>
						if (parsed.type === 'result' && !stdinEnded) {
							stdinEnded = true
							child.stdin.end()
						}
					} catch {
						// non-JSON line — recorded verbatim above, not parsed further
					}
				}
			})
			child.stderr.setEncoding('utf8')
			child.stderr.on('data', (c: string) => {
				stderr += c
			})

			const timer = setTimeout(() => {
				try {
					if (child.pid) process.kill(-child.pid, 'SIGKILL')
				} catch {
					child.kill('SIGKILL')
				}
			}, TIMEOUT_MS)

			child.on('exit', (code, sig) => {
				clearTimeout(timer)
				resolve({ exitCode: code, signal: sig })
			})
		})
		report.exitCode = exitCode
		report.signal = signal
	} catch (error) {
		report.error = String(error)
	}

	report.durationMs = Date.now() - startedAt
	report.stderr = stderr.slice(0, 4000)

	// ── Extract the MEASURED tool spelling from the raw JSONL — never from a decoded/typed frame,
	// so the number reflects exactly what the wire carried. ────────────────────────────────────
	const raw = readFileSync(RAW_PATH, 'utf8')
	for (const line of raw.split('\n')) {
		if (!line.trim()) continue
		let parsed: unknown
		try {
			parsed = JSON.parse(line)
		} catch {
			continue
		}
		const blocks = extractContentBlocks(parsed)
		for (const block of blocks) {
			if (block && typeof block === 'object' && (block as Record<string, unknown>).type === 'tool_use') {
				const name = (block as Record<string, unknown>).name
				if (typeof name === 'string') report.measuredToolNames.push(name)
			}
			if (block && typeof block === 'object' && (block as Record<string, unknown>).type === 'tool_result') {
				const isError = (block as Record<string, unknown>).is_error
				if (typeof isError === 'boolean') report.toolResultIsError = isError
			}
		}
	}

	// ── Verify the DB write really landed — the issue row after the run. ────────────────────────
	// The write happens inside a transaction that only saves the DOMAIN event; the integration event
	// (and the `issue` context's own `CompleteIssue` reacting to it) is dispatched by the outbox.
	// Force it rather than guessing at the adaptive poll interval, then poll briefly as a backstop.
	const outbox = container.resolve(OutboxDispatcher)
	let after = await issueRepo.findById(issueId)
	for (let attempt = 0; attempt < 25 && after?.status !== IssueStatus.COMPLETED; attempt++) {
		await outbox.flush().catch(() => undefined)
		await new Promise(resolve => setTimeout(resolve, 200))
		after = await issueRepo.findById(issueId)
	}
	report.issueStatusAfter = after?.status

	report.verdict =
		report.measuredToolNames.includes(TOOL_WIRE) && report.issueStatusAfter === IssueStatus.COMPLETED ? 'OK' : 'ATTEMPT-FAILED'

	await mainRouter.stop()
	return report
}

function extractContentBlocks(frame: unknown): unknown[] {
	if (!frame || typeof frame !== 'object') return []
	const message = (frame as Record<string, unknown>).message
	if (!message || typeof message !== 'object') return []
	const content = (message as Record<string, unknown>).content
	return Array.isArray(content) ? content : []
}

const report = await main().catch(error => {
	const fallback: Report = {
		binary: BIN,
		startedAt: new Date().toISOString(),
		command: '(failed before spawn)',
		mcpConfig: null,
		allowedTools: TOOL_WIRE,
		issueId: '',
		threadId: '',
		exitCode: null,
		signal: null,
		durationMs: 0,
		measuredToolNames: [],
		toolResultIsError: null,
		issueStatusAfter: undefined,
		verdict: 'ATTEMPT-FAILED',
		error: String(error),
	}
	return fallback
})

writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, '\t')}\n`)
console.log(JSON.stringify(report, null, 2))
process.exit(report.verdict === 'OK' ? 0 : 1)
