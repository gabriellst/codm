import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * STUB-01/02 — every importer of the faker seam is a DECLARED stub, and the list of them only shrinks.
 *
 * ── WHY THIS RAIL EXISTS ────────────────────────────────────────────────────────────────────────
 *
 * `shared/testing/mock.ts` is deterministic faker helpers, and its own docblock states the intent
 * honestly: *"Swap a usecase's body for a real query and delete the faker calls."* So **importing it
 * is the structural signature of an unimplemented use case** — the same kind of marker as
 * `static readonly repeat` for a job, and for the same reason: it is what the code actually does,
 * not what a filename or a comment claims.
 *
 * Measured 2026-08-18, its importers ship FAKE DATA TO PRODUCTION with a 200:
 *
 *   ui/usecases/GetMyAccount    a fully faked account — person.fullName, internet.email,
 *                               company.name, image.avatar, seeded by userId
 *   auth/usecases/UploadAvatar  uploads nothing; returns image.avatar()
 *
 * Both were honestly documented, and that was the problem: in TWO DIFFERENT SPELLINGS — `MOCK.` and
 * `FAKER body, REAL contract.`. Grepping one finds the first and misses the second, so the stub
 * inventory could not be enumerated, counted, or prevented from growing. Invisible scaffolding is
 * worse than acknowledged debt, because nobody can decide about what they cannot list.
 *
 * ── WHY THE LIST IS HARD-CODED, WHEN THIS FRONT SPENT ITS TIME DELETING HARD-CODED LISTS ────────
 *
 * Because here the list IS the artefact. STUB-01 derives the universe (whoever imports the seam) and
 * needs no list. STUB-02 pins the KNOWN set so that adding a stub is a deliberate act that shows up
 * in a diff and gets argued about, rather than a quiet import. The rule for this list is one-way:
 * **it may shrink, never grow.** A PR that removes an entry is a use case getting implemented; a PR
 * that adds one is a decision to ship fake data, and it should read like one.
 *
 * The end state is this file and `shared/testing/` both being deleted, at which point STUB-01's
 * non-vacuity assertion is what tells you it happened.
 */

const SRC = join(import.meta.dir, '..', '..')
const SEAM = 'testing/mock'

/** The canonical marker. One spelling, chosen so a grep for it IS the inventory. */
const MARKER = 'STUB:'

/**
 * The stubs that exist today. MAY SHRINK, NEVER GROW — see the docblock. Paths are relative to
 * `src/`, and each one is a use case that answers a real endpoint with invented data.
 */
const KNOWN_STUBS = ['ui/usecases/GetMyAccount.ts', 'auth/usecases/UploadAvatar.ts'] as const

function tsFilesDeep(dir: string, prefix = ''): string[] {
	if (!existsSync(dir)) return []
	const out: string[] = []
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const rel = prefix ? `${prefix}/${e.name}` : e.name
		if (e.isDirectory()) out.push(...tsFilesDeep(join(dir, e.name), rel))
		else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(rel)
	}
	return out
}

/** Whoever imports the faker seam — the universe, derived, never listed. */
function seamImporters(): string[] {
	return tsFilesDeep(SRC)
		.filter(rel => !rel.startsWith('shared/testing/'))
		.filter(rel => readFileSync(join(SRC, rel), 'utf8').includes(SEAM))
}

describe('the faker seam is a declared stub inventory, not invisible scaffolding', () => {
	it('STUB-01: every importer of the faker seam declares itself with the ONE marker', () => {
		const importers = seamImporters()

		// Non-vacuity, and here it doubles as the end-state signal: zero importers means the seam is
		// unused and `shared/testing/` can be deleted along with this rail.
		expect(importers.length, 'no file imports the faker seam any more — delete src/shared/testing/ and this rail with it').toBeGreaterThan(
			0,
		)

		const undeclared = importers.filter(rel => !readFileSync(join(SRC, rel), 'utf8').includes(MARKER))
		expect(
			undeclared,
			`These import the faker seam but do not carry the "${MARKER}" marker, so they cannot be found by ` +
				`anyone auditing what is unimplemented. Add it to the class docblock — one spelling, so a grep ` +
				`for it is the whole inventory:\n${undeclared.map(f => `  ${f}`).join('\n')}`,
		).toEqual([])
	})

	it('STUB-02: the stub inventory has not grown', () => {
		const importers = seamImporters().sort()
		const added = importers.filter(rel => !KNOWN_STUBS.includes(rel as (typeof KNOWN_STUBS)[number]))

		expect(
			added,
			`NEW STUB(S). Importing the faker seam means this endpoint answers with invented data in ` +
				`production, and the list in this rail may shrink but never grow. If that is genuinely what ` +
				`you intend, add the path to KNOWN_STUBS in the same commit so the decision is reviewable:\n` +
				added.map(f => `  ${f}`).join('\n'),
		).toEqual([])
	})
})
