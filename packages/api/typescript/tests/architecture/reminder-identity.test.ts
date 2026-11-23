import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Reminder-identity guard (fase 5, S3) — "this item is an automatic nudge" is the COLUMN, everywhere.
 *
 * Until fase 5 six readers asked a payload flag (`declarationReminder: true`) whether an item was the reconciler's
 * reminder — the stalled reader, the regret window's unread-steer check, the life state, the timeline, the dispatcher
 * and the issue turn. Migration 0037 classified those old rows as `STEER`, so the column and the flag could disagree,
 * and a payload key no producer is forced to write is convention, not contract (Non-Negotiable 5). Migration 0038
 * converted the old rows to `claim_class = 'REMINDER'` with a declared `nudge` payload; every reader now asks the
 * column, and which nudge it is rides `NudgePayloadSchema`.
 *
 * How it checks: no production file under `src/` (tests excluded) mentions the flag — a reader would need its name to
 * read it, a producer to write it. Migrations live outside `src/` and keep the name, which they convert.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')
const FLAG = 'declarationReminder'

function listSourceFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) out.push(...listSourceFiles(full))
		else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full)
	}
	return out
}

/** Whether a source text names the payload flag at all. */
const namesTheFlag = (source: string): boolean => new RegExp(`\\b${FLAG}\\b`).test(source)

describe('reminder identity — the claim class, never a payload flag', () => {
	const files = listSourceFiles(API_SRC)

	test('the scan sees the source tree (a vacuous scan is a broken gate)', () => {
		expect(files.length).toBeGreaterThan(100)
	})

	test('no production file names the old payload flag', () => {
		expect(files.filter(file => namesTheFlag(readFileSync(file, 'utf8'))).map(file => relative(API_SRC, file))).toEqual([])
	})

	test('NEGATIVE FIXTURE — a reader of the flag is caught; the column is not', () => {
		expect(namesTheFlag('const ReminderPayloadSchema = z.object({ declarationReminder: z.literal(true) })')).toBe(true)
		expect(namesTheFlag("sql`json_extract(${agentMailbox.payload}, '$.declarationReminder') IS NULL`")).toBe(true)
		expect(namesTheFlag('ne(agentMailbox.claimClass, MailboxClaimClass.REMINDER)')).toBe(false)
	})
})
