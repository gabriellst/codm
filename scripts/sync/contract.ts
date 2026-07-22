/**
 * contract.ts — the typed sync.yaml contract (pull-based sync, the git fork model).
 *
 * USER DECISION (2026-07-21): "o template não sabe dos filhos; os filhos declaram o pai."
 * The template (a ROOT repo) carries NO sync.yaml and ships this tool generically; a fork
 * (child) inherits the tool and adds only its own sync.yaml declaring the parent. Reverse
 * flow (child → parent) is always an explicit PR, never automation.
 *
 * Ownership algebra over declared paths (no edge-case ifs on path formats):
 *   inherited  — path globs that MUST byte-match the parent at the pinned ref
 *   adapted    — exact files that came from the parent and DELIBERATELY diverged (each
 *                carries a `why`); subtracted from the inherited surface, liveness-gated
 *                by `sync:check` (must exist in the child AND differ from the parent)
 *   owned      — everything else. The tool never touches it. Absence IS the declaration.
 *
 * Validation is manual (zod-or-manual → manual): the teaching errors ARE the point — each
 * one names the field, what was found, what the contract wants, and how to fix it.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'

export const SYNC_MANIFEST_FILE = 'sync.yaml'

// ─── Contract ───────────────────────────────────────────────────────

export interface SyncParent {
	/** Git URL (or local path) of the parent repo — what the child pulls from. */
	repo: string
	/** PINNED full 40-char commit sha in the parent. Never a branch name: pins are immutable. */
	ref: string
}

export interface AdaptedEntry {
	/** Exact repo-relative file path (not a glob — liveness is checked per file). */
	path: string
	/** The reason this file deliberately diverged from the parent. Mandatory. */
	why: string
}

export interface SyncManifest {
	parent: SyncParent
	inherited: string[]
	adapted: AdaptedEntry[]
}

export class SyncContractError extends Error {
	override name = 'SyncContractError'
}

// ─── Teaching validation ────────────────────────────────────────────

const EXAMPLE = `parent:
  repo: git@github.com:acme/template-fullstack.git
  ref: 4f1c9b2e7d3a5c8f0b6e1d4a9c2f7b3e8d5a0c1e   # full commit sha — a pin, not a branch
inherited:
  - scripts/**
  - packages/api/typescript/core/**
adapted:
  - path: docs/BACKEND.md
    why: rewritten for this product's bounded contexts`

function fail(source: string, message: string): never {
	throw new SyncContractError(`${source}: ${message}\n\nExpected shape:\n${EXAMPLE}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const FULL_SHA = /^[0-9a-f]{40}$/i
const GLOB_CHARS = /[*?[\]{}]/

function assertRepoRelative(source: string, field: string, path: string): void {
	if (path.startsWith('/')) fail(source, `${field} must be repo-relative (got absolute path '${path}')`)
	if (path.split('/').includes('..')) fail(source, `${field} must stay inside the repo (got '${path}' with a '..' segment)`)
}

/** Parse + validate sync.yaml text. Throws SyncContractError with a teaching message. */
export function parseManifest(text: string, source = SYNC_MANIFEST_FILE): SyncManifest {
	let raw: unknown
	try {
		raw = parse(text)
	} catch (err) {
		fail(source, `not valid YAML — ${err instanceof Error ? err.message : String(err)}`)
	}
	if (!isRecord(raw))
		fail(source, `top level must be a mapping with keys parent/inherited/adapted (got ${raw === null ? 'an empty file' : typeof raw})`)

	for (const key of Object.keys(raw)) {
		if (key !== 'parent' && key !== 'inherited' && key !== 'adapted') {
			fail(
				source,
				`unknown top-level key '${key}' — the contract has exactly three keys: parent, inherited, adapted. Everything not declared is owned by the child; there is no key for that (absence IS the declaration)`,
			)
		}
	}

	const parent = raw.parent
	if (!isRecord(parent))
		fail(source, `'parent' must be a mapping { repo, ref } declaring which repo this one forked from (got ${typeof parent})`)
	const { repo, ref } = parent
	if (typeof repo !== 'string' || repo.trim() === '')
		fail(source, `parent.repo must be a non-empty git URL or local path (got ${JSON.stringify(repo)})`)
	if (typeof ref !== 'string' || !FULL_SHA.test(ref)) {
		fail(
			source,
			`parent.ref must be a full 40-char commit sha (got ${JSON.stringify(ref)}) — a branch name is a moving target, not a pin. Resolve one with: git -C <parent> rev-parse <branch>, or advance the pin with: bun sync:pull --to <ref>`,
		)
	}

	const inherited = raw.inherited ?? []
	if (!Array.isArray(inherited))
		fail(source, `'inherited' must be a list of path globs that must match the parent at the pinned ref (got ${typeof raw.inherited})`)
	for (const [i, glob] of inherited.entries()) {
		if (typeof glob !== 'string' || glob.trim() === '')
			fail(source, `inherited[${i}] must be a non-empty path glob (got ${JSON.stringify(glob)})`)
		assertRepoRelative(source, `inherited[${i}]`, glob)
	}

	const adapted = raw.adapted ?? []
	if (!Array.isArray(adapted)) fail(source, `'adapted' must be a list of { path, why } entries (got ${typeof raw.adapted})`)
	const entries: AdaptedEntry[] = []
	for (const [i, entry] of adapted.entries()) {
		if (!isRecord(entry)) fail(source, `adapted[${i}] must be a mapping { path, why } (got ${typeof entry})`)
		const { path, why } = entry
		if (typeof path !== 'string' || path.trim() === '')
			fail(source, `adapted[${i}].path must be a non-empty file path (got ${JSON.stringify(path)})`)
		if (GLOB_CHARS.test(path)) {
			fail(
				source,
				`adapted[${i}].path must name an exact file, not a glob (got '${path}') — liveness (exists AND differs from the parent) is checked per file. To adapt a whole area, list each file with its own why`,
			)
		}
		assertRepoRelative(source, `adapted[${i}].path`, path)
		if (typeof why !== 'string' || why.trim() === '') {
			fail(
				source,
				`adapted[${i}].why is mandatory (got ${JSON.stringify(why)}) — an adapted entry without a reason is indistinguishable from drift. Say WHY '${path}' deliberately diverged`,
			)
		}
		entries.push({ path, why })
	}

	return { parent: { repo, ref }, inherited: inherited as string[], adapted: entries }
}

/**
 * Load <root>/sync.yaml. Returns null when absent — the repo is a ROOT (like the template
 * itself): it has no parent, and every sync command is a no-op on it.
 */
export function loadManifest(root: string): SyncManifest | null {
	const file = join(root, SYNC_MANIFEST_FILE)
	if (!existsSync(file)) return null
	return parseManifest(readFileSync(file, 'utf8'), file)
}

// ─── Surface algebra ────────────────────────────────────────────────

export interface Surface {
	/** path ∈ (⋃ inherited globs) \ adapted — the set that must byte-match the parent. */
	isInherited(path: string): boolean
	/** path ∈ (⋃ inherited globs) ignoring the adapted subtraction — the raw glob union. */
	matchesInheritedGlob(path: string): boolean
	adapted: ReadonlySet<string>
}

/**
 * Compile the manifest's declared paths into the ONE evaluation both check and pull use.
 * Evaluation is set algebra over these predicates — never ad-hoc string surgery on paths.
 */
export function compileSurface(manifest: SyncManifest): Surface {
	const matchers = manifest.inherited.map(glob => new Bun.Glob(glob))
	const adapted: ReadonlySet<string> = new Set(manifest.adapted.map(entry => entry.path))
	const matchesInheritedGlob = (path: string) => matchers.some(m => m.match(path))
	return {
		adapted,
		matchesInheritedGlob,
		isInherited: path => !adapted.has(path) && matchesInheritedGlob(path),
	}
}
