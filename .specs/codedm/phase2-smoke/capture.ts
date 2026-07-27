/**
 * FASE 2 — DECISION GATE SMOKE (GOAL-agent-abstraction.md §7 Fase 2, AC-2.1)
 *
 * Drives the REAL installed `claude` binary in the canonical bidirectional headless stream-json mode
 * from `.specs/codedm/2026-07-26-agent-driving-stream-json.md:14-25`, and captures the ACTUAL frame
 * stream the codec will depend on. NOTHING in this script parses on behalf of the codec — it only
 * records lines verbatim and tallies `type`/`subtype`.
 *
 * Run OUTSIDE the driving Claude Code session semantics: the child gets a scrubbed env (every var
 * prefixed CLAUDE / ANTHROPIC / CMUX removed) so the nested-invocation guard does not fire and the
 * child does not inherit the parent session's identity.
 *
 *   bun .specs/codedm/phase2-smoke/capture.ts
 *
 * Scenarios (each = one child process, one turn):
 *   S1 text        — system/init, assistant text, result           (baseline turn)
 *   S2 tool        — a real Read tool_use + its tool_result
 *   S3 subagent    — a `Task` sub-agent, to observe NON-NULL parent_tool_use_id
 *   S4 partial     — same as S1 but with --include-partial-messages (flag-existence probe)
 *
 * Structural turn-end under test: the script keeps stdin OPEN and only calls stdin.end() when it sees
 * the terminal frame. It records whether the child would otherwise hang — that is the measurement the
 * §4.3 rule 5 fold rule rests on.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = process.env.CODEDM_SMOKE_CLAUDE_BIN ?? '/Applications/cmux.app/Contents/Resources/bin/claude'
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'raw')
const TIMEOUT_MS = 240_000

/** Scrubbed env: no CLAUDE / ANTHROPIC / CMUX leakage from the driving session. HOME stays (auth lives there). */
function childEnv(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {}
	for (const [k, v] of Object.entries(process.env)) {
		if (k.startsWith('CLAUDE') || k.startsWith('ANTHROPIC') || k.startsWith('CMUX')) continue
		env[k] = v
	}
	return env
}

interface Scenario {
	readonly id: string
	readonly prompt: string
	readonly extraArgs: readonly string[]
	/** files seeded into the scratch cwd before the run */
	readonly seed?: Readonly<Record<string, string>>
}

const SCENARIOS: readonly Scenario[] = [
	{
		id: 's1-text',
		prompt: 'Reply with exactly the single word SMOKE-OK and nothing else. Do not use any tools.',
		extraArgs: [],
	},
	{
		id: 's2-tool',
		prompt:
			'Use the Read tool to read the file target.txt in the current directory, then reply with exactly the word it contains and nothing else.',
		extraArgs: [],
		seed: { 'target.txt': 'SMOKE-TOOL-OK\n' },
	},
	{
		id: 's3-subagent',
		prompt:
			'Use the Task tool to dispatch ONE general-purpose subagent whose entire task is: "Read the file target.txt in the current working directory and report the single word it contains." Do not read the file yourself. When the subagent returns, reply with exactly that word and nothing else.',
		extraArgs: [],
		seed: { 'target.txt': 'SMOKE-SUBAGENT-OK\n' },
	},
	{
		id: 's4-partial',
		prompt: 'Reply with exactly the single sentence: partial message streaming probe complete. Do not use any tools.',
		extraArgs: ['--include-partial-messages'],
	},
]

interface RunReport {
	readonly id: string
	readonly command: string
	readonly exitCode: number | null
	readonly signal: string | null
	readonly durationMs: number
	readonly lines: number
	readonly nonJsonLines: number
	readonly kinds: Record<string, number>
	/** true iff a terminal `result` frame was seen */
	readonly sawTerminal: boolean
	/** ms between the terminal frame and process exit — measures whether stdin.end() is what ends it */
	readonly msTerminalToExit: number | null
	/** did the process exit on its own BEFORE we closed stdin? */
	readonly exitedBeforeStdinEnd: boolean
	readonly stderr: string
}

async function runScenario(s: Scenario): Promise<RunReport> {
	const cwd = mkdtempSync(join(tmpdir(), `p2-${s.id}-`))
	for (const [name, body] of Object.entries(s.seed ?? {})) writeFileSync(join(cwd, name), body)

	const args = [
		'-p',
		'--input-format',
		'stream-json',
		'--output-format',
		'stream-json',
		'--verbose',
		'--permission-mode',
		'bypassPermissions',
		...s.extraArgs,
	]
	const command = `${BIN} ${args.join(' ')}`
	const rawPath = join(OUT_DIR, `${s.id}.jsonl`)
	writeFileSync(rawPath, '')

	const kinds: Record<string, number> = {}
	let lines = 0
	let nonJsonLines = 0
	let sawTerminal = false
	let terminalAt: number | null = null
	let stdinEnded = false
	let exitedBeforeStdinEnd = false
	let stderr = ''
	const startedAt = Date.now()

	const child = spawn(BIN, args, {
		cwd,
		env: childEnv(),
		stdio: ['pipe', 'pipe', 'pipe'],
		shell: false,
		detached: process.platform !== 'win32',
	})

	child.stdin.write(
		`${JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: s.prompt }] } })}\n`,
	)
	// stdin deliberately stays OPEN — closed only on the structural turn-end below.

	let buffer = ''
	child.stdout.setEncoding('utf8')
	child.stdout.on('data', (chunk: string) => {
		buffer += chunk
		let nl = buffer.indexOf('\n')
		while (nl !== -1) {
			const line = buffer.slice(0, nl)
			buffer = buffer.slice(nl + 1)
			nl = buffer.indexOf('\n')
			if (line.trim().length === 0) continue
			lines++
			appendFileSync(rawPath, `${line}\n`)
			let parsed: Record<string, unknown>
			try {
				parsed = JSON.parse(line) as Record<string, unknown>
			} catch {
				nonJsonLines++
				continue
			}
			const type = String(parsed.type ?? '<no-type>')
			const subtype = parsed.subtype === undefined ? '' : `/${String(parsed.subtype)}`
			const parent = 'parent_tool_use_id' in parsed ? (parsed.parent_tool_use_id === null ? ' [parent=null]' : ' [parent=SET]') : ' [no-parent-key]'
			const key = `${type}${subtype}${parent}`
			kinds[key] = (kinds[key] ?? 0) + 1
			if (type === 'result') {
				sawTerminal = true
				terminalAt = Date.now()
				stdinEnded = true
				child.stdin.end()
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

	const { code, signal } = await new Promise<{ code: number | null; signal: string | null }>((resolve) => {
		child.on('exit', (c, sig) => {
			if (!stdinEnded) exitedBeforeStdinEnd = true
			resolve({ code: c, signal: sig })
		})
	})
	clearTimeout(timer)

	return {
		id: s.id,
		command,
		exitCode: code,
		signal,
		durationMs: Date.now() - startedAt,
		lines,
		nonJsonLines,
		kinds,
		sawTerminal,
		msTerminalToExit: terminalAt === null ? null : Date.now() - terminalAt,
		exitedBeforeStdinEnd,
		stderr: stderr.slice(0, 4000),
	}
}

mkdirSync(OUT_DIR, { recursive: true })
const reports: RunReport[] = []
for (const s of SCENARIOS) {
	process.stdout.write(`\n=== ${s.id} ===\n`)
	const r = await runScenario(s)
	reports.push(r)
	process.stdout.write(`${JSON.stringify(r, null, 2)}\n`)
}
writeFileSync(join(OUT_DIR, 'reports.json'), `${JSON.stringify(reports, null, 2)}\n`)
process.stdout.write(`\nwrote ${OUT_DIR}/reports.json\n`)
