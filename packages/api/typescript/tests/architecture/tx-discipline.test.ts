import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Tx-discipline guard (cc-bp-24 in .claude/registry.yaml) — the mechanical half of the invariant
 * that holds the event-driven architecture together:
 *
 *   INSIDE a `withTransaction(tx, async (t) => { ... })` callback, every awaited `this.*` call
 *   must reference the callback's transaction parameter.
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
 * Lives in `tests/architecture/` — the shared home for all repo-wide/context-wide mechanical
 * detectors (see `tests/architecture/README.md`). Scope: `packages/api/typescript/src` (the nested
 * `core/` sub-package is a separate workspace and out of scope by construction). Repo-wide, zero
 * context-name coupling — a pure syntax scan.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')

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

describe('tx-discipline (cc-bp-24)', () => {
	test('every awaited this.* call inside a withTransaction callback threads the tx param', () => {
		const violations: Violation[] = []

		for (const file of listSourceFiles(API_SRC)) {
			const content = readFileSync(file, 'utf8')
			const rel = relative(API_SRC, file)

			const txRe = /\.withTransaction\s*\(/g
			let txMatch = txRe.exec(content)
			while (txMatch) {
				const spanStart = txMatch.index + txMatch[0].length - 1 // at the '('
				const spanEnd = balancedEnd(content, spanStart)

				// The callback's transaction parameter: `async (t: Transaction) =>` / `async tx =>`.
				const paramMatch = /async\s*\(?\s*(\w+)/.exec(content.slice(spanStart, spanEnd))
				if (paramMatch) {
					const param = paramMatch[1] as string
					const paramToken = new RegExp(`\\b${param}\\b`)

					for (const call of awaitedThisCalls(content, spanStart, spanEnd)) {
						if (call.text.includes('this.withTransaction')) continue // the nested unit re-threads itself
						if (paramToken.test(call.text)) continue // tx threaded somewhere in the expression
						const exempt = EXEMPTIONS.some(e => rel.includes(e.file) && e.call.test(call.text))
						if (exempt) continue
						violations.push({ file: rel, line: lineOf(content, call.index), call: call.text.split('\n')[0] as string })
					}
				}

				txRe.lastIndex = spanStart + 1 // also catch a nested withTransaction inside this span
				txMatch = txRe.exec(content)
			}
		}

		const report = violations.map(v => `  ${v.file}:${v.line}  →  ${v.call}`).join('\n')
		expect(
			violations.length,
			`Awaited call(s) inside a withTransaction callback without the tx param — the write runs on its ` +
				`own connection and commits even if the unit rolls back (cc-bp-24). Thread the callback's tx, ` +
				`move external I/O out of the tx, or add a justified EXEMPTIONS entry:\n${report}`,
		).toBe(0)
	})
})
