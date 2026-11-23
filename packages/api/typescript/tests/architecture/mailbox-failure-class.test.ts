import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Mailbox failure-class guard (fase 5, S2) — every recorded failure DECLARES its class.
 *
 * The retry calendar (`RETRY_SCHEDULE`, by lane and class) and the stop that asks someone once it is spent
 * (`STOP_OF_FAILURE`: a login problem says login) are both read off the failure's class. A class read off the error's
 * TEXT is the convention this replaced (Non-Negotiable 5): the provider's wording changes, and a login failure reached
 * the group as "erro do provedor". The compiler already requires a `MailboxFailure`; this rail covers what it cannot
 * see — a class computed from the detail through a loosely typed helper.
 *
 * How it checks: every `recordFailure(` CALL in production code (`src/`, tests excluded; the method's own declaration
 * excluded) has its balanced call span extracted, and the span must name its class as a `MailboxFailureClass.` member
 * or through the declared table `FAILURE_CLASS_OF_TRANSPORT_STOP[`. Derived from the code; the call count is reported
 * so a vacuous scan fails.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')
const CALL = /\bthis\.recordFailure\(/g

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

/** The code of a source text without its comments — a docblock that QUOTES a call is not a recorder. */
const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every `this.recordFailure(...)` call of a source text, and whether its class is declared. */
function failureCalls(text: string): { span: string; declaresClass: boolean }[] {
	const source = withoutComments(text)
	return [...source.matchAll(CALL)].map(match => {
		const span = callSpan(source, (match.index ?? 0) + match[0].length - 1)
		return { span, declaresClass: /\bclass:\s*(MailboxFailureClass\.[A-Z_]+\b|FAILURE_CLASS_OF_TRANSPORT_STOP\[)/.test(span) }
	})
}

describe('mailbox failure class — every recorded failure declares its class', () => {
	const recorders = listSourceFiles(API_SRC).flatMap(file =>
		failureCalls(readFileSync(file, 'utf8')).map(call => ({ file: relative(API_SRC, file), ...call })),
	)

	test('the scan sees the recorders at all (a vacuous scan is a broken gate)', () => {
		// agent: the dispatcher's three ways a turn ends badly — abandoned at the ceiling, a retried transport stop, a throw.
		expect(recorders.length).toBeGreaterThanOrEqual(3)
	})

	test('every recorder names its class', () => {
		expect(recorders.filter(call => !call.declaresClass).map(call => call.file)).toEqual([])
	})

	test('NEGATIVE FIXTURE — a class read off the text is caught', () => {
		const leak = `await this.recordFailure(bundle, { class: classOf(report.transportStop.detail), detail: report.transportStop.detail })`
		expect(failureCalls(leak)).toEqual([expect.objectContaining({ declaresClass: false })])
		const declared = `await this.recordFailure(bundle, { class: FAILURE_CLASS_OF_TRANSPORT_STOP[report.transportStop.kind], detail })`
		expect(failureCalls(declared)).toEqual([expect.objectContaining({ declaresClass: true })])
		const literal = `await this.recordFailure(bundle, { class: MailboxFailureClass.CRASH, detail: message })`
		expect(failureCalls(literal)).toEqual([expect.objectContaining({ declaresClass: true })])
	})
})
