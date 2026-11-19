import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Usage-role guard (fase 4, S1) — every `agent.turn.usage` produced says WHO spent it.
 *
 * `AgentUsageEvent.role` is optional in the schema only because rows written before fase 4 lack it, and the budget
 * (S2) sums ONLY events that carry it — never inferring the role from `entity_id`. So a producer that forgot the
 * role would silently vanish from the budget. This rail scans every `new AgentUsageEvent(` in production code and
 * requires its call span to name `role`.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')
const CONSTRUCTION = /new AgentUsageEvent\(/g

function listSourceFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) out.push(...listSourceFiles(full))
		else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full)
	}
	return out
}

/** The code of a source text without its comments — a docblock that QUOTES a construction is not a producer. */
const withoutComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

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

/** Every `new AgentUsageEvent(...)` of a source text, and whether it passes `role`. */
function constructions(text: string): { span: string; passesRole: boolean }[] {
	const source = withoutComments(text)
	return [...source.matchAll(CONSTRUCTION)].map(match => {
		const span = callSpan(source, (match.index ?? 0) + match[0].length - 1)
		return { span, passesRole: /\brole\s*:/.test(span) }
	})
}

describe('usage role — every agent.turn.usage says who spent it', () => {
	const producers = listSourceFiles(API_SRC).flatMap(file =>
		constructions(readFileSync(file, 'utf8')).map(call => ({ file: relative(API_SRC, file), ...call })),
	)

	test('the scan sees the producer at all (a vacuous scan is a broken gate)', () => {
		// One builder for the three roles: `agent/utils/usageFacts.ts` (issue turn, orchestrator turn, triage).
		expect(producers.map(producer => producer.file)).toEqual(['agent/utils/usageFacts.ts'])
	})

	test('every producer passes role', () => {
		expect(producers.filter(producer => !producer.passesRole).map(producer => producer.file)).toEqual([])
	})

	test('NEGATIVE FIXTURE — a producer that leaves the role out is caught', () => {
		expect(constructions('new AgentUsageEvent({ entityId, ownerId, payload: f(usage) })')).toEqual([
			expect.objectContaining({ passesRole: false }),
		])
		expect(constructions('new AgentUsageEvent({ payload: { ...usage, role: UsageRole.ISSUE, provider, model } })')).toEqual([
			expect.objectContaining({ passesRole: true }),
		])
	})
})
