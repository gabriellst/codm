import { spawn as spawnChild, type ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'
import { injectable } from 'tsyringe-neo'
import type { z, ZodType } from 'zod'
import { BaseError } from '@codedm/core-typescript'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { AgentRunner } from '../AgentRunner'
import type { AgentGenerateRequest, AgentStreamRequest, TerminalRuntimeEvent } from '../types'
import type { TerminalApplicationErrors } from '../../../errors'

/**
 * Real `AgentRunner` — drives a provider CLI as a child process via `node:child_process`. Registered
 * in the `real` DI env only; tests bind `StubAgentRunner` instead so no provider binary is ever
 * invoked. Runtime is pure Node (no `Bun.*`) because the daemon is BUILT with Bun but RUNS under Node
 * (`node dist/server.js`); a `Bun.spawn` here threw `Bun is not defined` on the first real session.
 *
 * ── PTY vs pipes (documented choice) ────────────────────────────────────────────────────────────
 * CodeDM prefers ZERO new native dependencies. `child_process.spawn` with piped stdio gives pipes,
 * not a real TTY. The provider CLIs are driven NON-INTERACTIVELY (a prompt argument + a print/exec
 * flag), so a pseudo-terminal buys nothing here — line-buffered stdout/stderr pipes carry the full
 * session. A real PTY (`node-pty`, a native build) would only matter for CLIs that gate features on
 * `isatty`; that seam is deferred to the whatscode engine extraction. Because everything routes
 * through this `AgentRunner` interface, swapping a `NodePtyAgentRunner` in later is a one-binding
 * change in `terminal/registry.ts` — no caller moves.
 *
 * ── generate() ─────────────────────────────────────────────────────────────────────────────────
 * One-shot structured call: spawns the CLI in print mode (e.g. `claude -p <prompt> --output-format
 * json`), extracts the JSON body from stdout, and validates it against `outputSchema`.
 *
 * ── stream() ───────────────────────────────────────────────────────────────────────────────────
 * Interactive session: spawns the CLI in `cwd` (the workspace folder), merges stdout+stderr into a
 * single ordered line stream yielded as `{ type: 'output' }` events, and closes with a single
 * `{ type: 'exit', code }`. `signal` kills the subprocess on abort (teardown).
 */
@injectable()
export class CliAgentRunner extends AgentRunner {
	async generate<OutputSchema extends ZodType>(request: AgentGenerateRequest<OutputSchema>): Promise<z.output<OutputSchema>> {
		const { cmd } = buildCommand(request.provider, request.binaryPath, 'generate', request.prompt, request.systemPrompt)

		const proc = this.spawn(cmd, request.cwd)
		const [stdout, code] = await Promise.all([collectStream(proc.stdout), waitExit(proc, cmd)])
		if (code !== 0) {
			throw new BaseError<TerminalApplicationErrors>('TERMINAL_SPAWN_FAILED', `${request.provider} generate exited with code ${code}`)
		}

		const json = extractJson(stdout)
		if (json === undefined) {
			throw new BaseError<TerminalApplicationErrors>('CLASSIFICATION_FAILED', `${request.provider} produced no parseable JSON output`)
		}
		return request.outputSchema.parse(json) as z.output<OutputSchema>
	}

	async *stream(request: AgentStreamRequest): AsyncIterable<TerminalRuntimeEvent> {
		const { cmd } = buildCommand(request.provider, request.binaryPath, 'stream', request.prompt)
		const proc = this.spawn(cmd, request.cwd)

		const onAbort = () => proc.kill()
		request.signal?.addEventListener('abort', onAbort)

		try {
			for await (const line of mergeLineStreams(proc.stdout, proc.stderr)) {
				yield { type: 'output', line: { at: new Date().toISOString(), line: line.text, stream: line.stream } }
			}
			const code = await waitExit(proc, cmd)
			yield { type: 'exit', code }
		} finally {
			request.signal?.removeEventListener('abort', onAbort)
			// Belt-and-braces: if the consumer breaks early, don't leak the subprocess.
			proc.kill()
		}
	}

	private spawn(cmd: string[], cwd?: string): ChildProcessByStdio<null, Readable, Readable> {
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
}

/** Resolve the process exit code, translating a Node spawn 'error' (e.g. ENOENT) into a domain error. */
function waitExit(proc: ChildProcessByStdio<null, Readable, Readable>, cmd: string[]): Promise<number> {
	return new Promise((resolve, reject) => {
		if (proc.exitCode !== null) return resolve(proc.exitCode)
		proc.once('error', cause =>
			reject(new BaseError<TerminalApplicationErrors>('TERMINAL_SPAWN_FAILED', `failed to spawn ${cmd[0]}: ${String(cause)}`)),
		)
		proc.once('close', code => resolve(code ?? 0))
	})
}

/** Drain a Node Readable to a UTF-8 string. */
async function collectStream(stream: Readable): Promise<string> {
	const chunks: Buffer[] = []
	for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
	return Buffer.concat(chunks).toString('utf-8')
}

type StreamName = 'stdout' | 'stderr'

interface OrderedLine {
	stream: StreamName
	text: string
}

/**
 * Non-interactive invocation for each provider CLI. `mode` selects the structured one-shot form
 * (`generate`) or the streaming session form (`stream`). `binaryPath` (resolved by
 * `ProviderDetector`) wins when present; otherwise the bare binary name resolves via PATH.
 *
 * These are the platform-neutral defaults; a provider whose flags drift is a one-line change here,
 * localized behind the `AgentRunner` seam.
 */
function buildCommand(
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

function defaultBinary(provider: ProviderKind): string {
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
 * Extract a JSON object/array from CLI stdout. Providers wrap structured results differently — some
 * print pure JSON, some prefix log lines — so we try a whole-string parse first, then fall back to
 * the last balanced `{...}` / `[...]` block. Returns `undefined` when nothing parses.
 */
function extractJson(stdout: string): unknown {
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
 * Merge two byte streams into one ordered line stream. stdout and stderr are read concurrently and
 * their completed lines pushed into a shared queue; the async iterator drains the queue until both
 * readers finish. Trailing partial lines (no final newline) are flushed on close.
 */
async function* mergeLineStreams(stdout: Readable, stderr: Readable): AsyncGenerator<OrderedLine> {
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
	pumps.then(() => {
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
