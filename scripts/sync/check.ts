#!/usr/bin/env bun
/**
 * check.ts — `bun sync:check`: the DRIFT GATE a child (fork) runs in its CI.
 *
 * Pull-based (USER DECISION 2026-07-21): the child declares the parent in sync.yaml;
 * the parent knows nothing. A repo WITHOUT sync.yaml is a root — the gate no-ops green,
 * which is exactly how the template itself stays green while shipping this tool.
 *
 * Evaluation is set algebra over the declared paths (contract.ts compiles the ONE surface):
 *   P = parent@ref ∩ inherited \ except \ owned \ adapted   C = child tree ∩ the same surface
 *   P \ C   → drift-missing        (inherited file the child lost)
 *   C \ P   → drift-child-only     (child grew a file under the parent-owned surface)
 *   P ∩ C   → byte-compare         (differs → drift-modified)
 * Every drift is a NAMED failure with the fix menu:
 *   (a) re-pull the parent version · (b) reclassify to adapted WITH a why · (c) upstream a PR.
 *
 * adapted entries are LIVENESS-gated: the path must exist in the child AND differ from the
 * parent at the pin. An adapted file that matches the parent again is a FOSSIL — fail,
 * reclassify to inherited. An adapted path the parent never had at the pin documents
 * nothing — fail, the entry belongs under `owned` (or under nothing at all).
 *
 * owned entries are liveness-gated on PROVENANCE: the glob must match something in the child
 * (else it carves a hole for no file) and the parent must NOT have those paths at the pin
 * (else the file came from the parent and the honest word is `adapted`).
 *
 * Env: SYNC_PARENT_PATH=<local clone of the parent> skips the network (tests / offline).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { type SyncManifest, compileSurface, loadManifest } from './contract'
import { childFiles, parentFilesAt, parentHas, parentRead, resolveCommit, withParent } from './gitio'

// ─── Contracts ──────────────────────────────────────────────────────

export interface CheckOptions {
	/** Child repo root (default: process.cwd()). */
	childRoot?: string
	/** Local clone of the parent (default: env SYNC_PARENT_PATH; unset → temp bare clone of parent.repo). */
	parentPath?: string | undefined
	log?: (line: string) => void
}

export type CheckFailureKind =
	| 'drift-modified'
	| 'drift-missing'
	| 'drift-child-only'
	| 'adapted-missing'
	| 'adapted-fossil'
	| 'adapted-not-in-parent'
	| 'owned-empty'
	| 'owned-in-parent'
	| 'except-fossil'

export interface CheckFailure {
	kind: CheckFailureKind
	path: string
	detail: string
	/** The fix menu — every failure names its legal moves. */
	menu: string[]
}

export interface CheckResult {
	status: 'root' | 'clean' | 'drift'
	/** The pinned parent ref that was checked (absent for a root repo). */
	ref?: string
	failures: CheckFailure[]
	/** Files compared (inherited surface union) + adapted entries gated. */
	checked: number
}

const DRIFT_MENU = [
	'(a) re-pull the parent version (bun sync:pull, or git show <ref>:<path> from the parent)',
	'(b) reclassify to adapted in sync.yaml — WITH a why',
	'(c) upstream the change as a PR to the parent',
]

// ─── The gate ───────────────────────────────────────────────────────

function compareSurface(
	manifest: SyncManifest,
	childRoot: string,
	parentPath: string | undefined,
): { failures: CheckFailure[]; checked: number } {
	const surface = compileSurface(manifest)
	const childList = childFiles(childRoot)
	return withParent(manifest, parentPath, parent => {
		const ref = manifest.parent.ref
		resolveCommit(parent, ref)
		const parentSet = new Set(parentFilesAt(parent, ref).filter(path => surface.isInherited(path)))
		const childSet = new Set(childList.filter(path => surface.isInherited(path)))
		const childAll = new Set(childList)
		const failures: CheckFailure[] = []

		for (const path of [...parentSet].sort()) {
			if (!childSet.has(path)) {
				failures.push({
					kind: 'drift-missing',
					path,
					detail: `inherited file missing from the child tree (parent@${ref.slice(0, 12)} has it)`,
					menu: DRIFT_MENU,
				})
				continue
			}
			if (!parentRead(parent, ref, path).equals(readFileSync(join(childRoot, path)))) {
				failures.push({ kind: 'drift-modified', path, detail: `content differs from parent@${ref.slice(0, 12)}`, menu: DRIFT_MENU })
			}
		}
		for (const path of [...childSet].sort()) {
			if (!parentSet.has(path)) {
				failures.push({
					kind: 'drift-child-only',
					path,
					detail: `child-only file under the inherited surface (parent@${ref.slice(0, 12)} has no such file)`,
					menu: DRIFT_MENU,
				})
			}
		}

		// `except` is liveness-gated on the PARENT: the glob exists to stop claiming paths the
		// parent HAS and the child never took. Matching nothing at the pin means it excludes
		// nothing — a standing hole in the surface, pre-authorised for whatever the parent adds
		// under that glob later. Same reasoning as adapted-fossil, aimed the other way.
		const parentAll = parentFilesAt(parent, ref)
		for (const entry of manifest.except) {
			const matcher = new Bun.Glob(entry.path)
			if (!parentAll.some(path => matcher.match(path) && surface.matchesInheritedGlob(path))) {
				failures.push({
					kind: 'except-fossil',
					path: entry.path,
					detail: `no path under this glob exists in parent@${ref.slice(0, 12)} AND is claimed by an inherited glob — the exclusion excludes nothing ("${entry.why}")`,
					menu: [
						'(a) delete the except entry — the inherited globs no longer claim that area',
						'(b) fix the glob if the parent moved the files',
					],
				})
			}
		}

		// `owned` is liveness-gated on PROVENANCE, which is what distinguishes it from `adapted`:
		// the entry claims "this path is mine although your glob covers it", so the parent must
		// NOT have it at the pin (if it does, the file came from the parent and the honest
		// declaration is `adapted`), and the child must actually have something there (an owned
		// glob matching nothing carves a hole in the surface for no living file).
		const ownedGlobs = manifest.owned.map(entry => ({ entry, matcher: new Bun.Glob(entry.path) }))
		for (const { entry, matcher } of ownedGlobs) {
			const childMatches = childList.filter(path => matcher.match(path))
			if (childMatches.length === 0) {
				failures.push({
					kind: 'owned-empty',
					path: entry.path,
					detail: `owned entry matches no file in the child tree — it carves a hole in the inherited surface for nothing ("${entry.why}")`,
					menu: ['(a) delete the owned entry from sync.yaml', '(b) fix the path/glob if the file moved'],
				})
				continue
			}
			const alsoInParent = childMatches.filter(path => surface.matchesInheritedGlob(path) && parentHas(parent, ref, path))
			if (alsoInParent.length > 0) {
				failures.push({
					kind: 'owned-in-parent',
					path: entry.path,
					detail: `parent@${ref.slice(0, 12)} HAS ${alsoInParent.length === 1 ? `'${alsoInParent[0]}'` : `${alsoInParent.length} of these paths (e.g. '${alsoInParent[0]}')`} — a file that came from the parent is 'adapted' (it diverged) or 'inherited' (it did not); 'owned' claims it never came from the parent at all`,
					menu: [
						'(a) reclassify to adapted WITH a why — the file came from the parent and diverged',
						'(b) drop the owned entry and let the file be inherited again',
						'(c) narrow the owned glob so it stops claiming the parent’s files',
					],
				})
			}
		}

		for (const entry of manifest.adapted) {
			if (!childAll.has(entry.path)) {
				failures.push({
					kind: 'adapted-missing',
					path: entry.path,
					detail: 'adapted entry points at a file the child does not have',
					menu: ['(a) restore the file', '(b) delete the adapted entry from sync.yaml'],
				})
				continue
			}
			if (!parentHas(parent, ref, entry.path)) {
				failures.push({
					kind: 'adapted-not-in-parent',
					path: entry.path,
					detail: `parent@${ref.slice(0, 12)} has no such file — it cannot have "come from the parent"; the file is simply owned`,
					menu: ['(a) delete the adapted entry from sync.yaml — owned needs no declaration'],
				})
				continue
			}
			if (parentRead(parent, ref, entry.path).equals(readFileSync(join(childRoot, entry.path)))) {
				failures.push({
					kind: 'adapted-fossil',
					path: entry.path,
					detail: `adapted file matches the parent again — the divergence ("${entry.why}") is gone; the entry is a fossil`,
					menu: ['(a) delete the adapted entry — the file is inherited again (ensure a glob covers it)'],
				})
			}
		}
		return {
			failures,
			checked: new Set([...parentSet, ...childSet]).size + manifest.adapted.length + manifest.owned.length + manifest.except.length,
		}
	})
}

export function syncCheck(options: CheckOptions = {}): CheckResult {
	const childRoot = options.childRoot ?? process.cwd()
	const parentPath = options.parentPath ?? process.env.SYNC_PARENT_PATH
	const log = options.log ?? console.log

	const manifest = loadManifest(childRoot)
	if (manifest === null) {
		log('sync:check — no sync.yaml: root repo, nothing to check')
		return { status: 'root', failures: [], checked: 0 }
	}

	const { failures, checked } = compareSurface(manifest, childRoot, parentPath)
	const ref = manifest.parent.ref
	if (failures.length === 0) {
		log(`sync:check — clean: ${checked} path(s) match parent@${ref.slice(0, 12)}`)
		return { status: 'clean', ref, failures: [], checked }
	}
	for (const failure of failures) {
		log(`${failure.kind.toUpperCase()} ${failure.path} — ${failure.detail}`)
		for (const move of failure.menu) log(`  fix: ${move}`)
	}
	log(`sync:check — ${failures.length} failure(s) against parent@${ref.slice(0, 12)} (${checked} path(s) checked)`)
	return { status: 'drift', ref, failures, checked }
}

// ─── CLI ────────────────────────────────────────────────────────────

const HELP = `sync:check — drift gate against the parent declared in sync.yaml (pull-based).

No sync.yaml → this repo is a root: prints a no-op and exits 0.
With sync.yaml → diffs every 'inherited' glob between this tree and the parent at the
pinned ref, and liveness-gates every 'adapted' entry (must exist AND differ). Any failure
exits 1 with a named file + fix menu.

Usage:
  bun sync:check              run the gate (CI entrypoint)
  bun sync:check --help       this text

Env:
  SYNC_PARENT_PATH=<path>     use a local clone of the parent (offline / tests) instead of
                              a temp bare clone of parent.repo`

function main(): number {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: { help: { type: 'boolean', default: false } },
	})
	if (values.help) {
		console.log(HELP)
		return 0
	}
	const result = syncCheck()
	return result.status === 'drift' ? 1 : 0
}

if (import.meta.main) process.exit(main())
