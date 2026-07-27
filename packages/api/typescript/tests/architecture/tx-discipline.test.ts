import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Tx-discipline guard (cc-bp-24 in .claude/registry.yaml) — the mechanical half of the invariant
 * that holds the event-driven architecture together:
 *
 *   INSIDE a transaction callback — `withTransaction(...)` OR a bare `.transaction(async tx => …)`
 *   on a unit of work / the database driver — every awaited `this.*` call must reference the
 *   callback's transaction parameter, and NOTHING may touch `this.db`.
 *
 * The four things that must commit-or-rollback TOGETHER are: aggregate state, the idempotency
 * claim that dedups the effect, the domain/integration event that announces it, and the scheduled
 * command enqueue/cancel. The `tx` parameter is optional on every repository/service signature, so
 * omitting it COMPILES and passes happy-path tests — the write just runs on its own pooled
 * connection and commits even when the surrounding unit rolls back. That failure only surfaces as
 * a claim without its effect, an event without its state, or an alarm for a row that doesn't
 * exist — in production, under partial failure. This guard turns the convention into a build error.
 *
 * How it checks: for every `withTransaction(` call in production code, it extracts the balanced
 * call span, reads the callback's tx-param name (`tx`, `t`, ...), and flags any `await this....`
 * expression inside the span whose full text never mentions that parameter. Pure sync helpers are
 * invisible (not awaited); external-I/O calls (payment provider, mail) are expected to live
 * OUTSIDE the tx entirely (the claim-before-call / fire-after-commit pattern), so inside a span
 * they are flagged too — deliberately: holding a DB transaction across gateway/SMTP I/O is its own
 * bug even when no tx arg is missing.
 *
 * False positives go in EXEMPTIONS below with a `why`, not in weakened matching.
 *
 * THE SECOND RULE — `this.db` inside a tx span — was added with the SQLite flip and is not a style
 * preference. `this.db` is the driver's dedicated READ connection; the write handle only ever
 * arrives as the callback's parameter. A WRITE through `this.db` runs outside the write lock (an
 * implicit transaction outside the serializing gate). A READ through it is worse, because it is
 * completely silent: it observes PRE-transaction state, with no error and no wrong type. The claim
 * loops (`SqliteCommandQueue.claimDueBatch`, `DrizzleOutboxDispatcher.claimBatch`,
 * `SqlExternalMediator.claimBatch`) are `SELECT ids → UPDATE lease → SELECT rows` in one
 * transaction; a single SELECT on the wrong handle returns the rows WITHOUT the lease that same
 * transaction just wrote, and the row is handed to two cycles. Inside a transaction callback the
 * ONLY legitimate handle is the `tx` parameter.
 *
 * Lives in `tests/architecture/` — the shared home for all repo-wide/context-wide mechanical
 * detectors (see `tests/architecture/README.md`). Scope: `packages/api/typescript/src` AND the
 * nested `core/src` sub-package. `core/` used to be excluded as "a separate workspace, out of scope
 * by construction" — that stopped being defensible when `core/` became the home of the outbox
 * dispatcher, the command queue and the ingress mediator, i.e. the three hottest writers in the
 * process. Repo-wide, zero context-name coupling — a pure syntax scan.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')
const CORE_SRC = join(import.meta.dir, '..', '..', 'core', 'src')
const SCAN_ROOTS = [API_SRC, CORE_SRC]

/** Legit awaited calls inside a tx span that genuinely must not (or cannot) take the tx. */
const EXEMPTIONS: { file: string; call: RegExp; why: string }[] = [
	// (empty — the tree is clean today: every awaited `this.*` call inside a withTransaction
	// callback threads the tx, and every read that legitimately runs outside the tx is placed
	// BEFORE the `this.withTransaction(` call, not inside its span. Add entries here WITH a `why`
	// and a `// TODO` for any future legitimate-but-flagged occurrence — never weaken the scanner.)
]

interface Violation {
	file: string
	line: number
	call: string
}

function listSourceFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules') continue
			out.push(...listSourceFiles(full))
		} else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
			out.push(full)
		}
	}
	return out
}

/** Index just past the balanced closing paren matching the `(` at `openIndex`. */
function balancedEnd(content: string, openIndex: number): number {
	let depth = 0
	for (let i = openIndex; i < content.length; i++) {
		const ch = content[i]
		if (ch === '(') depth++
		else if (ch === ')') {
			depth--
			if (depth === 0) return i + 1
		}
	}
	return content.length
}

function lineOf(content: string, index: number): number {
	return content.slice(0, index).split('\n').length
}

/** Every `await this....(...)` expression (full balanced text) inside [start, end). */
function awaitedThisCalls(content: string, start: number, end: number): { text: string; index: number }[] {
	const calls: { text: string; index: number }[] = []
	const re = /await\s+this\.[\w.]+/g
	re.lastIndex = start
	let match = re.exec(content)
	while (match && match.index < end) {
		const open = content.indexOf('(', match.index)
		if (open !== -1 && open < end) {
			// Extend across a chained call (`this.a.for(x).b(y)`): keep consuming `.member(` links.
			let callEnd = balancedEnd(content, open)
			let chain = /^\s*\.\w+\s*\(/.exec(content.slice(callEnd))
			while (chain) {
				callEnd = balancedEnd(content, callEnd + chain[0].length - 1)
				chain = /^\s*\.\w+\s*\(/.exec(content.slice(callEnd))
			}
			calls.push({ text: content.slice(match.index, callEnd), index: match.index })
		}
		match = re.exec(content)
	}
	return calls
}

/** Every transaction-callback span in `content`: `withTransaction(` and `.transaction(`. */
function transactionSpans(content: string): { start: number; end: number }[] {
	const spans: { start: number; end: number }[] = []
	// `.withTransaction(` — the UoW helper. `.transaction(` — the bare UoW/driver seam, which is what
	// `uow.transaction(...)` and `driver.transaction(...)` are. Both take the callback as the arg.
	const re = /\.(withTransaction|transaction)\s*\(/g
	let match = re.exec(content)
	while (match) {
		const start = match.index + match[0].length - 1 // at the '('
		spans.push({ start, end: balancedEnd(content, start) })
		re.lastIndex = start + 1 // also catch a nested transaction inside this span
		match = re.exec(content)
	}
	return spans
}

describe('tx-discipline (cc-bp-24)', () => {
	test('every awaited this.* call inside a transaction callback threads the tx param', () => {
		const violations: Violation[] = []

		for (const root of SCAN_ROOTS) {
			for (const file of listSourceFiles(root)) {
				const content = readFileSync(file, 'utf8')
				const rel = relative(join(root, '..'), file)

				for (const span of transactionSpans(content)) {
					// The callback's transaction parameter: `async (t: Transaction) =>` / `async tx =>`.
					const paramMatch = /async\s*\(?\s*(\w+)/.exec(content.slice(span.start, span.end))
					if (!paramMatch) continue
					const param = paramMatch[1] as string
					const paramToken = new RegExp(`\\b${param}\\b`)

					for (const call of awaitedThisCalls(content, span.start, span.end)) {
						if (call.text.includes('this.withTransaction')) continue // the nested unit re-threads itself
						if (call.text.includes('this.transaction')) continue // ditto for the bare seam
						if (paramToken.test(call.text)) continue // tx threaded somewhere in the expression
						const exempt = EXEMPTIONS.some(e => rel.includes(e.file) && e.call.test(call.text))
						if (exempt) continue
						violations.push({ file: rel, line: lineOf(content, call.index), call: call.text.split('\n')[0] as string })
					}
				}
			}
		}

		const report = violations.map(v => `  ${v.file}:${v.line}  →  ${v.call}`).join('\n')
		expect(
			violations.length,
			`Awaited call(s) inside a transaction callback without the tx param — the write runs on its ` +
				`own connection and commits even if the unit rolls back (cc-bp-24). Thread the callback's tx, ` +
				`move external I/O out of the tx, or add a justified EXEMPTIONS entry:\n${report}`,
		).toBe(0)
	})

	test('nothing touches `this.db` inside a transaction callback — only the tx param is a legal handle', () => {
		// Class 3B. The `tx`-threading test above cannot see this: `await this.db.select(...)` mentions
		// no tx param but is also not a repository call, and a plain (non-awaited) `this.db.` usage is
		// invisible to it entirely. Reading through `this.db` inside an open transaction returns
		// PRE-transaction state, silently — which is exactly how a lease-based claim hands one row to
		// two cycles.
		const violations: Violation[] = []
		const readHandle = /this\.db\.\w+/g

		for (const root of SCAN_ROOTS) {
			for (const file of listSourceFiles(root)) {
				const content = readFileSync(file, 'utf8')
				const rel = relative(join(root, '..'), file)

				for (const span of transactionSpans(content)) {
					readHandle.lastIndex = span.start
					let hit = readHandle.exec(content)
					while (hit && hit.index < span.end) {
						violations.push({ file: rel, line: lineOf(content, hit.index), call: hit[0] })
						hit = readHandle.exec(content)
					}
				}
			}
		}

		const report = violations.map(v => `  ${v.file}:${v.line}  →  ${v.call}`).join('\n')
		expect(
			violations.length,
			`\`this.db.*\` used inside a transaction callback. \`this.db\` is the READ connection: a write ` +
				`through it opens an implicit transaction outside the serializing gate, and a READ through it ` +
				`observes pre-transaction state with no error at all. Use the callback's tx parameter:\n${report}`,
		).toBe(0)
	})
})
