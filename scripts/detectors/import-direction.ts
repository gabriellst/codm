#!/usr/bin/env bun
/**
 * import-direction.ts — path-conditional import lint (rules R1–R6).
 *
 * Ground truth: recon calibration (2026-06-09) — regexes, fromGlobs and the sanctioned
 * exception list are verbatim from it so the lint reports ZERO false positives at HEAD.
 *
 * Usage:
 *   bun scripts/detectors/import-direction.ts                 # changed files (git diff + untracked)
 *   bun scripts/detectors/import-direction.ts --all           # full default glob
 *   bun scripts/detectors/import-direction.ts [--json] f1 f2  # specific files
 *
 * Exit 1 iff any severity 'error' finding (suppressed findings never fail the run).
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { REPO } from '../../template.config'
import { CONTEXTS } from '../../packages/api/typescript/generated/contexts.generated'

// Derived once from the spine; interpolated into rule patterns below.
const CTX_ALT = Object.keys(CONTEXTS).join('|')

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
// ROOT_OVERRIDE (env) retargets the scanned tree (eval worktrees — scripts/skill-evals/); unset → identical behavior.
const PROJECT_ROOT = process.env.ROOT_OVERRIDE ? resolve(process.env.ROOT_OVERRIDE) : resolve(SCRIPT_DIR, '../..')

// Repo identity from template.config.ts — package specifiers in rule patterns
// must never be literal (sync-machinery P1-2). All three are regex-safe after
// escapeRegExp (hoisted function declaration, defined below).
const SCOPE_RE = escapeRegExp(REPO.scope)
const CORE_PKG_RE = escapeRegExp(REPO.corePackage)
const API_TS_SRC = REPO.workspaceRoots.apiTs
const REACT_SRC = REPO.workspaceRoots.appReact

// ─── Types ──────────────────────────────────────────────────────────

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

interface Rule {
	id: string
	name: string
	fromGlob: string
	/** Recon `bannedImportPattern` verbatim. `$CTX` is replaced per-file (R3). */
	pattern: string
	/** Pattern includes call-site alternations (fetch(, .publish() — scan every line, not just imports. */
	callSite: boolean
	/** All six rules calibrated with zero 'unclear' verdicts → error. */
	severity: Finding['severity']
	message: string
	/**
	 * Repo-relative path PREFIXES, or a `*<suffix>` glob matched against the end of the path
	 * (e.g. `*.services.test.tsx`) — matches are skipped silently, counted as 'suppressed'.
	 */
	exceptions: string[]
}

/** A prefix exception matches from the start of the path; a leading `*` matches the END instead. */
function matchesException(file: string, pattern: string): boolean {
	return pattern.startsWith('*') ? file.endsWith(pattern.slice(1)) : file.startsWith(pattern)
}

// ─── Rules (recon-verbatim) ─────────────────────────────────────────

const RULES: Rule[] = [
	{
		id: 'R1',
		name: 'controller-no-repositories-no-drizzleclient',
		fromGlob: `${API_TS_SRC}/*/controllers/**/!(*.test).ts`,
		pattern: String.raw`(?:from\s+['"][^'"]*\/repositories(?:\/[^'"]*)?['"])|(?:import\s+(?:type\s+)?\{[^}]*\b(?:DrizzleClient|[A-Z]\w*Repository)\b[^}]*\}\s+from)`,
		callSite: false,
		severity: 'error',
		message: 'controllers never touch repositories or DrizzleClient — they validate and call a use case (docs/BACKEND.md)',
		exceptions: [],
	},
	{
		id: 'R2',
		name: 'react-sdk-only-no-raw-http',
		fromGlob: `${REACT_SRC}/**/!(*.test|*.stories|*.spec).{ts,tsx}`,
		pattern: String.raw`(?:from\s+['"](?:axios|ky|got|node-fetch|cross-fetch|superagent|redaxios)(?:\/[^'"]*)?['"])|(?:(?<![\w$.])fetch\s*\()|(?:\b(?:window|globalThis)\s*\.\s*fetch\s*\()`,
		callSite: true,
		severity: 'error',
		message: `frontend consumes the backend only via ${REPO.sdkPackage} SDK hooks — never raw fetch or an HTTP client (CLAUDE.md)`,
		exceptions: [
			// MSW mock infrastructure (shared mock.ts / withConnected.tsx helpers).
			'packages/app/react/src/storybook/',
			// The loopback-auth deep-link exchange (`useLoopbackAuth`, documented in its own docblock)
			// resolves `globalThis.fetch` at call time on purpose — it is the fix for a real bug (the
			// better-auth client otherwise captures `fetch` at import time, making it unspyable in tests),
			// not a raw-HTTP violation of the SDK-only rule: `auth.ts` is the better-auth CLIENT itself,
			// the one piece of the app allowed to talk to the cloud auth server directly, since no SDK
			// endpoint exists for it (auth is better-auth's own wire, not a codm controller).
			'packages/app/react/src/lib/auth.ts',
		],
	},
	{
		id: 'R3',
		name: 'no-cross-context-entity-imports',
		fromGlob: `${API_TS_SRC}/**/!(*.test).ts`,
		// Context alternation DERIVED from the CONTEXTS spine — the old literal list protected 9 dead
		// contexts while leaving owner/quota unguarded (HD-01 of the declarative-repo plan).
		pattern: String.raw`from\s+['"](?:@(?!$CTX\/)(?:${CTX_ALT})|(?:\.\.\/)+(?!$CTX\/)(?:${CTX_ALT}))\/entities\/`,
		callSite: false,
		severity: 'error',
		message:
			"cross-context reads go through the other context's repository or integration events — never its entities (docs/BACKEND.md); tests are excluded by glob",
		exceptions: [],
	},
	{
		id: 'R4',
		name: 'usecase-no-direct-mediator-publish-outbox-only',
		fromGlob: `${API_TS_SRC}/*/usecases/**/!(*.test).ts`,
		pattern: String.raw`(?:import\s[^;]*\b(?:InternalMediator|ExternalMediator)\b[^;]*from\s+['"]${CORE_PKG_RE}['"])|(?:\b(?:internalMediator|externalMediator)\s*\.\s*publish\s*\()`,
		callSite: true,
		severity: 'error',
		message:
			'integration events are published by handlers via the outbox — a publish inside a use case bypasses outbox atomicity (CLAUDE.md)',
		exceptions: [],
	},
	{
		id: 'R5',
		name: 'react-no-backend-package-imports',
		fromGlob: `${REACT_SRC}/**/*.{ts,tsx}`,
		pattern: String.raw`from\s+['"](?:${SCOPE_RE}\/(?:api-typescript|core-typescript)(?:\/[^'"]*)?|[^'"]*(?:\.\.\/)+(?:packages\/)?api\/(?:typescript|go)\/[^'"]*)['"]`,
		callSite: false,
		severity: 'error',
		message:
			'the app never imports backend workspace packages — the only wire surface is the generated SDK (CLAUDE.md); applies to tests/stories too',
		exceptions: [
			// Cross-service suites (`*.services.test.tsx`) are BY DESIGN the one place the app imports a
			// backend workspace package: `scripts/test-cross-service.ts` boots `services: ['apiGo']` and
			// seeds state straight through `@codm/api-typescript/testing`'s given-helpers, in a dedicated
			// `bun test` process per file, never bundled into the shipped app. The naming convention IS
			// the enforcement — a `.test.tsx` importing `/testing` outside this suffix is a mis-scoped
			// cross-service test, not a sanctioned one (see the `component` skill's test-shape rules).
			'*.services.test.tsx',
		],
	},
	{
		id: 'R6',
		name: 'middleware-no-drizzleclient-injection',
		fromGlob: `${API_TS_SRC}/*/middlewares/**/!(*.test).ts`,
		pattern: String.raw`import\s[^;]*\bDrizzleClient\b[^;]*from\s+['"]${CORE_PKG_RE}['"]`,
		callSite: false,
		severity: 'error',
		message:
			'middlewares enforce preconditions via services/repositories, not raw DrizzleClient access (.claude/skills/middleware/typescript/SKILL.md)',
		exceptions: [],
	},
]

// ─── Glob compiler ──────────────────────────────────────────────────
// Extends .claude/hooks/classify-edit.ts globToRegExp with `{a,b}` braces and
// extglob negation `!(p1|p2)` (compiled as a lookahead against rest-of-glob).

function globBody(glob: string): string {
	let body = ''
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i]
		if (c === '!' && glob[i + 1] === '(') {
			const close = glob.indexOf(')', i + 2)
			const alts = glob
				.slice(i + 2, close)
				.split('|')
				.map(a => globBody(a))
				.join('|')
			// Segment matches unless (inner-alt + rest-of-glob) would match to end.
			const rest = globBody(glob.slice(close + 1))
			body += `(?!(?:${alts})${rest}$)[^/]*`
			i = close
		} else if (c === '*') {
			if (glob[i + 1] === '*') {
				if (glob[i + 2] === '/') {
					body += '(?:.*/)?'
					i += 2
				} else {
					body += '.*'
					i++
				}
			} else {
				body += '[^/]*'
			}
		} else if (c === '{') {
			const close = glob.indexOf('}', i)
			const alts = glob
				.slice(i + 1, close)
				.split(',')
				.map(a => globBody(a))
				.join('|')
			body += `(?:${alts})`
			i = close
		} else if ('\\^$.|?+()[]'.includes(c)) {
			body += `\\${c}`
		} else {
			body += c
		}
	}
	return body
}

function globToRegExp(glob: string): RegExp {
	return new RegExp(`^${globBody(glob)}$`)
}

// ─── Rule regex resolution ──────────────────────────────────────────

const globCache = new Map<string, RegExp>()
const patternCache = new Map<string, RegExp>()

function ruleGlob(rule: Rule): RegExp {
	let re = globCache.get(rule.id)
	if (!re) {
		re = globToRegExp(rule.fromGlob)
		globCache.set(rule.id, re)
	}
	return re
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** R3 is self-context aware: $CTX = first path segment under packages/api/typescript/src/. */
function rulePattern(rule: Rule, file: string): RegExp {
	if (!rule.pattern.includes('$CTX')) {
		let re = patternCache.get(rule.id)
		if (!re) {
			re = new RegExp(rule.pattern)
			patternCache.set(rule.id, re)
		}
		return re
	}
	const ctx = file.match(/packages\/api\/typescript\/src\/([^/]+)\//)?.[1] ?? '__no_ctx__'
	const key = `${rule.id}:${ctx}`
	let re = patternCache.get(key)
	if (!re) {
		re = new RegExp(rule.pattern.replaceAll('$CTX', escapeRegExp(ctx)))
		patternCache.set(key, re)
	}
	return re
}

// ─── Import statement extraction (line-oriented; joins multi-line imports) ──

interface ImportStatement {
	line: number
	text: string
	multiline: boolean
}

function braceDelta(text: string): number {
	let d = 0
	for (const ch of text) {
		if (ch === '{') d++
		else if (ch === '}') d--
	}
	return d
}

function extractImportStatements(lines: string[]): ImportStatement[] {
	const out: ImportStatement[] = []
	for (let i = 0; i < lines.length; i++) {
		const l = lines[i]
		const isImport = /^\s*import\b/.test(l)
		const isReexport = /^\s*export\s+(?:type\s+)?\{/.test(l) || /^\s*export\s+\*/.test(l)
		const isRequire = /require\(/.test(l)
		if (!isImport && !isReexport && !isRequire) continue
		let text = l.trim()
		let j = i
		// Multi-line `import {\n …\n} from 'x'` — join until braces balance.
		while (j < lines.length - 1 && j - i < 40 && braceDelta(text) > 0) {
			j++
			text += ` ${lines[j].trim()}`
		}
		out.push({ line: i + 1, text, multiline: j > i })
		i = j
	}
	return out
}

// ─── Core check ─────────────────────────────────────────────────────

export function checkFile(file: string, content: string): { findings: Finding[]; suppressed: Finding[] } {
	const findings: Finding[] = []
	const suppressed: Finding[] = []
	const lines = content.split('\n')
	let imports: ImportStatement[] | null = null

	for (const rule of RULES) {
		if (!ruleGlob(rule).test(file)) continue
		const re = rulePattern(rule, file)
		imports ??= extractImportStatements(lines)

		const hits = new Map<number, string>()
		for (const stmt of imports) {
			if (re.test(stmt.text)) hits.set(stmt.line, stmt.text)
		}
		if (rule.callSite) {
			for (let i = 0; i < lines.length; i++) {
				if (!hits.has(i + 1) && re.test(lines[i])) hits.set(i + 1, lines[i])
			}
		}
		if (hits.size === 0) continue

		const bucket = rule.exceptions.some(pattern => matchesException(file, pattern)) ? suppressed : findings
		for (const [line, text] of [...hits.entries()].sort((a, b) => a[0] - b[0])) {
			bucket.push({
				detector: 'import-direction',
				ruleId: rule.id,
				source: `import-direction#${rule.id}`,
				file,
				line,
				severity: rule.severity,
				message: `${rule.name}: ${rule.message}`,
				excerpt: text.trim().slice(0, 200),
			})
		}
	}
	return { findings, suppressed }
}

// ─── File discovery ─────────────────────────────────────────────────

const SCAN_ROOTS = [API_TS_SRC, REACT_SRC]

function listAllFiles(): string[] {
	const files: string[] = []
	for (const root of SCAN_ROOTS) {
		const abs = resolve(PROJECT_ROOT, root)
		if (!existsSync(abs)) continue
		for (const entry of readdirSync(abs, { recursive: true }) as string[]) {
			if (!/\.tsx?$/.test(entry) || entry.includes('node_modules')) continue
			files.push(`${root}/${entry}`)
		}
	}
	return files.sort()
}

function listChangedFiles(): string[] {
	const run = (cmd: string) => execSync(cmd, { cwd: PROJECT_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
	const changed = [...run('git diff --name-only HEAD'), ...run('git ls-files --others --exclude-standard')]
	return [...new Set(changed)].filter(f => /\.tsx?$/.test(f))
}

function toRepoRelative(arg: string): string {
	const abs = isAbsolute(arg) ? arg : resolve(process.cwd(), arg)
	return existsSync(abs) ? relative(PROJECT_ROOT, abs) : arg
}

// ─── CLI ────────────────────────────────────────────────────────────

function main(): void {
	const args = process.argv.slice(2)
	const json = args.includes('--json')
	const all = args.includes('--all')
	const fileArgs = args.filter(a => !a.startsWith('--'))

	const targets = fileArgs.length > 0 ? fileArgs.map(toRepoRelative) : all ? listAllFiles() : listChangedFiles()

	const findings: Finding[] = []
	const suppressedByRule: Record<string, number> = {}
	let suppressedTotal = 0
	let scanned = 0

	for (const file of targets) {
		const abs = resolve(PROJECT_ROOT, file)
		if (!existsSync(abs) || !statSync(abs).isFile()) continue
		scanned++
		const result = checkFile(file, readFileSync(abs, 'utf8'))
		findings.push(...result.findings)
		for (const s of result.suppressed) {
			suppressedByRule[s.ruleId] = (suppressedByRule[s.ruleId] ?? 0) + 1
			suppressedTotal++
		}
	}

	const errors = findings.filter(f => f.severity === 'error').length

	if (json) {
		console.log(JSON.stringify({ findings, suppressed: suppressedTotal, suppressedByRule }, null, 2))
	} else {
		for (const f of findings) {
			console.log(`${f.file}:${f.line} [${f.severity}] ${f.source} — ${f.message}`)
			if (f.excerpt) console.log(`    ${f.excerpt}`)
		}
		const warnings = findings.length - errors
		console.log(
			`\n${findings.length} finding(s) (${errors} error, ${warnings} warning), ${suppressedTotal} suppressed, ${scanned} file(s) scanned`,
		)
	}

	process.exit(errors > 0 ? 1 : 0)
}

if (import.meta.main) main()
