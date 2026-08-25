import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { isBarrel } from './lib/barrels'
import { CONTEXT_LAYERS } from './lib/context-layers'

/**
 * context-barrels — a layer of a bounded context has a barrel because the table says so, never
 * because somebody scaffolded one.
 *
 * SIBLING OF `barrel-liveness`, DIFFERENT QUESTION. That rail asks "can anything REACH this
 * barrel?" and is satisfied by one importer. This one asks "should this door EXIST AT ALL?" and is
 * satisfied only by the declaration in `scripts/lib/context-layers.ts`. The distinction is what the
 * first run of `barrel-liveness` in this repo exposed: 16 barrels nobody could reach, which looked
 * like 16 defects and were actually one — no rule about which layers have a door. Reachability
 * cannot see that, because a barrel with exactly one importer is reachable and still arbitrary.
 *
 * WHY A TABLE AND NOT A HEURISTIC. "A barrel needs an importer" is the tempting structural version
 * and it is the one that produced the mess: it makes the answer depend on whoever wrote the last
 * import. The measurement behind the table is in its docblock; the short version is that three of
 * the five `required` layers are consumed as OBJECTS by registrars (`import * as controllers` →
 * `BoundedContext.create`, enums → `registerEnums`, objects → `registerSchemas`), so their barrel
 * is the only possible door — and the other layers had already voted with 1319 direct imports
 * against 648 through a barrel.
 *
 * CHECK 1 — every layer folder on disk is DECLARED. A new layer is a decision; the gate refuses to
 * let one arrive with an implied policy.
 * CHECK 2 — no `forbidden` layer holds a pure re-export `index.ts`. A content module named
 * `index.ts` is not a barrel and is none of this rail's business (that is the `errors` case).
 * CHECK 3 — machinery floor on a synthetic tree, exercising both verdicts, so the rail cannot pass
 * merely because this repo happens to be tidy.
 *
 * WHAT THIS RAIL DELIBERATELY DOES NOT CHECK: that an `allowed` layer HAS its barrel. Being
 * structural is a property of a FOLDER, not of a layer — `controllers` is namespace-imported in all
 * 10 contexts, `objects` only in `shared` — so "required" would have forced a door into
 * `auth/objects`, which no registrar reads. The folders that genuinely need one are enforced by
 * `tsc`: a namespace import stops resolving the moment the index is gone, and that error names the
 * exact import. The ones nobody reaches are `barrel-liveness`'s question.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'packages/api/typescript/src')

interface LayerOnDisk {
	context: string
	layer: string
	dir: string
	indexPath: string | null
	isPureBarrel: boolean
}

/** Every `<ctx>/<layer>/` under a src root, with what its `index.ts` (if any) actually is. */
export function layersOnDisk(src: string): LayerOnDisk[] {
	if (!existsSync(src)) return []
	const out: LayerOnDisk[] = []
	for (const context of readdirSync(src).sort()) {
		const contextDir = join(src, context)
		if (!statSync(contextDir).isDirectory()) continue
		for (const layer of readdirSync(contextDir).sort()) {
			const dir = join(contextDir, layer)
			if (!statSync(dir).isDirectory()) continue
			const indexPath = join(dir, 'index.ts')
			const has = existsSync(indexPath)
			out.push({
				context,
				layer,
				dir,
				indexPath: has ? indexPath : null,
				isPureBarrel: has ? isBarrel(readFileSync(indexPath, 'utf-8')) : false,
			})
		}
	}
	return out
}

const LAYERS = layersOnDisk(SRC)

describe('context-barrels (a layer has a barrel because the table says so)', () => {
	test('every layer folder on disk is declared in CONTEXT_LAYERS', () => {
		// Floor: an empty walk would make every other check true for the wrong reason.
		expect(LAYERS.length, 'walked zero layer folders — the walk is broken, not the repo').toBeGreaterThan(50)

		const undeclared = [...new Set(LAYERS.filter(entry => !CONTEXT_LAYERS[entry.layer]).map(entry => entry.layer))].sort()
		expect(
			undeclared,
			'Layer folder(s) with no entry in scripts/lib/context-layers.ts. A new layer of a bounded context is a ' +
				'DECISION — does it get a barrel, and why — not something that inherits a default. Add it to ' +
				'CONTEXT_LAYERS with a `why` in the same change that creates it.',
		).toEqual([])
	})

	test('no `forbidden` layer holds a pure re-export index.ts', () => {
		const offenders = LAYERS.filter(entry => CONTEXT_LAYERS[entry.layer]?.barrel === 'forbidden' && entry.isPureBarrel)
			.map(entry => `${entry.context}/${entry.layer}/index.ts  (${CONTEXT_LAYERS[entry.layer]?.why})`)
			.sort()

		expect(
			offenders,
			'Barrel(s) in a layer the table forbids. This layer is a CATALOGUE — its modules are cited one at a ' +
				'time — so the barrel is a second door that only makes it ambiguous which one to use, and the ' +
				'ambiguity is what left 16 of them dead. Import the module directly and delete the index, or change ' +
				'the policy in scripts/lib/context-layers.ts with the measurement that justifies it. (An index.ts ' +
				'that declares something of its own is NOT a barrel and never trips this check.)',
		).toEqual([])
	})

	// Negative fixture — proves each verdict against a REAL temp tree, so the rail cannot pass
	// merely because this repo is currently in order (molde: barrel-liveness / registry-pointers).
	test('fixture: an undeclared layer and a forbidden barrel are each caught', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'context-barrels-fixture-'))
		try {
			const write = (rel: string, body: string) => {
				const full = join(tmpRoot, rel)
				mkdirSync(join(full, '..'), { recursive: true })
				writeFileSync(full, body)
			}
			// A clean context: required layer has its index, forbidden layer has none.
			write('billing/controllers/index.ts', "export * from './Charge'\n")
			write('billing/controllers/Charge.ts', 'export const Charge = 1\n')
			write('billing/usecases/Charge.ts', 'export const Charge = 1\n')
			// An offender per verdict.
			write('billing/usecases/index.ts', "export * from './Charge'\n") // forbidden layer WITH a barrel
			write('billing/quokkas/thing.ts', 'export const thing = 1\n') // layer nobody declared
			write('shipping/controllers/Ship.ts', 'export const Ship = 1\n') // required layer WITHOUT its index

			const found = layersOnDisk(tmpRoot)
			const at = (ctx: string, layer: string) => found.find(entry => entry.context === ctx && entry.layer === layer)

			expect(found.map(entry => `${entry.context}/${entry.layer}`).sort()).toEqual([
				'billing/controllers',
				'billing/quokkas',
				'billing/usecases',
				'shipping/controllers',
			])
			expect(at('billing', 'usecases')?.isPureBarrel, 'a forbidden layer carrying a barrel must be seen as one').toBe(true)
			expect(
				at('billing', 'quokkas') && CONTEXT_LAYERS[at('billing', 'quokkas')!.layer],
				'an undeclared layer must have no entry',
			).toBeUndefined()
			expect(at('shipping', 'controllers')?.indexPath, 'a layer with no index must report none').toBeNull()

			// And the thing that must NOT trip: an index.ts with content of its own is a module.
			write('billing/errors/index.ts', "import { registerErrorCodes } from './x'\nexport type Errors = 'A'\nregisterErrorCodes({})\n")
			expect(layersOnDisk(tmpRoot).find(entry => entry.layer === 'errors')?.isPureBarrel).toBe(false)
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
