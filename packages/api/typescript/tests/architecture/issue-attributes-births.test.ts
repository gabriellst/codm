import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Issue-births guard (fase 4, S0c — revisão 2) — every place an issue is BORN records its attributes.
 *
 * An issue is born where its id is minted (`issueId = uuidv7()`) or where the fork fact is raised
 * (`new IssueForkedEvent(`). Each such file must write `agent_issue_attributes` through the repository
 * (`attributes.insertIfNew(`) — a birth that skipped it would leave a task the queue (S4), the batch receipt and the
 * worktree janitor (S3) treat as "older than fase 4" forever. Today: `ForkIssue` and `DeclareIssueOpen` (which the
 * console's `CreateIssueController` goes through).
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')
const BIRTH = /\bissueId\s*=\s*uuidv7\(\)|\bissueId:\s*uuidv7\(\)|new IssueForkedEvent\(/
const RECORDS_ATTRIBUTES = /\battributes\.insertIfNew\(/

function listSourceFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) out.push(...listSourceFiles(full))
		else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full)
	}
	return out
}

/** Whether a source text births an issue without recording its attributes. */
function birthWithoutAttributes(source: string): boolean {
	return BIRTH.test(source) && !RECORDS_ATTRIBUTES.test(source)
}

describe('issue births — every new issue records its attributes', () => {
	const births = listSourceFiles(API_SRC)
		.map(file => ({ file: relative(API_SRC, file), source: readFileSync(file, 'utf8') }))
		.filter(({ source }) => BIRTH.test(source))

	test('the scan sees the births at all (a vacuous scan is a broken gate)', () => {
		expect(births.map(birth => birth.file).sort()).toEqual(['agent/usecases/DeclareIssueOpen.ts', 'agent/usecases/ForkIssue.ts'])
	})

	test('every birth writes agent_issue_attributes through the repository', () => {
		expect(births.filter(({ source }) => birthWithoutAttributes(source)).map(birth => birth.file)).toEqual([])
	})

	test('NEGATIVE FIXTURE — a new birth that skips the attributes is caught', () => {
		expect(
			birthWithoutAttributes('const issueId = uuidv7()\nawait this.domainEventRepository.save(new AgentRunStartedEvent({}), tx)'),
		).toBe(true)
		expect(birthWithoutAttributes('await this.domainEventRepository.save(new IssueForkedEvent({ payload }), tx)')).toBe(true)
		expect(
			birthWithoutAttributes('const issueId = uuidv7()\nawait this.attributes.insertIfNew(IssueAttributes.born({ issueId }), tx)'),
		).toBe(false)
	})
})
