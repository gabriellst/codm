#!/usr/bin/env bun
/**
 * pull.ts — `bun sync:pull [--to <ref>]`: advance the child's pin on the parent.
 *
 * Pull-based (USER DECISION 2026-07-21): the child fetches; the parent knows nothing.
 * Computes the parent's changes on the `inherited` surface between the current pin and the
 * target ref, applies them to the child tree, and rewrites sync.yaml's parent.ref (via the
 * YAML document API — comments in sync.yaml survive).
 *
 * Pull is a FAST-FORWARD from a clean base — one uniform conflict rule, no edge-case ifs:
 * for every path the parent changed, the child's current state must equal the parent's
 * state at the OLD pin (same bytes, or same absence). Anything else — local drift, an
 * owned file where the parent adds one — is a named conflict: run `bun sync:check`,
 * resolve via its menu, then pull again. A changed path that is `adapted` is always a
 * conflict (the parent moved under your deliberate divergence — merge by hand, then update
 * the why or reclassify). Conflicts abort BEFORE anything is written.
 *
 * Env: SYNC_PARENT_PATH=<local clone of the parent> skips the network (tests / offline).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseArgs } from 'node:util'
import { parseDocument } from 'yaml'
import { SYNC_MANIFEST_FILE, compileSurface, loadManifest } from './contract'
import { type ParentChange, parentChanges, parentHas, parentRead, resolveCommit, withParent } from './gitio'

// ─── Contracts ──────────────────────────────────────────────────────

export interface PullOptions {
	/** Child repo root (default: process.cwd()). */
	childRoot?: string
	/** Local clone of the parent (default: env SYNC_PARENT_PATH; unset → temp bare clone of parent.repo). */
	parentPath?: string | undefined
	/** Target commit-ish in the parent (default: the parent's HEAD). */
	to?: string | undefined
	/** List what would change without writing anything. */
	dryRun?: boolean
	log?: (line: string) => void
}

export interface PullConflict {
	path: string
	reason: string
}

export interface PullResult {
	status: 'root' | 'noop' | 'conflict' | 'dry-run' | 'applied'
	fromRef?: string
	toRef?: string
	/** Surface changes between the pins (what was — or would be — applied). */
	changes: ParentChange[]
	conflicts: PullConflict[]
}

// ─── The mechanism ──────────────────────────────────────────────────

function childState(childRoot: string, path: string): Buffer | null {
	const file = join(childRoot, path)
	return existsSync(file) ? readFileSync(file) : null
}

function rewritePin(childRoot: string, toRef: string): void {
	const file = join(childRoot, SYNC_MANIFEST_FILE)
	const doc = parseDocument(readFileSync(file, 'utf8'))
	doc.setIn(['parent', 'ref'], toRef)
	writeFileSync(file, doc.toString())
}

export function syncPull(options: PullOptions = {}): PullResult {
	const childRoot = options.childRoot ?? process.cwd()
	const parentPath = options.parentPath ?? process.env.SYNC_PARENT_PATH
	const log = options.log ?? console.log

	const manifest = loadManifest(childRoot)
	if (manifest === null) {
		log('sync:pull — no sync.yaml: root repo, nothing to pull')
		return { status: 'root', changes: [], conflicts: [] }
	}

	const surface = compileSurface(manifest)
	return withParent(manifest, parentPath, parent => {
		const fromRef = resolveCommit(parent, manifest.parent.ref)
		const toRef = resolveCommit(parent, options.to ?? 'HEAD')
		if (toRef === fromRef) {
			log(`sync:pull — already at parent@${toRef.slice(0, 12)}, nothing to pull`)
			return { status: 'noop', fromRef, toRef, changes: [], conflicts: [] }
		}

		// Set algebra over the declared paths: a parent change is relevant when it lands on the
		// inherited surface or on an adapted file (the latter is by definition a conflict).
		const relevant = parentChanges(parent, fromRef, toRef).filter(
			change => surface.isInherited(change.path) || surface.adapted.has(change.path),
		)

		const conflicts: PullConflict[] = []
		const changes: ParentChange[] = []
		for (const change of relevant) {
			if (surface.adapted.has(change.path)) {
				conflicts.push({
					path: change.path,
					reason: 'parent changed a file you adapted — merge by hand, then update the adapted why (or reclassify to inherited)',
				})
				continue
			}
			const base = parentHas(parent, fromRef, change.path) ? parentRead(parent, fromRef, change.path) : null
			const current = childState(childRoot, change.path)
			const cleanBase = base === null ? current === null : current !== null && base.equals(current)
			if (!cleanBase) {
				conflicts.push({
					path: change.path,
					reason: `child state does not match parent@${fromRef.slice(0, 12)} (local drift or an owned file in the way) — run bun sync:check, resolve, then pull again`,
				})
				continue
			}
			changes.push(change)
		}

		if (conflicts.length > 0) {
			for (const conflict of conflicts) log(`CONFLICT ${conflict.path} — ${conflict.reason}`)
			log(`sync:pull — ${conflicts.length} conflict(s); nothing was applied, the pin stays at ${fromRef.slice(0, 12)}`)
			return { status: 'conflict', fromRef, toRef, changes, conflicts }
		}

		for (const change of changes) log(`${change.action.toUpperCase().padEnd(6)} ${change.path}`)
		if (options.dryRun) {
			log(`sync:pull --dry-run — ${changes.length} change(s) from ${fromRef.slice(0, 12)} → ${toRef.slice(0, 12)}; nothing written`)
			return { status: 'dry-run', fromRef, toRef, changes, conflicts: [] }
		}

		for (const change of changes) {
			const target = join(childRoot, change.path)
			if (change.action === 'delete') {
				rmSync(target, { force: true })
			} else {
				mkdirSync(dirname(target), { recursive: true })
				writeFileSync(target, parentRead(parent, toRef, change.path))
			}
		}
		rewritePin(childRoot, toRef)
		log(`sync:pull — applied ${changes.length} change(s); pin advanced ${fromRef.slice(0, 12)} → ${toRef.slice(0, 12)}`)
		return { status: 'applied', fromRef, toRef, changes, conflicts: [] }
	})
}

// ─── CLI ────────────────────────────────────────────────────────────

const HELP = `sync:pull — advance this repo's pin on its parent (declared in sync.yaml).

No sync.yaml → this repo is a root: prints a no-op and exits 0.
With sync.yaml → applies the parent's changes on the 'inherited' surface between the
current pin and the target ref, then rewrites parent.ref. Fast-forward only: any path
whose child state differs from the parent at the OLD pin (or that you adapted) is a
named conflict — nothing is applied, exit 1.

Usage:
  bun sync:pull                    pull up to the parent's HEAD
  bun sync:pull --to <ref>         pull up to a specific parent commit/branch/tag
  bun sync:pull --dry-run          list what would change, write nothing
  bun sync:pull --help             this text

Env:
  SYNC_PARENT_PATH=<path>          use a local clone of the parent (offline / tests)`

function main(): number {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			to: { type: 'string' },
			'dry-run': { type: 'boolean', default: false },
			help: { type: 'boolean', default: false },
		},
	})
	if (values.help) {
		console.log(HELP)
		return 0
	}
	const result = syncPull({ to: values.to, dryRun: values['dry-run'] === true })
	return result.status === 'conflict' ? 1 : 0
}

if (import.meta.main) process.exit(main())
