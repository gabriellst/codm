// Does claude 2.1.218 write the per-session JSONL live? Where?
const CLAUDE = '/Applications/cmux.app/Contents/Resources/bin/claude'
const { mkdtempSync, realpathSync, existsSync, readdirSync } = require('node:fs')
const { tmpdir, homedir } = require('node:os')
const { join } = require('node:path')
const { execSync } = require('node:child_process')

const projDir = mkdtempSync(join(tmpdir(), 'jsonl-exp-'))
const realDir = realpathSync(projDir)
const sessionId = crypto.randomUUID()
console.log(`[exp] projDir=${projDir}\n[exp] realDir=${realDir}\n[exp] sessionId=${sessionId}`)

function enc(p: string) {
	return p.replace(/[/.]/g, '-')
}
const candidates = [
	join(homedir(), '.claude', 'projects', enc(projDir)),
	join(homedir(), '.claude', 'projects', enc(realDir)),
]

const dec = new TextDecoder()
const frames: string[] = []
let notify: (() => void) | null = null
function squashed() {
	return frames
		.join('')
		.replace(/\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][A-Z0-9]/g, '')
		.replace(/\s+/g, '')
}
async function waitFor(pattern: RegExp, timeoutMs: number, label: string): Promise<boolean> {
	const start = Date.now()
	while (Date.now() - start < timeoutMs) {
		if (pattern.test(squashed())) return true
		await new Promise<void>(res => {
			notify = res
			setTimeout(res, 250)
		})
		notify = null
	}
	console.log(`[timeout] ${label}`)
	return false
}
function scan(label: string) {
	for (const dir of candidates) {
		const files = existsSync(dir) ? readdirSync(dir) : null
		console.log(`[scan:${label}] ${dir} → ${files ? JSON.stringify(files) : 'MISSING'}`)
	}
	try {
		const hits = execSync(`grep -rl "JSONL-PONG" ${homedir()}/.claude/projects 2>/dev/null | head -3`, { encoding: 'utf8' }).trim()
		if (hits) console.log(`[scan:${label}] grep hits:\n${hits}`)
	} catch {}
}

const env: Record<string, string> = { ...process.env } as any
delete env.CLAUDECODE
delete env.CLAUDE_CODE_ENTRYPOINT
delete env.CLAUDE_CODE_SSE_PORT
env.TERM = 'xterm-256color'

const terminal = new Bun.Terminal({
	cols: 120,
	rows: 40,
	data(_t: unknown, d: Uint8Array) {
		frames.push(dec.decode(d))
		notify?.()
	},
})
const proc = Bun.spawn([CLAUDE, '--dangerously-skip-permissions', '--session-id', sessionId], { cwd: projDir, env, terminal })

try {
	await waitFor(/(trustthisfolder|Yes,Itrust|forshortcuts|esctointerrupt|bypasspermissions|ctrl\+gtoeditinVim)/i, 30000, 'boot')
	if (/(trustthisfolder|Yes,Itrust)/i.test(squashed())) {
		terminal.write('\r')
		await waitFor(/(forshortcuts|esctointerrupt|bypasspermissions|ctrl\+gtoeditinVim)/i, 30000, 'main-ui')
	}
	scan('after-boot')
	terminal.write('\x1b[200~Reply with exactly JSONL-PONG and nothing else\x1b[201~')
	await new Promise(r => setTimeout(r, 600))
	terminal.write('\r')
	const done = await waitFor(/JSONL-PONG/i, 30000, 'response')
	console.log(`[exp] responded=${done}`)
	scan('right-after-response')
	await new Promise(r => setTimeout(r, 12000))
	scan('after-12s-wait')
} finally {
	terminal.write('\x04')
	await new Promise(r => setTimeout(r, 1000))
	proc.kill('SIGTERM')
	await Promise.race([proc.exited, new Promise(r => setTimeout(r, 5000))])
	proc.kill('SIGKILL')
	try {
		terminal.close()
	} catch {}
}
await new Promise(r => setTimeout(r, 2000))
scan('after-exit')
process.exit(0)
