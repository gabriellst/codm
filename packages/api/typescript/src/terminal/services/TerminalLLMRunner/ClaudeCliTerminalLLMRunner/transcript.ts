/**
 * Read side of the interactive PTY: tails the JSONL transcript file `claude`
 * itself writes at `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` and
 * yields parsed records.
 *
 * We still spawn `claude` interactively (no `-p`, no `--`) — the user is
 * meant to be using it as a real terminal, with subscription / hook / MCP
 * behavior identical to a human at the terminal. The JSONL is just a
 * side-effect file claude writes for its own session state; tailing it is
 * no different from `tail -f`ing on another window.
 *
 * Patterns stolen from `kcosr/claude-pty-wrapper` (src/core/claude-records.ts,
 * src/core/claude-session-tail.ts, src/core/claude-paths.ts). We intentionally
 * use polling instead of `fs.watch` because on macOS `fs.watch` is unreliable
 * for rapid same-file appends.
 */
import { homedir } from 'node:os'
import { createReadStream, realpathSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * `claude` encodes the absolute cwd as a folder name under `~/.claude/projects/`.
 * Both `/` and `.` are replaced with `-` — past bugs in our runner replaced
 * only `/` and cwds with dots resolved to the wrong projects directory.
 *
 * The cwd is REALPATH'd first (Step-5 smoke finding): claude canonicalizes symlinks before
 * encoding — on macOS `/var/folders/...` becomes `/private/var/folders/...`, so a non-canonical
 * encoding tails a directory claude never writes to. Falls back to `resolve` when the path
 * doesn't exist yet (tests build paths before creating them).
 */
export function encodeCwd(cwd: string): string {
	let canonical: string
	try {
		canonical = realpathSync(cwd)
	} catch {
		canonical = resolve(cwd)
	}
	return canonical.replace(/[/.]/g, '-')
}

/**
 * Root of all per-cwd JSONL transcripts. Overridable via `CLAUDE_PROJECTS_DIR`
 * for tests that need to write fake records into an isolated tmpdir.
 */
export function claudeProjectsRoot(): string {
	return process.env.CLAUDE_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects')
}

export function projectDirFor(cwd: string): string {
	return join(claudeProjectsRoot(), encodeCwd(cwd))
}

export function sessionFilePath(cwd: string, sessionId: string): string {
	if (!UUID_RE.test(sessionId)) {
		throw new Error(`claude session id must be a UUID v1–5 (got: ${sessionId})`)
	}
	return join(projectDirFor(cwd), `${sessionId}.jsonl`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function claudeContentBlocks(content: unknown): Record<string, unknown>[] {
	if (!Array.isArray(content)) return []
	return content.filter(isRecord)
}

function streamBoundarySeparator(prior: string, delta: string): string {
	if (prior.length === 0) return ''
	let trailing = 0
	for (let i = prior.length - 1; i >= 0; i--) {
		if (prior[i] === '\n') trailing++
		else break
	}
	let leading = 0
	for (const ch of delta) {
		if (ch === '\n') leading++
		else break
	}
	return '\n'.repeat(Math.max(0, 2 - trailing - leading))
}

function extractClaudeText(content: unknown): string {
	if (typeof content === 'string') return content
	let combined = ''
	for (const item of claudeContentBlocks(content)) {
		if (typeof item.text === 'string') {
			combined += streamBoundarySeparator(combined, item.text)
			combined += item.text
		}
	}
	return combined
}

function isAllToolResultContent(content: unknown): boolean {
	const blocks = claudeContentBlocks(content)
	return blocks.length > 0 && blocks.every(block => block.type === 'tool_result')
}

/**
 * Returns the assistant's concatenated text for this record, or null if the
 * record is not an assistant message worth surfacing (sidechain, tool-only,
 * empty).
 */
export function claudeAssistantRecordText(record: Record<string, unknown>): string | null {
	if (record.type !== 'assistant' || record.isSidechain === true || !isRecord(record.message)) return null
	if (isAllToolResultContent(record.message.content)) return null
	const text = extractClaudeText(record.message.content)
	return text.length > 0 ? text : null
}

/**
 * `system/turn_duration` is claude's "this turn is done" marker. Sidechain
 * turns (background tasks spawned by claude itself) are not the user-visible
 * turn we care about.
 */
export function isClaudeTurnTerminalRecord(record: Record<string, unknown>): boolean {
	return record.type === 'system' && record.subtype === 'turn_duration' && record.isSidechain !== true
}

/**
 * Real user-text records, filtering out the `<task-notification>` wakeups
 * claude writes for its own internal task runner. Useful if a future caller
 * needs to detect "the turn we initiated has started" vs background activity.
 */
export function realClaudeUserText(record: Record<string, unknown>): string | null {
	if (record.type !== 'user' || record.isSidechain === true || !isRecord(record.message)) return null
	const content = record.message.content
	if (isAllToolResultContent(content)) return null
	const text = extractClaudeText(content)
	const trimmed = text.trim()
	if (trimmed.length === 0 || trimmed.startsWith('<task-notification>')) return null
	return text
}

export interface TailJsonlOptions {
	path: string
	startOffset: number
	signal: AbortSignal
	pollMs?: number
	maxLineLength?: number
}

export interface TailJsonlRecord {
	line: string
	record: Record<string, unknown>
	offsetEnd: number
}

/**
 * Async-iterates parsed JSONL records appended to `path` after `startOffset`.
 * Polls every `pollMs` (default 50ms) — `fs.watch` is unreliable for rapid
 * same-file appends on macOS, which is why the kcosr wrapper polls too.
 *
 * Stops when `signal` is aborted. The generator yields ALL parsed records;
 * filtering (assistant text vs system/turn_duration vs user) is the caller's
 * job via the helpers above.
 */
export async function* tailJsonl(options: TailJsonlOptions): AsyncGenerator<TailJsonlRecord> {
	let offset = options.startOffset
	let buffer = ''
	const pollMs = options.pollMs ?? 50
	const maxLineLength = options.maxLineLength ?? 16 * 1024 * 1024

	while (!options.signal.aborted) {
		const size = await currentSize(options.path)
		if (size === null || size <= offset) {
			await delay(pollMs, options.signal)
			continue
		}

		const chunk = await readRange(options.path, offset, size)
		offset = size
		buffer += chunk
		if (buffer.length > maxLineLength) {
			throw new Error(`claude transcript line exceeds ${maxLineLength} bytes at ${options.path}`)
		}

		let newlineIndex: number
		// biome-ignore lint/suspicious/noAssignInExpressions: canonical incremental line-split loop (whatscode port)
		while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
			const line = buffer.slice(0, newlineIndex)
			buffer = buffer.slice(newlineIndex + 1)
			if (line.trim().length === 0) continue
			let parsed: unknown
			try {
				parsed = JSON.parse(line)
			} catch {
				// Skip malformed lines silently — claude occasionally writes
				// partial records during heavy concurrent writes. The next
				// poll will pick up the corrected line.
				continue
			}
			if (!isRecord(parsed)) continue
			yield { line, record: parsed, offsetEnd: offset - buffer.length }
		}
	}
}

async function currentSize(path: string): Promise<number | null> {
	try {
		return (await stat(path)).size
	} catch (error) {
		if (isErrnoException(error) && error.code === 'ENOENT') return null
		throw error
	}
}

async function readRange(path: string, start: number, endExclusive: number): Promise<string> {
	const chunks: string[] = []
	const stream = createReadStream(path, { encoding: 'utf8', start, end: endExclusive - 1 })
	for await (const chunk of stream) chunks.push(chunk as string)
	return chunks.join('')
}

async function delay(ms: number, signal: AbortSignal): Promise<void> {
	if (signal.aborted) return
	await new Promise<void>(resolveDelay => {
		const t = setTimeout(resolveDelay, ms)
		t.unref?.()
		const onAbort = () => {
			clearTimeout(t)
			signal.removeEventListener('abort', onAbort)
			resolveDelay()
		}
		signal.addEventListener('abort', onAbort, { once: true })
	})
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === 'object' && error !== null && 'code' in error
}
