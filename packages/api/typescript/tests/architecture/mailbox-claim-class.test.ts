import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Mailbox claim-class guard (fase 4, S0c) — every item a producer queues DECLARES what it is.
 *
 * `EnqueueMailboxItem.claimClass` is required, so the compiler already refuses a typed call without it. This rail
 * covers what the compiler cannot see: a call whose argument is built elsewhere and spread, or a producer that
 * reaches the queue through a loosely typed path. The claim order (S4) and steer coalescing (S5) read the column;
 * an item that did not declare its class would be claimed as whatever the column defaults to (`WORK`), silently.
 *
 * How it checks: every `mailbox.enqueue(` call in production code (`src/`, tests excluded) has its balanced call
 * span extracted, and the span must name `claimClass`. Derived from the code; the producer count is reported so a
 * vacuous scan fails.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')
const ENQUEUE = /\bmailbox\.enqueue\(/g

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

/** The code of a source text without its comments — a docblock that QUOTES a call is not a producer. */
const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Every `mailbox.enqueue(...)` call of a source text, and whether it declares its class. */
function enqueueCalls(text: string): { span: string; declaresClass: boolean }[] {
	const source = withoutComments(text)
	return [...source.matchAll(ENQUEUE)].map(match => {
		const span = callSpan(source, (match.index ?? 0) + match[0].length - 1)
		return { span, declaresClass: /\bclaimClass\b/.test(span) }
	})
}

describe('mailbox claim class — every queued item declares what it is', () => {
	const producers = listSourceFiles(API_SRC).flatMap(file =>
		enqueueCalls(readFileSync(file, 'utf8')).map(call => ({ file: relative(API_SRC, file), ...call })),
	)

	test('the scan sees the producers at all (a vacuous scan is a broken gate)', () => {
		// agent: ForkIssue, SteerIssueTurn, RunIssueTurn, ReconcileStalledIssues; thread: ResumeIssueOnStopResolved,
		// SteerThread (2), IngestChannelMessage, ExecutePanelAction, RoutedSteer.
		expect(producers.length).toBeGreaterThanOrEqual(10)
	})

	test('every producer declares claimClass', () => {
		expect(producers.filter(call => !call.declaresClass).map(call => call.file)).toEqual([])
	})

	test('NEGATIVE FIXTURE — a producer that leaves the class out is caught', () => {
		const leak = `await this.mailbox.enqueue({ ownerId, targetKind, targetId, kind: MailboxItemKind.STEER, posture, payload: { text: f(x) }, dedupKey }, tx)`
		expect(enqueueCalls(leak)).toEqual([expect.objectContaining({ declaresClass: false })])
		const declared = `await this.mailbox.enqueue({ kind: MailboxItemKind.STEER, claimClass: MailboxClaimClass.STEER, payload: g(y) }, tx)`
		expect(enqueueCalls(declared)).toEqual([expect.objectContaining({ declaresClass: true })])
	})
})
