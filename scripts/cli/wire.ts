// Barrel auto-wiring. A scaffolded backend artifact that isn't re-exported from
// its barrel (controllers/index.ts, handlers/internal.ts, …) silently never
// mounts — BoundedContext.create only sees what the barrel exports (the SCW-03
// slice-closure class). The generators already declare `exportLine` +
// `exportTarget` on each GeneratedFile; this module inserts the line instead of
// just printing it as a hint. The slice-closure detector stays as safety net.
//
// Only real TS export statements are auto-wired. Non-export hints (registry.ts
// DI bindings, Go module.go fx wiring) remain printed hints — inserting those
// needs placement inside a structure the CLI doesn't parse.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { barrelAllowedIn } from '../lib/context-layers'
import type { GeneratedFile } from './types'

export type WireStatus = 'wired' | 'already-wired' | 'skipped' | 'no-barrel-layer'

/**
 * `<ctx>/<layer>/index.ts` under the api-typescript src root — the only shape the barrel policy
 * governs. `handlers/internal.ts` and `registry.ts` are NAMED barrels, not layer doors, and are
 * deliberately outside it.
 */
const LAYER_BARREL = /^packages\/api\/typescript\/src\/[^/]+\/([^/]+)\/index\.ts$/

/**
 * Whether the scaffolder may create/extend this barrel, per `scripts/lib/context-layers.ts`.
 *
 * WHY THE SCAFFOLDER ASKS. Before 2026-08-14 it wired every artifact into a `<layer>/index.ts`,
 * creating the file when absent — which is how 40 barrels in catalogue layers came to exist with
 * nobody importing them. Deleting them was not enough on its own: the next `bun cli` in that
 * context would write one straight back, one export long, and the gate would flag it again. A gate
 * and a generator undoing each other is worse than either, so both now read the same table.
 */
export function barrelPolicyAllows(exportTarget: string): boolean {
	const layer = LAYER_BARREL.exec(exportTarget)?.[1]
	return layer === undefined || barrelAllowedIn(layer)
}

const specifierOf = (line: string): string | undefined => line.match(/\bfrom\s+(['"])(.+?)\1/)?.[2]

/** True when the file's export hint is an actual export statement targeting a TS barrel. */
export function isWirable(file: GeneratedFile): boolean {
	return Boolean(file.exportLine?.trimStart().startsWith('export ') && file.exportTarget?.endsWith('.ts'))
}

/**
 * Insert `exportLine` into a barrel's content. Idempotent: skips when the exact
 * line — or any export from the same module specifier (hand-edited barrels) —
 * is already present. If the barrel's existing export lines are alphabetically
 * sorted, the new line is inserted in sort position; otherwise it's appended.
 */
export function insertExportLine(existing: string, exportLine: string): { content: string; changed: boolean } {
	const line = exportLine.trim()
	const specifier = specifierOf(line)
	const lines = existing === '' ? [] : existing.split('\n')

	const isExport = (l: string) => l.trimStart().startsWith('export ')
	for (const l of lines) {
		const t = l.trim()
		if (t === line) return { content: existing, changed: false }
		if (isExport(t) && specifier !== undefined && specifierOf(t) === specifier) {
			return { content: existing, changed: false }
		}
	}

	const exportPositions: { line: string; index: number }[] = []
	for (let i = 0; i < lines.length; i++) {
		const t = (lines[i] ?? '').trim()
		if (isExport(t)) exportPositions.push({ line: t, index: i })
	}

	let sorted = exportPositions.length >= 2
	for (let k = 1; k < exportPositions.length; k++) {
		const prev = exportPositions[k - 1]
		const curr = exportPositions[k]
		if (prev && curr && prev.line.localeCompare(curr.line) > 0) {
			sorted = false
			break
		}
	}

	if (sorted) {
		const next = exportPositions.find(x => x.line.localeCompare(line) > 0)
		const last = exportPositions[exportPositions.length - 1]
		const insertAt = next ? next.index : last ? last.index + 1 : lines.length
		lines.splice(insertAt, 0, line)
		const joined = lines.join('\n')
		return { content: joined.endsWith('\n') ? joined : `${joined}\n`, changed: true }
	}

	const body = existing.replace(/\s+$/, '')
	return { content: body === '' ? `${line}\n` : `${body}\n${line}\n`, changed: true }
}

/**
 * Wire one generated file into its barrel under `root`. Creates the barrel when
 * it doesn't exist yet (e.g. projections/index.ts in a context that had none).
 */
export async function wireGeneratedFile(file: GeneratedFile, root: string): Promise<WireStatus> {
	if (!isWirable(file) || !file.exportLine || !file.exportTarget) return 'skipped'
	if (!barrelPolicyAllows(file.exportTarget)) return 'no-barrel-layer'
	const barrelPath = join(root, file.exportTarget)
	let existing = ''
	try {
		existing = await readFile(barrelPath, 'utf8')
	} catch {
		// Barrel doesn't exist yet — it will be created with just this export.
	}
	const { content, changed } = insertExportLine(existing, file.exportLine)
	if (!changed) return 'already-wired'
	await mkdir(dirname(barrelPath), { recursive: true })
	await writeFile(barrelPath, content)
	return 'wired'
}
