/**
 * One-shot (non-interactive, PIPES) execution helpers — the surviving half of the pre-phase-10
 * `CliAgentRunner`. Two consumers:
 *
 *   - `ClaudeCliTerminalLLMRunner.generate()` — structured print-mode calls for every provider
 *     (`claude -p … --output-format json`, `codex exec …`, `opencode run …`).
 *   - `ClaudeCliTerminalLLMRunner.stream()` for NON-claude providers — codex/opencode have no
 *     ported interactive engine yet, so a streaming session degrades to one pipes run yielding
 *     `output` lines + a final `exit` (exactly the pre-phase-10 behavior).
 *
 * Plain `node:child_process` pipes (runs fine under Bun) — no PTY, no Bun.Terminal here.
 */
import { spawn as spawnChild, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { BaseError } from '@codedm/core-typescript'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import type { TerminalApplicationErrors } from '../../errors'

export type OneShotProc = ChildProcessByStdio<null, Readable, Readable>

export function spawnOneShot(cmd: string[], cwd?: string): OneShotProc {
	// Node reports spawn failures (ENOENT) ASYNCHRONOUSLY on the 'error' event, not by throwing
	// here — `waitExit` surfaces that as TERMINAL_SPAWN_FAILED. The `once` no-op below guarantees
	// an 'error' is never unhandled (which would crash the daemon) even before `waitExit` attaches.
	try {
		const [bin, ...args] = cmd
		const child = spawnChild(bin as string, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
		child.once('error', () => {})
		return child
	} catch (cause) {
		throw new BaseError<TerminalApplicationErrors>('TERMINAL_SPAWN_FAILED', `failed to spawn ${cmd[0]}: ${String(cause)}`)
	}
}

/** Resolve the process exit code, translating a Node spawn 'error' (e.g. ENOENT) into a domain error. */
export function waitExit(proc: OneShotProc, cmd: string[]): Promise<number> {
	return new Promise((resolve, reject) => {
		if (proc.exitCode !== null) return resolve(proc.exitCode)
		proc.once('error', cause =>
			reject(new BaseError<TerminalApplicationErrors>('TERMINAL_SPAWN_FAILED', `failed to spawn ${cmd[0]}: ${String(cause)}`)),
		)
		proc.once('close', code => resolve(code ?? 0))
	})
}

/** Drain a Node Readable to a UTF-8 string. */
export async function collectStream(stream: Readable): Promise<string> {
	const chunks: Buffer[] = []
	for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
	return Buffer.concat(chunks).toString('utf-8')
}

export type StreamName = 'stdout' | 'stderr'

export interface OrderedLine {
	stream: StreamName
	text: string
}

/**
 * Non-interactive invocation for each provider CLI. `mode` selects the structured one-shot form
 * (`generate`) or the streaming session form (`stream`). `binaryPath` (resolved by
 * `ProviderDetector`) wins when present; otherwise the bare binary name resolves via PATH.
 */
export function buildCommand(
	provider: ProviderKind,
	binaryPath: string | undefined,
	mode: 'generate' | 'stream',
	prompt: string,
	systemPrompt?: string,
): { cmd: string[] } {
	const bin = binaryPath ?? defaultBinary(provider)
	switch (provider) {
		case ProviderKind.CLAUDE_CODE: {
			const base = [bin, '-p', prompt]
			if (systemPrompt) base.push('--append-system-prompt', systemPrompt)
			if (mode === 'generate') base.push('--output-format', 'json')
			return { cmd: base }
		}
		case ProviderKind.CODEX:
			return { cmd: [bin, 'exec', prompt] }
		case ProviderKind.OPENCODE:
			return { cmd: [bin, 'run', prompt] }
	}
}

export function defaultBinary(provider: ProviderKind): string {
	switch (provider) {
		case ProviderKind.CLAUDE_CODE:
			return 'claude'
		case ProviderKind.CODEX:
			return 'codex'
		case ProviderKind.OPENCODE:
			return 'opencode'
	}
}

/**
 * Extract a JSON object/array from CLI stdout. Providers wrap structured results differently —
 * some print pure JSON, some prefix log lines — so we try a whole-string parse first, then fall
 * back to the last balanced `{...}` / `[...]` block. Returns `undefined` when nothing parses.
 */
export function extractJson(stdout: string): unknown {
	const trimmed = stdout.trim()
	if (!trimmed) return undefined
	try {
		return JSON.parse(trimmed)
	} catch {
		// fall through to block extraction
	}
	const start = trimmed.search(/[[{]/)
	if (start === -1) return undefined
	for (let end = trimmed.length; end > start; end--) {
		const candidate = trimmed.slice(start, end)
		const last = candidate.at(-1)
		if (last !== '}' && last !== ']') continue
		try {
			return JSON.parse(candidate)
		} catch {
			// keep shrinking the window
		}
	}
	return undefined
}

/**
 * Merge two byte streams into one ordered line stream. stdout and stderr are read concurrently
 * and their completed lines pushed into a shared queue; the async iterator drains the queue until
 * both readers finish. Trailing partial lines (no final newline) are flushed on close.
 */
export async function* mergeLineStreams(stdout: Readable, stderr: Readable): AsyncGenerator<OrderedLine> {
	const queue: OrderedLine[] = []
	let notify: (() => void) | undefined
	const wake = () => {
		notify?.()
		notify = undefined
	}

	const pump = async (stream: Readable, name: StreamName): Promise<void> => {
		const decoder = new TextDecoder()
		let buffer = ''
		for await (const chunk of stream) {
			buffer += decoder.decode(chunk as Buffer, { stream: true })
			let newlineIndex = buffer.indexOf('\n')
			while (newlineIndex !== -1) {
				queue.push({ stream: name, text: buffer.slice(0, newlineIndex).replace(/\r$/, '') })
				buffer = buffer.slice(newlineIndex + 1)
				newlineIndex = buffer.indexOf('\n')
			}
			wake()
		}
		if (buffer.length > 0) queue.push({ stream: name, text: buffer })
		wake()
	}

	const pumps = Promise.all([pump(stdout, 'stdout'), pump(stderr, 'stderr')])
	let finished = false
	void pumps.then(() => {
		finished = true
		wake()
	})

	for (;;) {
		while (queue.length > 0) {
			yield queue.shift() as OrderedLine
		}
		if (finished) break
		await new Promise<void>(resolve => {
			notify = resolve
		})
	}
	// Drain anything that landed between the last check and completion.
	while (queue.length > 0) yield queue.shift() as OrderedLine
	await pumps
}
