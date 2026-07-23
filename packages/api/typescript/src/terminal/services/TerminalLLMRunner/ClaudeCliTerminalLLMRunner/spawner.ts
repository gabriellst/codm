/**
 * PTY spawning for the claude engine — REWRITTEN to `Bun.Terminal` (Fork D2, DEFINITIVO; recipe:
 * .specs/codedm/2026-07-23-fork-d2-spike.md). Where whatscode used node-pty, codedm uses the
 * native Bun PTY: `new Bun.Terminal({ data, ... })` + `Bun.spawn([cmd], { terminal })`. All child
 * I/O flows through the Terminal's single `data` callback and `terminal.write()`; this module
 * adapts that surface to a node-pty-shaped `PtyHandle` (onData/onExit subscriptions, write, kill)
 * so the battle-tested engine logic (boot sequence, runTurn, SessionMap) ports unchanged and every
 * fake-PTY test keeps its shape.
 *
 * D2 gotchas honored here:
 *   - PTY `exit` callback fires on PTY-stream EOF, NOT process exit → we listen on `proc.exited`.
 *   - A bare Terminal keeps the event loop alive → `terminal.close()` once the process exits (and
 *     on spawn failure).
 *   - Delete CLAUDECODE / CLAUDE_CODE_ENTRYPOINT / CLAUDE_CODE_SSE_PORT from the inherited env
 *     before spawning claude; set TERM=xterm-256color.
 *
 * No file outside `ClaudeCliTerminalLLMRunner/` may touch `Bun.Terminal` or the transcript path
 * (see ImportGraphIsolation.test.ts).
 */
import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** node-pty-shaped adapter over a Bun.Terminal + subprocess pair. */
export interface PtyHandle {
	write(data: string): void
	kill(signal?: string): void
	resize(cols: number, rows: number): void
	onData(cb: (data: string) => void): { dispose(): void }
	onExit(cb: (ev: { exitCode: number; signal?: number }) => void): { dispose(): void }
}

export interface SpawnOptions {
	/** Fork B: the session identity — one claude REPL per issue. */
	issueId: string
	cwd: string
	systemPrompt?: string
	/**
	 * Deterministic UUID v1–5 passed via `--session-id`. We pre-generate it so we can compute the
	 * JSONL transcript path before spawning and start the tail as soon as the file appears.
	 * UUID v7 is rejected by claude.
	 */
	sessionId: string
	/** Resolved binary path (ProviderDetector); falls back to `resolveClaudeBin()` when absent. */
	binaryPath?: string
}

/**
 * `Bun.spawn` only searches the PATH the api process inherited — when started from a non-login
 * shell (nx, launchd, a packaged app), `~/.local/bin` (the default `claude` install dir) is
 * typically missing. Resolving to an absolute path before spawning sidesteps that entirely.
 *
 * Resolution order: `$CLAUDE_BIN` env override → a `command -v claude` lookup via the user's login
 * shell (so `~/.zshrc` PATH additions are honored) → a few common install paths → the bare
 * `claude` name (which surfaces the path issue to the operator).
 *
 * Cached after first resolve since the binary doesn't move at runtime.
 */
interface ResolveTrace {
	source: 'env' | 'login-shell' | 'guess' | 'fallback'
	candidate: string | null
	error?: string
}

let cachedBin: string | null = null
let cachedTrace: ResolveTrace[] = []

/** Test hook — clears the resolve cache so suites can exercise different env setups. */
export function resetClaudeBinCacheForTests(): void {
	cachedBin = null
	cachedTrace = []
}

export function resolveClaudeBin(): string {
	if (cachedBin) return cachedBin
	const trace: ResolveTrace[] = []
	const fromEnv = process.env.CLAUDE_BIN
	if (fromEnv) {
		const exists = existsSync(fromEnv)
		trace.push({ source: 'env', candidate: fromEnv, error: exists ? undefined : 'ENOENT' })
		if (exists) {
			cachedBin = fromEnv
			cachedTrace = trace
			return fromEnv
		}
	}
	const loginShell = process.env.SHELL ?? '/bin/sh'
	try {
		const out = execFileSync(loginShell, ['-lc', 'command -v claude'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim()
		const exists = out.length > 0 && existsSync(out)
		trace.push({
			source: 'login-shell',
			candidate: out || null,
			error: exists ? undefined : out.length === 0 ? 'empty' : 'ENOENT',
		})
		if (exists) {
			cachedBin = out
			cachedTrace = trace
			return out
		}
	} catch (err) {
		trace.push({ source: 'login-shell', candidate: null, error: err instanceof Error ? err.message : String(err) })
	}
	const guesses = [join(homedir(), '.local', 'bin', 'claude'), '/usr/local/bin/claude', '/opt/homebrew/bin/claude']
	for (const g of guesses) {
		if (existsSync(g)) {
			trace.push({ source: 'guess', candidate: g })
			cachedBin = g
			cachedTrace = trace
			return g
		}
	}
	trace.push({ source: 'fallback', candidate: 'claude' })
	cachedBin = 'claude'
	cachedTrace = trace
	return 'claude'
}

/**
 * Env keys that make claude think it's running INSIDE another claude/CI context. The D2 spike
 * proved these must be deleted before spawning or the TUI can refuse to boot interactively.
 */
const CLAUDE_NESTING_KEYS = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT'] as const

/**
 * Build a sanitized env for the claude child. claude is a Bun-compiled binary; both its runtime
 * and its startup code inspect env vars for CI detection, npm-script detection, and parent-tool
 * identification. When the api daemon forwards its full env (npm_*, BUN_*, CI, GITHUB_*, ...),
 * claude can decide it's running in a non-interactive context and exit silently with code 0 and
 * zero output. We pass a whitelist plus the caller's CLAUDE_* / ANTHROPIC_* / MCP_* vars so auth
 * and config still work — MINUS the nesting keys above (D2 gotcha).
 * Set `CODEDM_CLAUDE_FULL_ENV=1` to bypass and forward the parent env (minus nesting keys).
 */
function buildClaudeEnv(opts: SpawnOptions): Record<string, string> {
	const passthroughKeys = [
		'HOME',
		'USER',
		'LOGNAME',
		'SHELL',
		'PATH',
		'LANG',
		'LC_ALL',
		'LC_CTYPE',
		'TZ',
		'TMPDIR',
		'XDG_CONFIG_HOME',
		'XDG_DATA_HOME',
		'XDG_CACHE_HOME',
		// claude shells out to git/gh for repo ops; both need the ssh agent.
		'SSH_AUTH_SOCK',
		// Tokens claude/gh use for github operations.
		'GH_TOKEN',
		'GITHUB_TOKEN',
	]
	const sanitized: Record<string, string> = {}
	for (const k of passthroughKeys) {
		const v = process.env[k]
		if (v !== undefined) sanitized[k] = v
	}
	// Forward anything claude or Anthropic owns (auth tokens, config paths, MCP)...
	for (const [k, v] of Object.entries(process.env)) {
		if (v === undefined) continue
		if (k.startsWith('CLAUDE_') || k.startsWith('ANTHROPIC_') || k.startsWith('MCP_')) {
			sanitized[k] = v
		}
	}
	// ...EXCEPT the nesting markers (D2 gotcha 3).
	for (const k of CLAUDE_NESTING_KEYS) delete sanitized[k]
	// Terminal hints — required for the interactive TUI to render correctly.
	sanitized.TERM = process.env.TERM ?? 'xterm-256color'
	sanitized.FORCE_COLOR = '1'
	sanitized.COLORTERM = 'truecolor'
	// Our own identity var so claude's hooks/MCPs can see which issue drives the session.
	sanitized.CODEDM_ISSUE_ID = opts.issueId
	return sanitized
}

export interface SpawnPtyOptions {
	cwd: string
	env: Record<string, string>
	cols?: number
	rows?: number
}

/**
 * Low-level PTY spawn: one Bun.Terminal per subprocess, adapted to `PtyHandle`. The Terminal's
 * single `data` callback fans out to every `onData` subscriber via an EventEmitter (the engine
 * attaches several: boot sequence, pty-data logger, TUI parser). Process exit is observed via
 * `proc.exited` (NOT the Terminal's `exit` callback — that is PTY-stream EOF); on exit the
 * Terminal is closed so it stops holding the event loop, and `exit` subscribers attached AFTER
 * the fact are re-notified asynchronously (so `closePtyGracefully` on a dead PTY still resolves).
 */
export function spawnPty(cmd: string[], opts: SpawnPtyOptions): PtyHandle {
	const em = new EventEmitter()
	em.setMaxListeners(50)
	const decoder = new TextDecoder()
	const terminal = new Bun.Terminal({
		cols: opts.cols ?? 120,
		rows: opts.rows ?? 40,
		name: 'xterm-256color',
		data: (_terminal, data) => {
			em.emit('data', decoder.decode(data))
		},
	})

	let proc: ReturnType<typeof Bun.spawn>
	try {
		proc = Bun.spawn(cmd, { terminal, cwd: opts.cwd, env: opts.env })
	} catch (err) {
		try {
			terminal.close()
		} catch {}
		throw err
	}

	let lastExit: { exitCode: number; signal?: number } | null = null
	void proc.exited
		.then(exitCode => {
			lastExit = { exitCode: exitCode ?? 0, signal: 0 }
			try {
				terminal.close()
			} catch {}
			em.emit('exit', lastExit)
		})
		.catch(() => {
			lastExit = { exitCode: 1, signal: 0 }
			try {
				terminal.close()
			} catch {}
			em.emit('exit', lastExit)
		})

	return {
		write(data: string): void {
			terminal.write(data)
		},
		kill(signal?: string): void {
			try {
				proc.kill(signal as NodeJS.Signals | undefined)
			} catch {}
		},
		resize(cols: number, rows: number): void {
			terminal.resize(cols, rows)
		},
		onData(cb: (data: string) => void) {
			em.on('data', cb)
			return {
				dispose() {
					em.off('data', cb)
				},
			}
		},
		onExit(cb: (ev: { exitCode: number; signal?: number }) => void) {
			em.on('exit', cb)
			// Late subscribers on an already-dead PTY still get notified (async, once).
			if (lastExit) {
				const snapshot = lastExit
				queueMicrotask(() => cb(snapshot))
			}
			return {
				dispose() {
					em.off('exit', cb)
				},
			}
		},
	}
}

/**
 * Spawns the `claude` CLI in a PTY in interactive REPL mode. We pass `--session-id <uuid>` so the
 * transcript file path is predictable, but we do NOT pass `-p` or a `--` positional prompt — all
 * prompts are written to the PTY's stdin like a human typing at the terminal. Anthropic sees this
 * as a single long-lived interactive session per issue.
 *
 * `--dangerously-skip-permissions` is required because the headless runner can't answer per-tool
 * prompts; the stop control plane (RaiseStop/ResolveStop) is the human-in-the-loop gate.
 */
export function spawnClaude(opts: SpawnOptions): PtyHandle {
	const bin = opts.binaryPath ?? resolveClaudeBin()
	const args = ['--dangerously-skip-permissions', '--session-id', opts.sessionId]
	if (opts.systemPrompt && opts.systemPrompt.length > 0) args.push('--append-system-prompt', opts.systemPrompt)
	let env: Record<string, string>
	if (process.env.CODEDM_CLAUDE_FULL_ENV === '1') {
		env = { ...process.env } as Record<string, string>
		for (const k of CLAUDE_NESTING_KEYS) delete env[k]
		env.TERM = process.env.TERM ?? 'xterm-256color'
		env.FORCE_COLOR = '1'
		env.COLORTERM = 'truecolor'
		env.CODEDM_ISSUE_ID = opts.issueId
	} else {
		env = buildClaudeEnv(opts)
	}
	const binExists = bin === 'claude' ? null : existsSync(bin)
	if (binExists === false) {
		throw new Error(
			`spawnClaude: resolved binary does not exist: ${bin} (set CLAUDE_BIN env override; resolution trace: ${JSON.stringify(cachedTrace)})`,
		)
	}
	if (!existsSync(opts.cwd)) {
		throw new Error(
			`spawnClaude: cwd does not exist: ${opts.cwd}. Check the workspace path for issueId=${opts.issueId} — the folder was probably moved or deleted.`,
		)
	}
	try {
		return spawnPty([bin, ...args], { cwd: opts.cwd, env })
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err)
		throw new Error(`spawnClaude: Bun.Terminal spawn failed (${msg}) — bin=${bin} cwd=${opts.cwd} args=${JSON.stringify(args)}`)
	}
}
