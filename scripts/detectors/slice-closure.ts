#!/usr/bin/env bun
/**
 * slice-closure.ts — multi-file wiring walker for the TS backend (api-ts + contracts + Go consumers).
 *
 * Verifies every event-driven vertical slice is CLOSED: declared events get raised,
 * published integration events have a consumer somewhere (TS or Go), projections have
 * projectors, artifacts reach their registration gate (barrel / slot / registry), and
 * no two subscribers collide on one mediator event name WHEN the mediator's register()
 * source still shows the legacy last-write-wins replacement block. At HEAD,
 * EventEmitter2Mediator.register is true multicast — multiple subscribers per event
 * name are expected fan-out, so SCW-04 stays off unless the replacement block returns.
 *
 * Checks:
 *   SCW-01a  domain event declared but never constructed outside tests        error
 *   SCW-01b  domain event raised but has no subscriber (events-as-record)     info
 *   SCW-01c  integration event published, zero consumers in TS AND Go         warning
 *   SCW-01d  integration event subscribed, zero publishers in TS AND Go       warning
 *   SCW-02   projection without projector / projector on unknown event name   error
 *   SCW-03   artifact not registered (controller barrel, handler barrel +
 *            direction rule, projector slot, registry spread, errors import)  error
 *   SCW-04   duplicate subscriber on one mediator side for one event name     error
 *            (fires ONLY while the mediator source is last-write-wins;
 *             with the multicast mediator it is expected fan-out → no finding)
 *
 * Usage:
 *   bun scripts/detectors/slice-closure.ts [--json] [--all] [files...]
 *
 * The walk is always whole-graph (wiring is multi-file by nature); bare file args only
 * filter which findings are REPORTED. Exit 1 iff any error-severity finding survives.
 *
 * Allowlist: scripts/detectors/slice-closure.allow.yaml suppresses documented-intentional
 * SCW-01c/SCW-01d findings by wire event name.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { REPO } from '../../template.config'

// ─── Shared contract ────────────────────────────────────────────────

export interface Finding {
	detector: string
	ruleId: string
	source: string
	file: string
	line: number
	severity: 'error' | 'warning' | 'info'
	message: string
	excerpt?: string
}

export interface AllowEntry {
	event: string
	rule?: string
	reason?: string
}

export interface WalkOptions {
	allow?: AllowEntry[]
}

const DETECTOR = 'slice-closure'

// ─── Path constants (repo-relative, POSIX) ──────────────────────────

// Roots + package scope flow from template.config.ts (sync-machinery P1-2).
const TS_SRC = `${REPO.workspaceRoots.apiTs}/`
const WIRE_TS_DIR = `${REPO.packageRoots.contractsGenTs}/src/wire/events/`
const GO_WIRE_FILE = `${REPO.packageRoots.contractsGenGo}/wire/events.go`
const GO_SRC = `${REPO.packageRoots.apiGo}/`

// ─── Generic helpers ────────────────────────────────────────────────

function isTestPath(p: string): boolean {
	return /\.(test|spec)\.tsx?$/.test(p) || /_test\.go$/.test(p) || p.includes('/tests/') || p.startsWith('packages/e2e/')
}

function lineAt(content: string, index: number): number {
	let line = 1
	for (let i = 0; i < index && i < content.length; i++) if (content.charCodeAt(i) === 10) line++
	return line
}

function excerptAt(content: string, index: number): string {
	const start = content.lastIndexOf('\n', index) + 1
	let end = content.indexOf('\n', index)
	if (end === -1) end = content.length
	return content.slice(start, end).trim().slice(0, 160)
}

/**
 * Splits a TS/Go source into comment-blanked code (offsets/newlines preserved so line
 * numbers stay valid) and the extracted comment chunks. String-literal aware so a
 * `'http://...'` never starts a comment.
 */
function splitComments(content: string): { code: string; comments: string[] } {
	const code: string[] = []
	const comments: string[] = []
	let cur = ''
	let state: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code'
	for (let i = 0; i < content.length; i++) {
		const c = content[i] as string
		const next = content[i + 1]
		if (state === 'code') {
			if (c === '/' && next === '/') {
				state = 'line'
				cur = ''
				code.push(' ', ' ')
				i++
			} else if (c === '/' && next === '*') {
				state = 'block'
				cur = ''
				code.push(' ', ' ')
				i++
			} else {
				if (c === "'" || c === '"' || c === '`') state = c
				code.push(c)
			}
		} else if (state === 'line') {
			if (c === '\n') {
				comments.push(cur)
				state = 'code'
				code.push('\n')
			} else {
				cur += c
				code.push(' ')
			}
		} else if (state === 'block') {
			if (c === '*' && next === '/') {
				comments.push(cur)
				state = 'code'
				code.push(' ', ' ')
				i++
			} else {
				cur += c
				code.push(c === '\n' ? '\n' : ' ')
			}
		} else {
			// inside a string literal
			if (c === '\\') {
				code.push(c, next ?? '')
				i++
			} else {
				if (c === state || (c === '\n' && state !== '`')) state = 'code'
				code.push(c)
			}
		}
	}
	if (cur && (state as string) === 'line') comments.push(cur)
	return { code: code.join(''), comments }
}

function normalizeJoined(joined: string): string {
	const out: string[] = []
	for (const part of joined.split('/')) {
		if (part === '' || part === '.') continue
		if (part === '..') out.pop()
		else out.push(part)
	}
	return out.join('/')
}

/** Resolves an import specifier to a repo-relative module path (no extension), or a package id. */
function resolveModule(fromFile: string, spec: string): string {
	if (spec.startsWith('.')) return normalizeJoined(`${fromFile.split('/').slice(0, -1).join('/')}/${spec}`)
	if (spec.startsWith(`${REPO.scope}/`)) return spec
	// tsconfig "@*" → "./src/*" alias of the api workspace
	if (spec.startsWith('@')) return normalizeJoined(`${TS_SRC}${spec.slice(1)}`)
	return spec
}

// ─── Per-file scan model ────────────────────────────────────────────

interface ImportEntry {
	local: string
	orig: string
	source: string
}

interface TsFile {
	path: string
	code: string
	comments: string[]
	imports: ImportEntry[]
}

const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g
const NS_IMPORT_RE = /import\s+\*\s+as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g
const DEFAULT_IMPORT_RE = /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g

function parseImports(code: string): ImportEntry[] {
	const entries: ImportEntry[] = []
	for (const m of code.matchAll(IMPORT_RE)) {
		const source = m[2] as string
		for (const raw of (m[1] as string).split(',')) {
			const part = raw.trim()
			if (!part) continue
			const nm = /^(?:type\s+)?(\w+)(?:\s+as\s+(\w+))?$/.exec(part)
			if (!nm) continue
			entries.push({ orig: nm[1] as string, local: (nm[2] ?? nm[1]) as string, source })
		}
	}
	return entries
}

// ─── Event index ────────────────────────────────────────────────────

interface EventRec {
	kind: 'domain' | 'wire'
	ctx?: string
	className: string
	eventName: string
	file: string
	line: number
}

interface Site {
	file: string
	line: number
}

type EventSource = { kind: 'wire' } | { kind: 'domain'; ctx: string } | null

function eventSourceOf(file: string, spec: string): EventSource {
	if (spec.includes('wire/events')) return { kind: 'wire' }
	const resolved = resolveModule(file, spec)
	const m = /^packages\/api\/typescript\/src\/([^/]+)\/events(?:\/|$)/.exec(`${resolved}/`)
	if (m) return { kind: 'domain', ctx: m[1] as string }
	return null
}

// ─── Walk ───────────────────────────────────────────────────────────

export function walk(files: Map<string, string>, options: WalkOptions = {}): Finding[] {
	const findings: Finding[] = []
	const allow = options.allow ?? []

	const add = (
		ruleId: string,
		source: string,
		severity: Finding['severity'],
		file: string,
		line: number,
		message: string,
		excerpt?: string,
	) => {
		findings.push({ detector: DETECTOR, ruleId, source, file, line, severity, message, ...(excerpt ? { excerpt } : {}) })
	}

	// Pre-split every TS file once (test files excluded from the whole graph).
	const tsFiles = new Map<string, TsFile>()
	for (const [path, content] of files) {
		if (!path.endsWith('.ts') || isTestPath(path)) continue
		const { code, comments } = splitComments(content)
		tsFiles.set(path, { path, code, comments, imports: parseImports(code) })
	}

	// ── Index events ──
	const domainEvents: EventRec[] = []
	const wireEvents: EventRec[] = []
	const domainByCtxClass = new Map<string, EventRec>()
	const wireByClass = new Map<string, EventRec>()
	const byName = new Map<string, EventRec>()

	const DOMAIN_CLASS_RE = /export\s+class\s+(\w+)\s+extends\s+BaseDomainEvent\b/g
	const WIRE_CLASS_RE = /export\s+class\s+(\w+)\s+extends\s+BaseIntegrationEvent\b/g
	const STATIC_NAME_RE = /static\s+(?:override\s+)?readonly\s+name\s*=\s*'([^']+)'/g

	const indexEventClasses = (tf: TsFile, classRe: RegExp, kind: 'domain' | 'wire', ctx?: string) => {
		const classes = [...tf.code.matchAll(classRe)]
		const names = [...tf.code.matchAll(STATIC_NAME_RE)]
		for (const cm of classes) {
			// pair each class with the first static name declared after it
			const nm = names.find(n => (n.index as number) > (cm.index as number))
			if (!nm) continue
			const rec: EventRec = {
				kind,
				ctx,
				className: cm[1] as string,
				eventName: nm[1] as string,
				file: tf.path,
				line: lineAt(tf.code, cm.index as number),
			}
			if (kind === 'domain') {
				domainEvents.push(rec)
				domainByCtxClass.set(`${ctx}:${rec.className}`, rec)
			} else {
				wireEvents.push(rec)
				wireByClass.set(rec.className, rec)
			}
			byName.set(rec.eventName, rec)
		}
	}

	for (const tf of tsFiles.values()) {
		const dm = /^packages\/api\/typescript\/src\/([^/]+)\/events\/[^/]+Event\.ts$/.exec(tf.path)
		if (dm) indexEventClasses(tf, DOMAIN_CLASS_RE, 'domain', dm[1] as string)
		if (tf.path.startsWith(WIRE_TS_DIR) && !tf.path.endsWith('/index.ts') && !tf.path.endsWith('/_imports.ts'))
			indexEventClasses(tf, WIRE_CLASS_RE, 'wire')
	}

	// Go wire consts: <Base>EventName = "<wire name>"
	const goConsts = new Map<string, string>()
	const goWire = files.get(GO_WIRE_FILE)
	if (goWire) {
		for (const m of goWire.matchAll(/const\s+(\w+)EventName\s*=\s*"([^"]+)"/g)) goConsts.set(m[1] as string, m[2] as string)
	}

	// ── Per-file event alias maps + raise sites ──
	// aliasMap: local identifier in a file → EventRec it actually refers to (import-aliasing safe).
	const aliasMaps = new Map<string, Map<string, EventRec>>()
	for (const tf of tsFiles.values()) {
		const map = new Map<string, EventRec>()
		for (const imp of tf.imports) {
			const src = eventSourceOf(tf.path, imp.source)
			if (!src) continue
			const rec = src.kind === 'wire' ? wireByClass.get(imp.orig) : domainByCtxClass.get(`${src.ctx}:${imp.orig}`)
			if (rec) map.set(imp.local, rec)
		}
		aliasMaps.set(tf.path, map)
	}

	// raisesByEvent: eventName → construction sites in non-test TS src (excluding the declaring file)
	const raisesByEvent = new Map<string, Site[]>()
	for (const tf of tsFiles.values()) {
		if (!tf.path.startsWith(TS_SRC)) continue
		const aliasMap = aliasMaps.get(tf.path) as Map<string, EventRec>
		if (aliasMap.size === 0) continue
		for (const m of tf.code.matchAll(/\bnew\s+(\w+)\s*\(/g)) {
			const rec = aliasMap.get(m[1] as string)
			if (!rec || rec.file === tf.path) continue
			const sites = raisesByEvent.get(rec.eventName) ?? []
			sites.push({ file: tf.path, line: lineAt(tf.code, m.index as number) })
			raisesByEvent.set(rec.eventName, sites)
		}
	}

	// ── Handler index ──
	interface HandlerRec {
		ctx: string
		className: string
		abstract: boolean
		file: string
		line: number
		events: EventRec[]
		unresolved: string[]
		barrel: 'internal' | 'external' | null
	}

	const handlers: HandlerRec[] = []
	const HANDLER_CLASS_RE = /export\s+(abstract\s+)?class\s+(\w+)\s+extends\s+EventHandler\b/g
	const EVENT_FIELD_RE = /readonly\s+event\s*=\s*(\[[^\]]*\]|\w+)/g

	for (const tf of tsFiles.values()) {
		const hm = /^packages\/api\/typescript\/src\/([^/]+)\/handlers\/(.+)\.ts$/.exec(tf.path)
		if (!hm) continue
		const base = (hm[2] as string).split('/').pop() as string
		if (base === 'internal' || base === 'external' || base === 'index') continue
		const ctx = hm[1] as string
		const classMatches = [...tf.code.matchAll(HANDLER_CLASS_RE)]
		if (classMatches.length === 0) continue
		const fieldMatches = [...tf.code.matchAll(EVENT_FIELD_RE)]
		const aliasMap = aliasMaps.get(tf.path) as Map<string, EventRec>
		for (const cm of classMatches) {
			const start = cm.index as number
			const next = classMatches.find(other => (other.index as number) > start)
			const end = next ? (next.index as number) : tf.code.length
			const rec: HandlerRec = {
				ctx,
				className: cm[2] as string,
				abstract: Boolean(cm[1]),
				file: tf.path,
				line: lineAt(tf.code, start),
				events: [],
				unresolved: [],
				barrel: null,
			}
			const field = fieldMatches.find(f => (f.index as number) > start && (f.index as number) < end)
			if (field) {
				const idents = (field[1] as string)
					.replace(/[[\]]/g, '')
					.replace(/as\s+const/g, '')
					.split(',')
					.map(s => s.trim())
					.filter(Boolean)
				for (const ident of idents) {
					const ev = aliasMap.get(ident)
					if (ev) rec.events.push(ev)
					else rec.unresolved.push(ident)
				}
			}
			handlers.push(rec)
		}
	}

	// ── Barrel parsing (registration gates) ──
	interface Barrel {
		path: string
		origNames: Set<string>
		specs: Set<string> // resolved module paths of `export ... from`
		commentText: string
	}

	const parseGateBarrel = (path: string): Barrel | null => {
		const tf = tsFiles.get(path)
		if (!tf) return null
		const origNames = new Set<string>()
		const specs = new Set<string>()
		for (const m of tf.code.matchAll(/export\s*\{([^}]*)\}(?:\s*from\s*['"]([^'"]+)['"])?/g)) {
			if (m[2]) specs.add(resolveModule(path, m[2] as string))
			for (const raw of (m[1] as string).split(',')) {
				const part = raw.trim()
				if (!part) continue
				const nm = /^(?:type\s+)?(\w+)(?:\s+as\s+\w+)?$/.exec(part)
				if (nm) origNames.add(nm[1] as string)
			}
		}
		for (const m of tf.code.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)) specs.add(resolveModule(path, m[1] as string))
		return { path, origNames, specs, commentText: tf.comments.join('\n') }
	}

	const ctxOf = (path: string): string | null => {
		const m = /^packages\/api\/typescript\/src\/([^/]+)\//.exec(path)
		return m ? (m[1] as string) : null
	}

	const ctxSet = new Set<string>()
	for (const path of tsFiles.keys()) {
		const c = ctxOf(path)
		if (c) ctxSet.add(c)
	}

	const internalBarrels = new Map<string, Barrel>()
	const externalBarrels = new Map<string, Barrel>()
	for (const ctx of ctxSet) {
		const ib = parseGateBarrel(`${TS_SRC}${ctx}/handlers/internal.ts`)
		if (ib) internalBarrels.set(ctx, ib)
		const eb = parseGateBarrel(`${TS_SRC}${ctx}/handlers/external.ts`)
		if (eb) externalBarrels.set(ctx, eb)
	}

	const moduleOf = (path: string): string => path.replace(/\.ts$/, '')
	const barrelCoversFile = (barrel: Barrel, file: string): boolean =>
		barrel.specs.has(moduleOf(file)) || barrel.specs.has(moduleOf(file).replace(/\/index$/, ''))

	for (const h of handlers) {
		const ib = internalBarrels.get(h.ctx)
		const eb = externalBarrels.get(h.ctx)
		// `export *` covers every class in the file; named exports match the original class name
		if (ib && (ib.origNames.has(h.className) || barrelCoversFile(ib, h.file))) h.barrel = 'internal'
		else if (eb && (eb.origNames.has(h.className) || barrelCoversFile(eb, h.file))) h.barrel = 'external'
	}

	// ── Projection / projector index ──
	interface ProjectorRec {
		ctx: string
		className: string
		file: string
		line: number
		eventNames: string[]
		unresolvedLiterals: { name: string; line: number }[]
		registered: boolean
		inline: boolean
	}

	interface ProjectionRec {
		ctx: string
		className: string
		file: string
		line: number
	}

	const projections: ProjectionRec[] = []
	const projectors: ProjectorRec[] = []

	for (const tf of tsFiles.values()) {
		const pm = /^packages\/api\/typescript\/src\/([^/]+)\/projections\/([^/]+)\.ts$/.exec(tf.path)
		if (pm && pm[2] !== 'index') {
			const ctx = pm[1] as string
			for (const m of tf.code.matchAll(/export\s+class\s+(\w+Projection)\b/g))
				projections.push({ ctx, className: m[1] as string, file: tf.path, line: lineAt(tf.code, m.index as number) })
		}
		const jm = /^packages\/api\/typescript\/src\/([^/]+)\/projections\/projectors\/(.+)\.ts$/.exec(tf.path)
		if (jm && (jm[2] as string).split('/').pop() !== 'index') {
			const ctx = jm[1] as string
			const aliasMap = aliasMaps.get(tf.path) as Map<string, EventRec>
			for (const cm of tf.code.matchAll(/export\s+class\s+(\w+)\s+extends\s+Projector\b/g)) {
				const rec: ProjectorRec = {
					ctx,
					className: cm[1] as string,
					file: tf.path,
					line: lineAt(tf.code, cm.index as number),
					eventNames: [],
					unresolvedLiterals: [],
					registered: false,
					inline: false,
				}
				const ef = /readonly\s+events(?:\s*:[^=\n]*)?\s*=\s*\[([^\]]*)\]/.exec(tf.code)
				if (ef) {
					const body = ef[1] as string
					const bodyOffset = (ef.index as number) + ef[0].indexOf(body)
					for (const lit of body.matchAll(/'([^']+)'|"([^"]+)"/g)) {
						const name = (lit[1] ?? lit[2]) as string
						rec.eventNames.push(name)
						if (!byName.has(name)) rec.unresolvedLiterals.push({ name, line: lineAt(tf.code, bodyOffset + (lit.index as number)) })
					}
					for (const ref of body.matchAll(/(\w+)\.name/g)) {
						const ev = aliasMap.get(ref[1] as string)
						if (ev) rec.eventNames.push(ev.eventName)
					}
				}
				projectors.push(rec)
			}
		}
	}

	// Projector registration: exported from projectors/index.ts AND ctx index.ts passes a non-empty slot.
	const ctxIndexCode = (ctx: string): string | null => tsFiles.get(`${TS_SRC}${ctx}/index.ts`)?.code ?? null
	for (const p of projectors) {
		const barrel = parseGateBarrel(`${TS_SRC}${p.ctx}/projections/projectors/index.ts`)
		const exported = Boolean(barrel && (barrel.origNames.has(p.className) || barrelCoversFile(barrel, p.file)))
		const idx = ctxIndexCode(p.ctx)
		const slotEmpty = idx ? /projectors\s*:\s*\{\s*\}/.test(idx) : true
		const slotPresent = idx ? /\bprojectors\s*[,}]|projectors\s*:\s*projectors\b/.test(idx) && !slotEmpty : false
		p.registered = exported && slotPresent
		// inline-projector exemption: resolved/constructed inside a use case
		for (const tf of tsFiles.values()) {
			if (ctxOf(tf.path) !== p.ctx || tf.path.includes('/projections/projectors/')) continue
			if (new RegExp(`new\\s+${p.className}\\s*\\(|resolve\\(\\s*${p.className}\\s*\\)`).test(tf.code)) {
				p.inline = true
				break
			}
		}
	}

	// ── Registered subscriptions (the only ones the mediators ever see) ──
	interface Subscription {
		side: 'internal' | 'external'
		eventName: string
		className: string
		kind: 'handler' | 'projector'
		file: string
		line: number
	}

	const subscriptions: Subscription[] = []
	for (const h of handlers) {
		if (!h.barrel) continue
		for (const ev of h.events)
			subscriptions.push({ side: h.barrel, eventName: ev.eventName, className: h.className, kind: 'handler', file: h.file, line: h.line })
	}
	for (const p of projectors) {
		if (!p.registered) continue
		// registerProjectors wires projector pseudo-handlers on the InternalMediator
		for (const name of new Set(p.eventNames))
			subscriptions.push({ side: 'internal', eventName: name, className: p.className, kind: 'projector', file: p.file, line: p.line })
	}

	const subsByEvent = new Map<string, Subscription[]>()
	for (const s of subscriptions) {
		const list = subsByEvent.get(s.eventName) ?? []
		list.push(s)
		subsByEvent.set(s.eventName, list)
	}

	// ── Go scan (publishers + consumers of wire events) ──
	const goPubsByEvent = new Map<string, Site[]>()
	const goSubsByEvent = new Map<string, Site[]>()
	for (const [path, content] of files) {
		if (!path.startsWith(GO_SRC) || !path.endsWith('.go') || isTestPath(path)) continue
		const { code } = splitComments(content)
		const addGoSite = (map: Map<string, Site[]>, constBase: string, index: number) => {
			const eventName = goConsts.get(constBase)
			if (!eventName) return
			const sites = map.get(eventName) ?? []
			sites.push({ file: path, line: lineAt(code, index) })
			map.set(eventName, sites)
		}
		for (const m of code.matchAll(/Name:\s*wire\.(\w+)EventName\b/g)) addGoSite(goPubsByEvent, m[1] as string, m.index as number)
		for (const m of code.matchAll(/New(?:Integration|Domain)Event\(\s*wire\.(\w+)EventName\b/g))
			addGoSite(goPubsByEvent, m[1] as string, m.index as number)
		// struct construction — `wire.XEvent{}` empty literals are decode scaffolding, not publishes
		for (const m of code.matchAll(/wire\.(\w+)Event\{(?!\})/g)) addGoSite(goPubsByEvent, m[1] as string, m.index as number)
		// consumer: EventName() string method returning a wire const (return may sit on the next line)
		const lines = code.split('\n')
		for (let i = 0; i < lines.length; i++) {
			if (!/func\s*\([^)]*\)\s*EventName\(\)\s*string/.test(lines[i] as string)) continue
			for (let j = i; j < Math.min(i + 4, lines.length); j++) {
				const rm = /return\s+(?:wire|events)\.(\w+)EventName\b/.exec(lines[j] as string)
				if (rm) {
					const eventName = goConsts.get(rm[1] as string)
					if (eventName) {
						const sites = goSubsByEvent.get(eventName) ?? []
						sites.push({ file: path, line: j + 1 })
						goSubsByEvent.set(eventName, sites)
					}
					break
				}
			}
		}
	}

	// ── Comment ledger (documented-pending downgrades) ──
	const ledgerKeyword = /DEFERRED|PENDING|no-?op|intentional/i
	const ledgerFiles: { file: string; text: string }[] = []
	for (const barrel of [...internalBarrels.values(), ...externalBarrels.values()])
		ledgerFiles.push({ file: barrel.path, text: barrel.commentText })
	const documentedPending = (eventName: string, extraFiles: string[]): string | null => {
		for (const lf of ledgerFiles) if (lf.text.includes(eventName) && ledgerKeyword.test(lf.text)) return lf.file
		for (const file of extraFiles) {
			const tf = tsFiles.get(file)
			if (!tf) continue
			const text = tf.comments.join('\n')
			if (text.includes(eventName) && ledgerKeyword.test(text)) return file
		}
		return null
	}

	const isAllowed = (eventName: string, ruleId: string): boolean => allow.some(a => a.event === eventName && (!a.rule || a.rule === ruleId))

	// ═══ SCW-01 — event-without-subscriber / subscriber-without-publisher ═══

	for (const ev of domainEvents) {
		const raises = raisesByEvent.get(ev.eventName) ?? []
		if (raises.length === 0) {
			add(
				'SCW-01a',
				'event#SCW-01a',
				'error',
				ev.file,
				ev.line,
				`domain event '${ev.eventName}' (${ev.className}) is declared and exported but never constructed outside tests — dead event declaration`,
			)
			continue
		}
		const subs = subsByEvent.get(ev.eventName) ?? []
		if (subs.length === 0) {
			add(
				'SCW-01b',
				'event#SCW-01b',
				'info',
				ev.file,
				ev.line,
				`domain event '${ev.eventName}' is raised (${raises.length} site${raises.length === 1 ? '' : 's'}) but has no registered subscriber — events-table record only (intentional unless a side-effect was expected)`,
			)
		}
	}

	for (const ev of wireEvents) {
		const tsPubs = raisesByEvent.get(ev.eventName) ?? []
		const goPubs = goPubsByEvent.get(ev.eventName) ?? []
		const tsSubs = subsByEvent.get(ev.eventName) ?? []
		const goSubs = goSubsByEvent.get(ev.eventName) ?? []
		const pubs = tsPubs.length + goPubs.length
		const subs = tsSubs.length + goSubs.length
		// phase-0 dormant: contract-locked ahead of implementation on BOTH sides — out of scope
		if (pubs === 0 && subs === 0) continue

		if (pubs > 0 && subs === 0) {
			if (isAllowed(ev.eventName, 'SCW-01c')) continue
			const pubSite = tsPubs[0] ?? (goPubs[0] as Site)
			const ledger = documentedPending(
				ev.eventName,
				tsPubs.map(s => s.file),
			)
			const msg = `integration event '${ev.eventName}' is published (TS: ${tsPubs.length}, Go: ${goPubs.length}) but has zero consumers in both TS and Go`
			if (ledger) add('SCW-01c', 'event#SCW-01c', 'info', pubSite.file, pubSite.line, `${msg} — documented-pending in ${ledger}`)
			else add('SCW-01c', 'event#SCW-01c', 'warning', pubSite.file, pubSite.line, msg)
		}

		if (subs > 0 && pubs === 0) {
			if (isAllowed(ev.eventName, 'SCW-01d')) continue
			const subSite = tsSubs[0] ?? (goSubs[0] as Site)
			const ledger = documentedPending(
				ev.eventName,
				tsSubs.map(s => s.file),
			)
			const who = [...tsSubs.map(s => s.className), ...goSubs.map(s => s.file)].join(', ')
			const msg = `integration event '${ev.eventName}' has subscriber(s) (${who}) but no publisher in TS or Go — broken slice`
			if (ledger) add('SCW-01d', 'event#SCW-01d', 'info', subSite.file, subSite.line, `${msg} — documented-pending in ${ledger}`)
			else add('SCW-01d', 'event#SCW-01d', 'warning', subSite.file, subSite.line, msg)
		}
	}

	// ═══ SCW-02 — projection-without-projector + orphan projector ═══

	for (const proj of projections) {
		const owner = projectors.find(p => p.ctx === proj.ctx && (tsFiles.get(p.file)?.code.includes(proj.className) ?? false))
		if (owner) continue
		// documented edge case: projection maintained exclusively by atomic repo ops
		let repoMaintained = false
		const repoIdent = `${proj.className}Repository`
		for (const tf of tsFiles.values()) {
			if (ctxOf(tf.path) !== proj.ctx || tf.path === proj.file) continue
			if (tf.code.includes(repoIdent)) {
				repoMaintained = true
				break
			}
		}
		if (repoMaintained) {
			add(
				'SCW-02',
				'projection#SCW-02',
				'info',
				proj.file,
				proj.line,
				`projection ${proj.className} has no projector but is maintained via ${repoIdent} atomic ops — verify the edge-case triggers (hot row / bulk / monotonic / conditional / cache-mirror) still hold`,
			)
		} else {
			add(
				'SCW-02',
				'projection#SCW-02',
				'error',
				proj.file,
				proj.line,
				`projection ${proj.className} has no projector in ${proj.ctx}/projections/projectors/ — rows will never be created or updated`,
			)
		}
	}

	for (const p of projectors) {
		for (const bad of p.unresolvedLiterals) {
			add(
				'SCW-02',
				'projector#SCW-02',
				'error',
				p.file,
				bad.line,
				`projector ${p.className} subscribes to '${bad.name}' which matches no declared domain or integration event — dispatch will never reach it (typo?)`,
			)
		}
	}

	// ═══ SCW-03 — artifact-not-registered ═══

	// Controllers → controllers/index.ts barrel (matched by module specifier — multi-class files OK)
	const controllerCtxs = new Set<string>()
	for (const tf of tsFiles.values()) {
		const cm = /^packages\/api\/typescript\/src\/([^/]+)\/controllers\/(.+)\.ts$/.exec(tf.path)
		if (!cm || (cm[2] as string).split('/').pop() === 'index') continue
		const classMatch = /export\s+class\s+(\w+)\s+extends\s+\w*Controller\b/.exec(tf.code)
		if (!classMatch) continue
		const ctx = cm[1] as string
		controllerCtxs.add(ctx)
		const barrel = parseGateBarrel(`${TS_SRC}${ctx}/controllers/index.ts`)
		if (!barrel) {
			add(
				'SCW-03',
				'controller#SCW-03',
				'error',
				tf.path,
				lineAt(tf.code, classMatch.index as number),
				`controller ${classMatch[1]} has no ${ctx}/controllers/index.ts barrel — endpoint silently 404s and vanishes from openapi.json`,
			)
			continue
		}
		if (!barrelCoversFile(barrel, tf.path)) {
			add(
				'SCW-03',
				'controller#SCW-03',
				'error',
				tf.path,
				lineAt(tf.code, classMatch.index as number),
				`controller ${classMatch[1]} is not re-exported from ${barrel.path} — endpoint silently 404s and vanishes from openapi.json`,
			)
		}
	}

	/**
	 * O contexto está mapeado sob a própria chave no literal da raiz de composição?
	 *
	 * Duas formas contam, e a segunda é a MAIS forte: `ctx: ident` (explícita) e o SHORTHAND `ctx`
	 * sozinho. No shorthand o mapeamento errado que esta regra caça — `auth: billingDescriptor`, que
	 * compila porque `satisfies` só checa cobertura — é sintaticamente impossível: `auth,` só pode
	 * ligar o identificador `auth`. Recusar o shorthand empurraria o repo para a forma explícita, que
	 * é justamente a única em que o defeito cabe.
	 */
	const mapsContext = (literal: string, ctx: string, ident: string): boolean =>
		new RegExp(`\\b${ctx}\\s*:\\s*${ident}\\b`).test(literal) ||
		(ctx === ident && new RegExp(`(^|[{,\\s])${ctx}\\s*(,|$|\\n)`).test(literal))

	// O `<ctx>/index.ts` tem de levar o namespace de controllers para dentro do DESCRITOR.
	//
	// REPONTADO 2026-08-14: a âncora era `BoundedContext.create`, chamado no topo de cada
	// `<ctx>/index.ts`. Com a composição explícita nenhum contexto monta a si mesmo — o index é DADO
	// (`export default { … } satisfies ContextDescriptor`) e quem monta é `src/compose.ts`. A regra
	// não mudou de sentido: continua sendo "os controllers desta fatia chegam à composição, ou a
	// fatia 404 inteira". Só a forma do arquivo mudou.
	for (const ctx of controllerCtxs) {
		const idx = ctxIndexCode(ctx)
		if (idx === null) continue
		const hasImport = /import\s+\*\s+as\s+controllers\s+from\s+['"]\.\/controllers['"]/.test(idx)
		const descriptorIdx = idx.indexOf('export default {')
		const inDescriptor = descriptorIdx >= 0 && /\bcontrollers\b/.test(idx.slice(descriptorIdx))
		if (!hasImport || !inDescriptor) {
			add(
				'SCW-03',
				'bounded-context#SCW-03',
				'error',
				`${TS_SRC}${ctx}/index.ts`,
				1,
				`${ctx}/index.ts does not wire 'import * as controllers from ./controllers' into its ContextDescriptor — all ${ctx} endpoints 404`,
			)
		}
	}

	// Composition root — `src/manifest.ts` declares `MANIFEST = { <ctx>: <descriptor>, ... } satisfies
	// Record<ContextModule, ContextDescriptor>`, so um contexto AUSENTE já é erro de compilação. O
	// buraco de runtime que sobra para o detector é o mapeamento ERRADO (`auth: billingDescriptor`
	// compila): assere que o import default de cada `<ctx>/index` está mapeado sob a própria chave.
	//
	// REPONTADO 2026-08-14 (era `src/routers.ts`, com `ROUTERS` e `BoundedContext.create`). O
	// `tsFiles.get(...)` devolvendo undefined fazia o bloco INTEIRO ser pulado em silêncio — a regra
	// SCW-03 simplesmente parava de existir no dia em que o arquivo mudasse de nome. Por isso a
	// ausência agora é um ACHADO, não um `if` que não entra.
	const compositionRoot = tsFiles.get(`${TS_SRC}manifest.ts`)
	// A ausência da raiz só é ACHADO quando existe algo a compor: pelo menos um contexto declarando
	// `satisfies ContextDescriptor`. Uma árvore com descritores e sem raiz está genuinamente quebrada
	// — os contextos existem e nada os monta. Uma árvore sem descritor nenhum não deve nada a esta
	// regra, e cobrar dela seria transformar a checagem em ruído sobre toda fixture que testa outro
	// assunto. O que NÃO é aceitável é o silêncio de antes: `tsFiles.get` devolvendo undefined pulava
	// o bloco inteiro, então a regra parava de existir sem dizer nada.
	const declaresDescriptor = [...ctxSet].some(ctx => ctxIndexCode(ctx)?.includes('satisfies ContextDescriptor'))
	if (!compositionRoot && declaresDescriptor) {
		add(
			'SCW-03',
			'bounded-context#SCW-03',
			'error',
			`${TS_SRC}manifest.ts`,
			1,
			'composition root not found, but contexts declare a ContextDescriptor — nothing mounts them, and SCW-03 cannot check that each is mapped under its own key. A check that silently does not run is worse than one that fails.',
		)
	}
	const routersRoot = compositionRoot
	if (routersRoot) {
		const routerImports = new Map<string, string>() // ctx → imported identifier
		for (const m of routersRoot.code.matchAll(DEFAULT_IMPORT_RE)) {
			const resolved = resolveModule(routersRoot.path, m[2] as string)
			const rm = /^packages\/api\/typescript\/src\/([^/]+)(?:\/index)?$/.exec(resolved)
			if (rm) routerImports.set(rm[1] as string, m[1] as string)
		}
		const routersLiteral = /\bMANIFEST\s*=\s*\{([\s\S]*?)\}/.exec(routersRoot.code)
		for (const ctx of ctxSet) {
			const idx = ctxIndexCode(ctx)
			if (!idx?.includes('satisfies ContextDescriptor')) continue
			const ident = routerImports.get(ctx)
			if (!ident) {
				add(
					'SCW-03',
					'bounded-context#SCW-03',
					'error',
					routersRoot.path,
					1,
					`src/manifest.ts does not import the ${ctx} context descriptor — the context is absent from composition: controllers, handlers AND DI registry of '${ctx}' never reach the container`,
				)
			} else if (routersLiteral && !mapsContext(routersLiteral[1] as string, ctx, ident)) {
				add(
					'SCW-03',
					'bounded-context#SCW-03',
					'error',
					routersRoot.path,
					lineAt(routersRoot.code, routersLiteral.index as number),
					`${ident} (ctx '${ctx}') is imported but not mapped as \`${ctx}: ${ident}\` in the MANIFEST literal — a wrong-key mapping compiles (satisfies only checks coverage) yet composes the wrong context`,
				)
			}
		}
	}

	// Handlers → internal.ts / external.ts barrel (+ sub-handler & DEFERRED exemptions, direction rule)
	for (const h of handlers) {
		if (h.abstract) continue
		if (h.barrel === null) {
			// sub-handler discipline: composed by a parent handler in the same ctx
			let composed = false
			for (const tf of tsFiles.values()) {
				if (tf.path === h.file) continue
				if (!tf.path.startsWith(`${TS_SRC}${h.ctx}/handlers/`)) continue
				if (tf.imports.some(imp => imp.orig === h.className)) {
					composed = true
					break
				}
			}
			if (composed) continue
			const ib = internalBarrels.get(h.ctx)
			const eb = externalBarrels.get(h.ctx)
			const ledgered = [ib, eb].some(b => b?.commentText.includes(h.className) && ledgerKeyword.test(b?.commentText ?? ''))
			if (ledgered) continue
			add(
				'SCW-03',
				'handler#SCW-03',
				'error',
				h.file,
				h.line,
				`handler ${h.className} is not exported from ${h.ctx}/handlers/internal.ts or external.ts — invisible to the mediator: its events are consumed from the outbox and deleted without the side-effect ever running`,
			)
			continue
		}
		// direction rule — wrong barrel binds the wrong mediator and the handler silently never fires
		if (h.events.length > 0) {
			const kinds = new Set(h.events.map(e => e.kind))
			if (kinds.size === 1) {
				const kind = h.events[0]?.kind
				if (kind === 'wire' && h.barrel === 'internal') {
					add(
						'SCW-03',
						'handler#SCW-03',
						'error',
						h.file,
						h.line,
						`handler ${h.className} subscribes to integration event '${h.events[0]?.eventName}' but is exported from internal.ts — it binds the InternalMediator and never receives the ExternalMediator dispatch; move to external.ts`,
					)
				} else if (kind === 'domain' && h.barrel === 'external') {
					add(
						'SCW-03',
						'handler#SCW-03',
						'error',
						h.file,
						h.line,
						`handler ${h.className} subscribes to domain event '${h.events[0]?.eventName}' but is exported from external.ts — it binds the ExternalMediator and never receives the outbox dispatch; move to internal.ts`,
					)
				}
			}
		}
	}

	// Projectors → projectors/index.ts barrel + non-empty BoundedContext slot
	for (const p of projectors) {
		if (p.registered || p.inline) continue
		add(
			'SCW-03',
			'projector#SCW-03',
			'error',
			p.file,
			p.line,
			`projector ${p.className} is not registered: it must be exported from ${p.ctx}/projections/projectors/index.ts and the ctx must pass a non-empty 'projectors' slot to BoundedContext.create (or be resolved inline by a use case)`,
		)
	}

	// Context DI wiring: registry spread, errors side-effect import, enums registration
	const sharedRegistry = tsFiles.get(`${TS_SRC}shared/registry.ts`)
	for (const ctx of ctxSet) {
		const registry = tsFiles.get(`${TS_SRC}${ctx}/registry.ts`)
		// ── A CHECAGEM DE CHAVE DO REGISTRY FOI APOSENTADA (F2, gate humano 8a) ──────────────────────
		//
		// Ela tinha duas pernas, e as duas morreram por motivos DIFERENTES — o que importa, porque a
		// regra da casa é que um rail só sai provando que virou vacuoso por construção, nunca por ter
		// ficado inconveniente.
		//
		// PERNA 1 (`!alias`) cobrava que `shared/registry.ts` importasse o `INSTANCE_REGISTRY` de cada
		// contexto. Esse import DEIXOU DE EXISTIR: o mapa saiu daquele arquivo e virou
		// `src/registries.generated.ts`. Medido no momento da mudança: mantê-la produzia 9 erros
		// GATING, um por contexto não-`shared`, todos falsos — o detector cobrando uma linha que a
		// reforma tornou errada. Não é o defeito que ela procurava; é o rastro dele.
		//
		// PERNA 2 (a chave certa) procurava `auth: billingRegistry` — um pareamento trocado, que o
		// `satisfies` não pega porque ele só confere COBERTURA. Essa é a que virou vacuosa POR
		// CONSTRUÇÃO: em `renderRegistries` (scripts/contexts/aggregate.ts) a chave, o alias e o
		// especificador de módulo interpolam o MESMO binding `id`, na MESMA iteração. Não há segunda
		// lista, lookup nem pareamento por índice que possa dessincronizar, e `id` é o nome do diretório
		// lido por `loadContexts`. O defeito subiu do rung "detectar" para "não poder existir".
		//
		// O QUE SUBSTITUI: `bun run contexts:check`, que reprova se o gerado divergir da fonte, e o
		// `satisfies Record<ContextId, InstanceRegistry>` no próprio gerado, que mantém a cobertura como
		// erro de compilação.
		//
		// NO TEMPLATE ELA FICA. Lá o mapa é escrito À MÃO (não há gerador), então a perna 2 continua
		// cobrando um defeito que ainda PODE existir — o template tem cópia própria e independente deste
		// detector, e a decisão aqui não o alcança.
		const hasErrors = [...tsFiles.keys()].some(p => p.startsWith(`${TS_SRC}${ctx}/errors/`))
		if (registry && hasErrors && !/import\s+['"]\.\/errors['"]/.test(registry.code)) {
			add(
				'SCW-03',
				'errors#SCW-03',
				'error',
				registry.path,
				1,
				`${ctx}/registry.ts is missing the side-effect import './errors' — BaseError codes from '${ctx}' are unknown to the GlobalErrorMapper (wrong HTTP status + missing i18n key)`,
			)
		}
	}

	const sharedIndex = tsFiles.get(`${TS_SRC}shared/index.ts`)
	if (sharedIndex) {
		const enumsCall = /registerEnums\(([\s\S]*?)\)/.exec(sharedIndex.code)
		for (const ctx of ctxSet) {
			const enumsBarrel = tsFiles.get(`${TS_SRC}${ctx}/enums/index.ts`)
			if (!enumsBarrel) continue
			// Empty placeholder barrels have nothing to register — both the comment-only shape
			// ("// Export enums here") and the module-marker shape (`export {}`).
			if (!/^\s*export\s+(?!\{\s*\})/m.test(enumsBarrel.code)) continue
			let alias: string | null = null
			for (const m of sharedIndex.code.matchAll(NS_IMPORT_RE)) {
				if (resolveModule(sharedIndex.path, m[2] as string) === `${TS_SRC}${ctx}/enums`) {
					alias = m[1] as string
					break
				}
			}
			if (!alias || !enumsCall || !(enumsCall[1] as string).includes(`...${alias}`)) {
				add(
					'SCW-03',
					'enum#SCW-03',
					'warning',
					sharedIndex.path,
					enumsCall ? lineAt(sharedIndex.code, enumsCall.index as number) : 1,
					`${ctx}/enums is not spread into openapi.registerEnums in shared/index.ts — SDK emits collision-named duplicate enum components`,
				)
			}
		}
	}

	// ═══ SCW-04 — duplicate-subscriber collision (last-write-wins mediator only) ═══

	// Tied to the replacement block: collisions are only a defect under the legacy
	// delete-and-replace register(). The HEAD mediator is true multicast (>1 subscriber
	// per event name is expected fan-out), so the default is OFF — the check arms itself
	// only when the mediator source on disk still shows replacement semantics.
	let mediatorReplaces = false
	for (const [path, content] of files) {
		if (!path.endsWith('EventEmitter2Mediator.ts')) continue
		mediatorReplaces = /already registered, replacing|removeAllListeners\(name\)/.test(content)
		break
	}
	if (mediatorReplaces) {
		const grouped = new Map<string, Subscription[]>()
		for (const s of subscriptions) {
			const key = `${s.side}\u0000${s.eventName}`
			const list = grouped.get(key) ?? []
			list.push(s)
			grouped.set(key, list)
		}
		for (const [key, list] of grouped) {
			if (list.length < 2) continue
			const [side, eventName] = key.split('\u0000') as [string, string]
			const first = list[0] as Subscription
			const who = list.map(s => `${s.className} (${s.file})`).join(', ')
			add(
				'SCW-04',
				'handler#SCW-04',
				'error',
				first.file,
				first.line,
				`${list.length} subscribers registered for '${eventName}' on the ${side} mediator — EventEmitter2Mediator.register is last-write-wins, so all but the last-registered are silently dropped: ${who}`,
			)
		}
	}

	// SCW-05 — controller derivation coexistence (controller CTRL-C04 lifecycle): a
	// controller that IMPORTS a use case's InputSchema while hand-building its body with
	// z.object( and never calling .omit( re-declares fields the schema already owns. The
	// inline body is canon ONLY while no use case schema exists (mock mode) — coexistence
	// is the violation. k=2 measured (be-wireexp iter1+iter2 derive-omit).
	for (const [path, source] of files) {
		if (!/packages\/api\/typescript\/src\/[^/]+\/controllers\/[^/]+\.ts$/.test(path)) continue
		if (path.endsWith('.test.ts') || path.endsWith('index.ts')) continue
		const importsUsecaseSchema = /import\s*\{[^}]*\w+InputSchema[^}]*\}\s*from\s*['"]\.\.\/usecases\//.test(source)
		const handBuiltBody = /body:\s*z\.object\(/.test(source)
		const derives = /InputSchema\s*\n?\s*\.omit\(/.test(source)
		if (importsUsecaseSchema && handBuiltBody && !derives) {
			add(
				'SCW-05',
				'controller#CTRL-C04',
				'error',
				path,
				1,
				'controller imports a use case InputSchema but hand-builds its body with z.object() and never derives via .omit() — re-declared fields drift from the schema they shadow (CTRL-C04 coexistence; inline bodies are canon only while NO use case schema exists).',
			)
		}
	}

	findings.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1))
	return findings
}

// ─── CLI ────────────────────────────────────────────────────────────

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
// ROOT_OVERRIDE (env) retargets the walked tree (eval worktrees — scripts/skill-evals/); unset → identical behavior.
// The allowlist stays next to THIS script (main repo) — suppression policy is not ref-pinned.
const PROJECT_ROOT = process.env.ROOT_OVERRIDE ? resolve(process.env.ROOT_OVERRIDE) : resolve(SCRIPT_DIR, '../..')
const ALLOW_FILE = join(SCRIPT_DIR, 'slice-closure.allow.yaml')

function collectFiles(root: string): Map<string, string> {
	const files = new Map<string, string>()
	const addTree = (dir: string, exts: string[]) => {
		const abs = join(root, dir)
		if (!existsSync(abs)) return
		const walkDir = (d: string) => {
			for (const entry of readdirSync(d)) {
				if (entry === 'node_modules' || entry.startsWith('.')) continue
				const full = join(d, entry)
				const st = statSync(full)
				if (st.isDirectory()) walkDir(full)
				else if (exts.some(e => entry.endsWith(e))) {
					const rel = relative(root, full).replaceAll('\\', '/')
					if (!isTestPath(rel)) files.set(rel, readFileSync(full, 'utf-8'))
				}
			}
		}
		walkDir(abs)
	}
	addTree('packages/api/typescript/src', ['.ts'])
	addTree(`${REPO.packageRoots.contractsGenTs}/src/wire/events`, ['.ts'])
	addTree(REPO.packageRoots.apiGo, ['.go'])
	const goWireAbs = join(root, GO_WIRE_FILE)
	if (existsSync(goWireAbs)) files.set(GO_WIRE_FILE, readFileSync(goWireAbs, 'utf-8'))
	const mediatorRel = 'packages/api/typescript/core/src/services/Mediator/EventEmitter2Mediator.ts'
	const mediatorAbs = join(root, mediatorRel)
	if (existsSync(mediatorAbs)) files.set(mediatorRel, readFileSync(mediatorAbs, 'utf-8'))
	return files
}

function loadAllowlist(): AllowEntry[] {
	if (!existsSync(ALLOW_FILE)) return []
	const parsed = parseYaml(readFileSync(ALLOW_FILE, 'utf-8')) as { allow?: AllowEntry[] } | null
	return parsed?.allow ?? []
}

// ─── Baseline (ratchet — same pattern as registry-scan) ─────────────
// Known-debt ERROR findings (the ticketed dead events) keyed `${ruleId}::${file}`; only
// NEW errors gate. Fix debt → --update-baseline ratchets the file down. The baseline
// stays next to THIS script (main repo) — like the allowlist, it is not ref-pinned.

const BASELINE_FILE = join(SCRIPT_DIR, 'slice-closure.baseline.json')

export function sliceBaselineKey(f: Finding): string {
	return `${f.ruleId}::${f.file}`
}

function loadSliceBaseline(): Set<string> {
	if (!existsSync(BASELINE_FILE)) return new Set()
	return new Set(JSON.parse(readFileSync(BASELINE_FILE, 'utf-8')) as string[])
}

if (import.meta.main) {
	const args = process.argv.slice(2)
	const json = args.includes('--json')
	const fileArgs = args.filter(a => !a.startsWith('--'))

	const files = collectFiles(PROJECT_ROOT)
	let findings = walk(files, { allow: loadAllowlist() })

	if (fileArgs.length > 0) {
		const wanted = new Set(fileArgs.map(f => relative(PROJECT_ROOT, resolve(PROJECT_ROOT, f)).replaceAll('\\', '/')))
		findings = findings.filter(f => wanted.has(f.file))
	}

	if (args.includes('--update-baseline')) {
		const keys = [...new Set(findings.filter(f => f.severity === 'error').map(sliceBaselineKey))].sort()
		writeFileSync(BASELINE_FILE, `${JSON.stringify(keys, null, '\t')}\n`)
		console.log(`baseline updated: ${keys.length} error key(s) → ${relative(PROJECT_ROOT, BASELINE_FILE)}`)
		process.exit(0)
	}
	const baseline = args.includes('--no-baseline') ? new Set<string>() : loadSliceBaseline()
	const baselined = findings.filter(f => f.severity === 'error' && baseline.has(sliceBaselineKey(f)))
	const gating = findings.filter(f => f.severity === 'error' && !baseline.has(sliceBaselineKey(f)))

	if (json) {
		console.log(JSON.stringify(findings, null, 2))
	} else {
		for (const f of findings) {
			const mark = f.severity === 'error' && baseline.has(sliceBaselineKey(f)) ? ' [baselined debt]' : ''
			console.log(`${f.file}:${f.line} [${f.severity}] ${f.ruleId} (${f.source}) — ${f.message}${mark}`)
		}
		const counts = new Map<string, number>()
		for (const f of findings) counts.set(`${f.ruleId}/${f.severity}`, (counts.get(`${f.ruleId}/${f.severity}`) ?? 0) + 1)
		const summary = [...counts.entries()]
			.sort()
			.map(([k, n]) => `${k}: ${n}`)
			.join(', ')
		const ratchet = baselined.length > 0 ? ` (${baselined.length} error(s) baselined — ratchet via --update-baseline)` : ''
		console.log(`\n${findings.length} finding(s)${summary ? ` — ${summary}` : ''}${ratchet}`)
	}

	process.exit(gating.length > 0 ? 1 : 0)
}
