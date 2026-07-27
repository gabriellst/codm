/**
 * FASE 2 SMOKE — CONTROL EXPERIMENT for the structural turn-end rule (§4.3 rule 5).
 *
 * The fold rule says: the terminal frame closes the turn "and only then does stdin close". That is
 * only load-bearing if the child does NOT exit on its own while stdin is held open. This measures it:
 * we send one prompt, see the terminal `result` frame, and then DELIBERATELY DO NOT close stdin.
 *
 * Outcome recorded: whether the process is still alive N ms after the terminal frame, and whether it
 * emits anything further. If it stays alive, `stdin.end()` is genuinely the turn-ending act and the
 * inactivity watchdog is the correct backstop.
 *
 *   bun .specs/codedm/phase2-smoke/stdin-hold-control.ts
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BIN = process.env.CODEDM_SMOKE_CLAUDE_BIN ?? '/Applications/cmux.app/Contents/Resources/bin/claude'
const HOLD_MS = 20_000

const env: NodeJS.ProcessEnv = {}
for (const [k, v] of Object.entries(process.env)) {
	if (k.startsWith('CLAUDE') || k.startsWith('ANTHROPIC') || k.startsWith('CMUX')) continue
	env[k] = v
}

const cwd = mkdtempSync(join(tmpdir(), 'p2-hold-'))
const child = spawn(
	BIN,
	['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions'],
	{ cwd, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false, detached: process.platform !== 'win32' },
)

child.stdin.write(
	`${JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'Reply with exactly: HOLD-OK' }] } })}\n`,
)
// stdin intentionally NEVER closed.

let terminalAt: number | null = null
let framesAfterTerminal = 0
let exited = false
let exitCode: number | null = null
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
		try {
			const o = JSON.parse(line) as { type?: string }
			if (terminalAt !== null) framesAfterTerminal++
			if (o.type === 'result' && terminalAt === null) terminalAt = Date.now()
		} catch {
			/* non-JSON line — ignored, same as the codec must */
		}
	}
})
child.on('exit', (c) => {
	exited = true
	exitCode = c
})

await new Promise((r) => setTimeout(r, HOLD_MS))

const report = {
	holdMs: HOLD_MS,
	sawTerminalFrame: terminalAt !== null,
	msSinceTerminalFrame: terminalAt === null ? null : Date.now() - terminalAt,
	framesAfterTerminal,
	stillAliveWithStdinOpen: !exited,
	exitCodeIfExited: exitCode,
	verdict: exited
		? 'child EXITED on its own with stdin still open — stdin.end() is NOT what ends the turn'
		: 'child STAYED ALIVE with stdin open — stdin.end() is genuinely the turn-ending act',
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'raw', 'stdin-hold-control.json'), `${JSON.stringify(report, null, 2)}\n`)

// Process-group kill (spec migration recipe step 7) — also verifies it works.
try {
	if (child.pid) process.kill(-child.pid, 'SIGKILL')
} catch {
	child.kill('SIGKILL')
}
