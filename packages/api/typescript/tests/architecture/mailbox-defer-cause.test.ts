import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Mailbox defer-cause guard (fase 5, S1) — every deferral DECLARES why the item waits.
 *
 * `MailboxRepository.defer` takes a required `cause`, so the compiler refuses a typed call without one. This rail covers
 * what the compiler cannot see: a cause computed elsewhere and passed through a variable typed loosely, or a writer that
 * reaches the queue another way. The releasers (`creditAcceptedTurn`, `ReleaseIssueWorkOnResume`, the new-item release)
 * and the readers ("esperando cota", the life state) decide by `defer_cause`; a deferral that did not name its cause
 * literally would be read as whatever the variable happened to hold — the shape-inference this column replaced.
 *
 * How it checks: every `mailbox.defer(` call in production code (`src/`, tests excluded) has its balanced call span
 * extracted, and the span must name a `MailboxDeferCause.` member. Derived from the code; the writer count is reported
 * so a vacuous scan fails.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')
const DEFER = /\bmailbox\.defer\(/g

function listSourceFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) out.push(...listSourceFiles(full))
		else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full)
	}
	return out
}

/** The text of the call opened at `start` (index of its `(`), up to the matching `)`. */
function callSpan(source: string, start: number): string {
	let depth = 0
	for (let index = start; index < source.length; index++) {
		const char = source[index]
		if (char === '(') depth++
		else if (char === ')') {
			depth--
			if (depth === 0) return source.slice(start, index + 1)
		}
	}
	return source.slice(start)
}

/** The code of a source text without its comments — a docblock that QUOTES a call is not a writer. */
const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every `mailbox.defer(...)` call of a source text, and whether it names its cause. */
function deferCalls(text: string): { span: string; declaresCause: boolean }[] {
	const source = withoutComments(text)
	return [...source.matchAll(DEFER)].map(match => {
		const span = callSpan(source, (match.index ?? 0) + match[0].length - 1)
		return { span, declaresCause: /\bMailboxDeferCause\.[A-Z_]+\b/.test(span) }
	})
}

describe('mailbox defer cause — every deferral declares why the item waits', () => {
	const writers = listSourceFiles(API_SRC).flatMap(file =>
		deferCalls(readFileSync(file, 'utf8')).map(call => ({ file: relative(API_SRC, file), ...call })),
	)

	test('the scan sees the writers at all (a vacuous scan is a broken gate)', () => {
		// agent: the dispatcher's provider wait and its hold.
		expect(writers.length).toBeGreaterThanOrEqual(2)
	})

	test('every writer names a MailboxDeferCause member', () => {
		expect(writers.filter(call => !call.declaresCause).map(call => call.file)).toEqual([])
	})

	test('NEGATIVE FIXTURE — a deferral whose cause is not named is caught', () => {
		const leak = `await this.mailbox.defer(idsOf(bundle), new Date(until), causeOf(report))`
		expect(deferCalls(leak)).toEqual([expect.objectContaining({ declaresCause: false })])
		const declared = `await this.mailbox.defer(idsOf(bundle), new Date(until), MailboxDeferCause.HOLD)`
		expect(deferCalls(declared)).toEqual([expect.objectContaining({ declaresCause: true })])
	})
})
