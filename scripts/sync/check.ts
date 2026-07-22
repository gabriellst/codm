#!/usr/bin/env bun
/**
 * check.ts — `bun sync:check`: the DRIFT GATE a child (fork) runs in its CI.
 *
 * Pull-based (USER DECISION 2026-07-21): the child declares the parent in sync.yaml;
 * the parent knows nothing. A repo WITHOUT sync.yaml is a root — the gate no-ops green,
 * which is exactly how the template itself stays green while shipping this tool.
 *
 * Evaluation is set algebra over the declared paths (contract.ts compiles the ONE surface):
 *   P = parent@ref files ∩ inherited \ adapted        C = child tree files ∩ inherited \ adapted
 *   P \ C   → drift-missing        (inherited file the child lost)
 *   C \ P   → drift-child-only     (child grew a file under the parent-owned surface)
 *   P ∩ C   → byte-compare         (differs → drift-modified)
 * Every drift is a NAMED failure with the fix menu:
 *   (a) re-pull the parent version · (b) reclassify to adapted WITH a why · (c) upstream a PR.
 *
 * adapted entries are LIVENESS-gated: the path must exist in the child AND differ from the
 * parent at the pin. An adapted file that matches the parent again is a FOSSIL — fail,
 * reclassify to inherited. An adapted path the parent never had at the pin documents
 * nothing — fail, the file is simply owned.
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
		return { failures, checked: new Set([...parentSet, ...childSet]).size + manifest.adapted.length }
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
