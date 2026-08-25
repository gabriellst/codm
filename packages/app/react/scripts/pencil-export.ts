#!/usr/bin/env bun
/**
 * pencil-export.ts — the ONE versioned bridge between `design/codm.pen` and the committed design
 * truth (`design/system/pen/**`, `design/fidelity/targets/screens/**`). See
 * `.specs/2026-08-24-extracao-ui-fidelity.md` §5.2 (adendo F1) and
 * `.plans/2026-08-24-ui-fidelity-f1.md` (Task T1) for the full contract this file implements.
 *
 * ── Protocol (MEASURED — do not re-derive) ─────────────────────────────────────────────────────
 * The Pencil MCP binary speaks JSON-RPC 2.0 over stdio, newline-delimited. One process per script
 * run, calls SEQUENTIAL (never parallel — the binary is a single stateful session against one .pen
 * document). Handshake: (1) `initialize`, (2) notify `notifications/initialized`, (3) every
 * subsequent call is `tools/call` with `{name:'execute', arguments:{filePath, input}}` — `filePath`
 * is ALWAYS the absolute `PEN_FILE`, never omitted, because the binary does NOT trust "whatever
 * document happens to be active" (armadilha 38, docs/UI-FIDELITY.md). `Export(nodeIds,'png',dir,opts)`
 * treats `dir` as a DIRECTORY and names the output `<nodeId>.png` regardless of how many ids were
 * passed — this script always exports one id at a time into a scratch staging dir, then renames the
 * single result to `<slug>.png`.
 *
 * ── What's OFFLINE-testable vs what needs a live Pen ────────────────────────────────────────────
 * `slugify`, `assignSlugs`, `parseJsonRpcLines`, `buildManifest`, `serializeTokensJson` are pure —
 * covered by `pencil-export.test.ts` with fixtures, no process, no Pen. `PencilBridge` and the three
 * stage runners (tokens/specs/targets) need a live Pencil MCP session and are exercised for real in
 * Task T2/T3, never in this Task's test file (scope fence: OFFLINE).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Subprocess } from 'bun'
import { PNG } from 'pngjs'
import type { TokensJson } from './generate-tokens'

/** Fully piped subprocess (stdin/stdout/stderr all `'pipe'`) — what `PencilBridge` always spawns. */
type PencilProcess = Subprocess<'pipe', 'pipe', 'pipe'>

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')
const DESIGN_ROOT = join(REPO_ROOT, 'design', 'system', 'pen')
const SCREENS_DIR = join(DESIGN_ROOT, 'screens')
const TOKENS_PATH = join(DESIGN_ROOT, 'tokens.json')
const MANIFEST_PATH = join(DESIGN_ROOT, 'screens.manifest.json')
const TARGETS_DIR = join(REPO_ROOT, 'design', 'fidelity', 'targets', 'screens')

const PEN_FILE = process.env.PEN_FILE ?? join(REPO_ROOT, 'design', 'codm.pen')
const PENCIL_MCP_BIN =
	process.env.PENCIL_MCP_BIN ?? '/Applications/Pen.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-arm64'
const PENCIL_APP = process.env.PENCIL_APP ?? 'desktop'

/** Cap of the MCP transport itself — a call that outlives this is treated as a failed step, not a hang. */
const CALL_TIMEOUT_MS = 60_000

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ─── Pure: slug ─────────────────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Lowercase, accent-stripped, non-alphanumeric-run → single dash, trimmed. E.g. `"Screen 1 —
 * Início (cheio)"` → `"screen-1-inicio-cheio"`.
 */
export function slugify(name: string): string {
	return name
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

export interface ScreenInput {
	id: string
	name: string
	area: string
	width: number
	height: number
}

export interface SlugScreen extends ScreenInput {
	slug: string
}

/**
 * Slug assignment for a batch of screens, deterministic by DOCUMENT ORDER (the order `screens`
 * arrives in — discovery order, never re-sorted before this runs).
 *
 * 1. Base slug is `slugify(name)`.
 * 2. A base slug shared by 2+ screens (same screen name reused across areas) gets prefixed with its
 *    OWN area's slug — `${slugify(area)}-${base}`.
 * 3. Any RESIDUAL collision after step 2 (same area AND same name, or a prefixed slug that happens
 *    to collide with an already-unique base elsewhere) gets a numeric suffix on the 2nd+ occurrence,
 *    in document order: `-2`, `-3`, …
 */
export function assignSlugs(screens: ScreenInput[]): SlugScreen[] {
	const baseSlugs = screens.map(s => slugify(s.name))
	const baseCounts = new Map<string, number>()
	for (const base of baseSlugs) baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1)

	const candidateSlugs = screens.map((s, i) => {
		const base = baseSlugs[i] as string
		return (baseCounts.get(base) ?? 0) > 1 ? `${slugify(s.area)}-${base}` : base
	})

	const seen = new Map<string, number>()
	const finalSlugs = candidateSlugs.map(candidate => {
		const occurrence = seen.get(candidate) ?? 0
		seen.set(candidate, occurrence + 1)
		return occurrence === 0 ? candidate : `${candidate}-${occurrence + 1}`
	})

	return screens.map((s, i) => ({ ...s, slug: finalSlugs[i] as string }))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ─── Pure: incremental JSON-RPC line parser ────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface JsonRpcParseResult {
	/** Every complete (newline-terminated) JSON line found in `chunk`, parsed. */
	messages: unknown[]
	/** Trailing bytes after the last newline — not yet a complete line, carried into the next call. */
	rest: string
}

/**
 * Splits `chunk` on `\n`, parses every COMPLETE line as JSON, and returns whatever trails the last
 * newline unparsed. Pure and stateless — the caller is responsible for prefixing `chunk` with the
 * previous call's `rest` before invoking this again, which is what makes the parsing "incremental"
 * across a stream that can split a JSON object mid-write. Blank lines are skipped, never parsed.
 */
export function parseJsonRpcLines(chunk: string): JsonRpcParseResult {
	const lines = chunk.split('\n')
	const rest = lines.pop() ?? ''
	const messages: unknown[] = []
	for (const line of lines) {
		const trimmed = line.trim()
		if (!trimmed) continue
		messages.push(JSON.parse(trimmed))
	}
	return { messages, rest }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ─── Pure: manifest assembly ────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════════════════════

export interface ManifestScreen {
	id: string
	slug: string
	area: string
	name: string
	width: number
	height: number
	/** Present only when a prior manifest entry (same `id`) carried it — see `buildManifest`. */
	exportNodeId?: string
}

export interface ScreensManifest {
	generatedFrom: string
	screens: ManifestScreen[]
}

/**
 * Builds the committed manifest shape from freshly-discovered screens, slug-ordered.
 *
 * `existing` is the manifest as it stood BEFORE this extraction (read from disk by the caller,
 * `undefined` on a first run) — its ONLY contribution is `exportNodeId`, matched by `id` (the
 * Pencil node id is the stable identity; slugs can shift if a screen is renamed, ids don't). This is
 * the mechanism T3 depends on: a human curates `exportNodeId` once, and every later re-extraction
 * (T1's job) preserves it rather than silently dropping it.
 */
export function buildManifest(screens: ScreenInput[], existing: ScreensManifest | undefined, generatedFrom = 'design/codm.pen'): ScreensManifest {
	const existingById = new Map((existing?.screens ?? []).map(s => [s.id, s]))
	const slugged = assignSlugs(screens)
	const manifestScreens = slugged
		.map(
			(s): ManifestScreen => ({
				id: s.id,
				slug: s.slug,
				area: s.area,
				name: s.name,
				width: s.width,
				height: s.height,
				...(existingById.get(s.id)?.exportNodeId ? { exportNodeId: existingById.get(s.id)?.exportNodeId } : {}),
			}),
		)
		.sort((a, b) => a.slug.localeCompare(b.slug))
	return { generatedFrom, screens: manifestScreens }
}

/**
 * Applies MEASURED width/height (read from the actually-exported PNG via pngjs, in
 * `runTargetsStage`) back onto a manifest, keyed by `slug` — the fix for the gap the T3 audit
 * found: `runSpecsStage` only persists the frame's OWN width/height, which is `undefined` for an
 * auto-layout frame, so 8/39 screens had a width and 0/39 had a height. Pure: takes the manifest
 * and a `{slug: {width,height}}` map, returns a new manifest with every MATCHED entry's dims
 * replaced. A slug with no entry in `dims` is left untouched (never zeroed out); a `dims` entry
 * for a slug the manifest doesn't have is silently ignored (never invents a new screen). Both
 * `exportNodeId` and the slug ordering are preserved.
 */
export function withMeasuredDims(manifest: ScreensManifest, dims: Record<string, { width: number; height: number }>): ScreensManifest {
	const screens = manifest.screens
		.map((s): ManifestScreen => {
			const measured = dims[s.slug]
			return measured ? { ...s, width: measured.width, height: measured.height } : s
		})
		.sort((a, b) => a.slug.localeCompare(b.slug))
	return { ...manifest, screens }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ─── Pure: tokens.json stable serialization ────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Serializes a `TokensJson` (shape owned by `generate-tokens.ts`) with keys sorted — the ONLY thing
 * that makes re-extracting the SAME .pen document byte-identical (idempotency gate, T2.2). Pencil's
 * own key order is whatever its internal variable map iterates in, which is not guaranteed stable
 * across sessions.
 */
export function serializeTokensJson(tokens: TokensJson): string {
	const sortedVariables: TokensJson['variables'] = {}
	for (const key of Object.keys(tokens.variables).sort()) {
		sortedVariables[key] = tokens.variables[key] as TokensJson['variables'][string]
	}
	return `${JSON.stringify({ variables: sortedVariables }, null, '\t')}\n`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ─── Transport: PencilBridge (needs a live Pen — never exercised by pencil-export.test.ts) ─────────
// ════════════════════════════════════════════════════════════════════════════════════════════════

interface JsonRpcErrorShape {
	code: number
	message: string
}

interface JsonRpcResponseShape {
	jsonrpc?: string
	id?: number
	result?: unknown
	error?: JsonRpcErrorShape
}

interface ExecuteResult {
	content?: { type?: string; text?: string }[]
	isError?: boolean
}

/** Escapes a value for interpolation into a single-quoted string inside an `execute` snippet. */
function snippetString(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

const PRINT_OUTPUT_MARKER = '## Print output'

/**
 * One MCP session against the Pencil binary: spawn → `initialize` → `notifications/initialized` →
 * any number of SEQUENTIAL `execute` calls → close. Calls are matched to responses by JSON-RPC `id`
 * via `parseJsonRpcLines` reading `stdout` incrementally.
 */
export class PencilBridge {
	private proc: PencilProcess | null = null
	private buffer = ''
	private nextId = 1
	private readonly pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void }>()
	private readLoopDone: Promise<void> | null = null

	constructor(
		private readonly bin: string,
		private readonly app: string,
	) {}

	async connect(): Promise<void> {
		if (!existsSync(this.bin)) {
			throw new Error(
				`pencil-export: PENCIL_MCP_BIN não encontrado em "${this.bin}" — instale o MCP do Pencil ou aponte PENCIL_MCP_BIN para o binário certo`,
			)
		}
		let proc: PencilProcess
		try {
			proc = Bun.spawn<'pipe', 'pipe', 'pipe'>({
				cmd: [this.bin, '--app', this.app, '--agent', 'claudeCodeCLI'],
				stdin: 'pipe',
				stdout: 'pipe',
				stderr: 'pipe',
			})
		} catch (cause) {
			throw new Error(`pencil-export: falha ao iniciar o MCP do Pencil ("${this.bin}") — ${cause instanceof Error ? cause.message : String(cause)}`)
		}
		this.proc = proc
		this.readLoopDone = this.readLoop(proc)

		await this.request('initialize', {
			protocolVersion: '2024-11-05',
			capabilities: {},
			clientInfo: { name: 'pencil-export', version: '1.0.0' },
		})
		this.notify('notifications/initialized', {})
	}

	private async readLoop(proc: PencilProcess): Promise<void> {
		const reader = proc.stdout.getReader()
		const decoder = new TextDecoder()
		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				if (!value) continue
				const { messages, rest } = parseJsonRpcLines(this.buffer + decoder.decode(value, { stream: true }))
				this.buffer = rest
				for (const message of messages) this.dispatch(message)
			}
		} finally {
			// Any call still waiting when stdout closes lost its only chance at a reply — the process
			// died or was closed out from under it. Reject rather than hang forever.
			for (const [id, waiter] of this.pending) {
				waiter.reject(new Error(`pencil-export: conexão com o MCP do Pencil encerrou antes da resposta (id=${id})`))
				this.pending.delete(id)
			}
		}
	}

	private dispatch(message: unknown): void {
		const response = message as JsonRpcResponseShape
		if (typeof response?.id !== 'number') return
		const waiter = this.pending.get(response.id)
		if (!waiter) return
		this.pending.delete(response.id)
		if (response.error) waiter.reject(new Error(`pencil-export: chamada id=${response.id} falhou — ${response.error.message}`))
		else waiter.resolve(response.result)
	}

	private notify(method: string, params: unknown): void {
		if (!this.proc) throw new Error('pencil-export: bridge não conectado')
		this.proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
		this.proc.stdin.flush()
	}

	private request(method: string, params: unknown): Promise<unknown> {
		if (!this.proc) throw new Error('pencil-export: bridge não conectado')
		const proc = this.proc
		const id = this.nextId++
		const promise = new Promise<unknown>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id)
				reject(new Error(`pencil-export: chamada "${method}" (id=${id}) expirou após ${CALL_TIMEOUT_MS}ms — o Pen respondeu?`))
			}, CALL_TIMEOUT_MS)
			this.pending.set(id, {
				resolve: result => {
					clearTimeout(timer)
					resolve(result)
				},
				reject: error => {
					clearTimeout(timer)
					reject(error)
				},
			})
		})
		proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
		proc.stdin.flush()
		return promise
	}

	/**
	 * `tools/call` → `execute`. `filePath` is ALWAYS `PEN_FILE` (armadilha 38 — never the "active"
	 * document). Returns the text AFTER the `## Print output` marker, trimmed — everything a snippet
	 * printed via `Print(...)`. Throws on a JSON-RPC error or `result.isError`.
	 */
	async execute(input: string): Promise<string> {
		const result = (await this.request('tools/call', {
			name: 'execute',
			arguments: { filePath: PEN_FILE, input },
		})) as ExecuteResult
		if (result?.isError) {
			throw new Error(`pencil-export: execute retornou erro — ${result.content?.[0]?.text ?? '(sem detalhe)'}`)
		}
		const text = result?.content?.[0]?.text ?? ''
		const markerAt = text.indexOf(PRINT_OUTPUT_MARKER)
		return (markerAt === -1 ? text : text.slice(markerAt + PRINT_OUTPUT_MARKER.length)).trim()
	}

	async close(): Promise<void> {
		const proc = this.proc
		if (!proc) return
		proc.stdin.end()
		proc.kill()
		await Promise.race([this.readLoopDone?.catch(() => undefined), proc.exited.catch(() => undefined)])
	}
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ─── execute snippets — NO comments inside these strings (Pencil runtime requirement) ─────────────
// ════════════════════════════════════════════════════════════════════════════════════════════════

const TOKENS_SNIPPET = 'Print(JSON.stringify(GetVariables()))'

/**
 * Two-step discovery — MEASURED fix, 2026-08-24 audit against the real `codm.pen`: reading the
 * whole document by id (`Get('root', {depth:1})` or any other bare document read) is REJECTED by
 * the Pencil runtime ("Reading the whole document without a visitor would return everything! Pass
 * a visitor..."). The verified-working shape is a VISITOR call for the top-level nodes —
 * `Get((n, ctx) => { if (ctx.depth === 1) { ctx.skipChildren(); return {...}; } return undefined; })`
 * — followed by a normal by-id `Get('<areaId>', {depth:2})` per matching area, which IS accepted.
 *
 * So: (1) the visitor collects every top-level node `{id,name,type}`, filtered here to the ones
 * named `Mesclado …` (spec §5.2); (2) per matching area, `Get(areaId, {depth:2})` walks down to
 * `Screens*` frames and takes their direct children as screens. Returns `{id,name,area,width,
 * height}[]` via one `Print`.
 */
const DISCOVERY_SNIPPET = `const tops = Get((n, ctx) => { if (ctx.depth === 1) { ctx.skipChildren(); return { id: n.id, name: n.name, type: n.type }; } return undefined; });
const out = [];
const collect = (node, area) => {
if (node.name && node.name.indexOf('Screens') === 0 && node.children) {
for (let i = 0; i < node.children.length; i++) {
const child = node.children[i];
out.push({ id: child.id, name: child.name, area: area, width: child.width, height: child.height });
}
}
if (node.children) {
for (let j = 0; j < node.children.length; j++) {
collect(node.children[j], area);
}
}
};
for (let k = 0; k < tops.length; k++) {
const area = tops[k];
if (typeof area.name === 'string' && area.name.indexOf('Mesclado') === 0) {
const full = Get(area.id, { depth: 2 });
collect(full, area.name);
}
}
Print(JSON.stringify(out))`

function specSnippet(nodeId: string): string {
	return `Print(JSON.stringify(Get('${snippetString(nodeId)}')))`
}

function exportSnippet(nodeId: string, stagingDir: string): string {
	return `Export(['${snippetString(nodeId)}'],'png','${snippetString(stagingDir)}',{scale:1})`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ─── Stage runners ──────────────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════════════════════

interface StageResult {
	ok: number
	fail: number
}

function loadExistingManifest(): ScreensManifest | undefined {
	if (!existsSync(MANIFEST_PATH)) return undefined
	return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as ScreensManifest
}

async function runTokensStage(bridge: PencilBridge): Promise<StageResult> {
	try {
		const text = await bridge.execute(TOKENS_SNIPPET)
		const tokens = JSON.parse(text) as TokensJson
		mkdirSync(DESIGN_ROOT, { recursive: true })
		writeFileSync(TOKENS_PATH, serializeTokensJson(tokens))
		return { ok: 1, fail: 0 }
	} catch (err) {
		console.error(`design:export: tokens falhou — ${err instanceof Error ? err.message : String(err)}`)
		return { ok: 0, fail: 1 }
	}
}

async function runSpecsStage(bridge: PencilBridge): Promise<{ manifest: ScreensManifest } & StageResult> {
	const discoveryText = await bridge.execute(DISCOVERY_SNIPPET)
	const discovered = JSON.parse(discoveryText) as ScreenInput[]
	const manifest = buildManifest(discovered, loadExistingManifest())

	mkdirSync(SCREENS_DIR, { recursive: true })
	let ok = 0
	let fail = 0
	for (const screen of manifest.screens) {
		try {
			const text = await bridge.execute(specSnippet(screen.id))
			writeFileSync(join(SCREENS_DIR, `${screen.slug}.json`), `${text}\n`)
			ok++
		} catch (err) {
			fail++
			console.error(`design:export: spec de "${screen.slug}" falhou — ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, '\t')}\n`)
	return { manifest, ok, fail }
}

async function runTargetsStage(bridge: PencilBridge, manifest: ScreensManifest): Promise<StageResult> {
	mkdirSync(TARGETS_DIR, { recursive: true })
	const stagingDir = mkdtempSync(join(tmpdir(), 'pencil-export-'))
	const measuredDims: Record<string, { width: number; height: number }> = {}
	let ok = 0
	let fail = 0
	try {
		for (const screen of manifest.screens) {
			const exportId = screen.exportNodeId ?? screen.id
			try {
				await bridge.execute(exportSnippet(exportId, stagingDir))
				const stagedPath = join(stagingDir, `${exportId}.png`)
				if (!existsSync(stagedPath)) {
					throw new Error(`Export não produziu "${stagedPath}" (nodeId="${exportId}") — outputPath deveria ser um diretório nomeando <nodeId>.png`)
				}
				const finalPath = join(TARGETS_DIR, `${screen.slug}.png`)
				renameSync(stagedPath, finalPath)
				const png = PNG.sync.read(readFileSync(finalPath))
				if (png.width <= 0 || png.height <= 0) {
					throw new Error(`PNG exportado com dimensões inválidas (${png.width}x${png.height})`)
				}
				measuredDims[screen.slug] = { width: png.width, height: png.height }
				ok++
			} catch (err) {
				fail++
				console.error(`design:export: target de "${screen.slug}" falhou — ${err instanceof Error ? err.message : String(err)}`)
			}
		}
	} finally {
		rmSync(stagingDir, { recursive: true, force: true })
	}
	// Only rewrite the committed manifest when EVERY target succeeded — a partial run must never
	// leave the manifest half-measured (some slugs with fresh dims, others silently stale).
	if (fail === 0) {
		writeFileSync(MANIFEST_PATH, `${JSON.stringify(withMeasuredDims(manifest, measuredDims), null, '\t')}\n`)
	}
	return { ok, fail }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// ─── CLI ────────────────────────────────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
	const args = process.argv.slice(2)
	const explicit = args.includes('--tokens') || args.includes('--specs') || args.includes('--targets')
	const doTokens = explicit ? args.includes('--tokens') : true
	const doSpecs = explicit ? args.includes('--specs') : true
	const doTargets = explicit ? args.includes('--targets') : true

	const bridge = new PencilBridge(PENCIL_MCP_BIN, PENCIL_APP)
	try {
		await bridge.connect()
	} catch (err) {
		console.error(`design:export: não foi possível conectar ao MCP do Pencil — ${err instanceof Error ? err.message : String(err)}`)
		console.log('design:export: ok=0 fail=1')
		process.exit(1)
	}

	let ok = 0
	let fail = 0
	try {
		if (doTokens) {
			const result = await runTokensStage(bridge)
			ok += result.ok
			fail += result.fail
		}

		let manifest: ScreensManifest | undefined
		if (doSpecs) {
			const result = await runSpecsStage(bridge)
			manifest = result.manifest
			ok += result.ok
			fail += result.fail
		}

		if (doTargets) {
			manifest ??= loadExistingManifest()
			if (!manifest) {
				console.error('design:export: --targets precisa de um manifesto — rode com --specs primeiro (ou garanta screens.manifest.json commitado)')
				fail += 1
			} else {
				const result = await runTargetsStage(bridge, manifest)
				ok += result.ok
				fail += result.fail
			}
		}
	} finally {
		await bridge.close()
	}

	console.log(`design:export: ok=${ok} fail=${fail}`)
	if (fail > 0) process.exit(1)
}

if (import.meta.main) {
	main().catch(err => {
		console.error(`design:export: erro inesperado — ${err instanceof Error ? err.message : String(err)}`)
		process.exit(1)
	})
}
