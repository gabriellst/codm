/**
 * gitio.ts — git plumbing shared by sync:check and sync:pull.
 *
 * Parent acquisition is pull-based: the child fetches the parent, never the reverse.
 * Two sources, ONE handle shape:
 *   - SYNC_PARENT_PATH (env or option) → a local clone of the parent (tests / offline);
 *   - otherwise → a temp bare clone of manifest.parent.repo (removed in finally).
 *
 * Everything reads through git plumbing (ls-tree / show / ls-files) so content comparison
 * is byte-exact and binary-safe. No path-format parsing beyond NUL-splitting -z output.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SyncContractError, type SyncManifest } from './contract'

const MAX_BUFFER = 64 * 1024 * 1024

function git(dir: string, args: string[]): Buffer {
	// stderr piped (not inherited): probes like cat-file -e on a missing path are EXPECTED
	// to fail — their "fatal:" chatter must not pollute the gate output.
	return execFileSync('git', ['-C', dir, ...args], { maxBuffer: MAX_BUFFER, stdio: ['ignore', 'pipe', 'pipe'] })
}

function gitLinesZ(dir: string, args: string[]): string[] {
	return git(dir, args)
		.toString('utf8')
		.split('\0')
		.filter(line => line !== '')
}

// ─── Parent handle ──────────────────────────────────────────────────

export interface ParentRepo {
	/** Directory usable as `git -C` — a local clone or a temp bare clone. */
	dir: string
	/** Where it came from — for error messages. */
	source: string
}

/**
 * Acquire the parent repo, run `fn`, always release the temp clone.
 * `parentPath` (SYNC_PARENT_PATH) short-circuits the network entirely.
 */
export function withParent<T>(manifest: SyncManifest, parentPath: string | undefined, fn: (parent: ParentRepo) => T): T {
	if (parentPath !== undefined) {
		try {
			git(parentPath, ['rev-parse', '--git-dir'])
		} catch {
			throw new SyncContractError(
				`SYNC_PARENT_PATH points at '${parentPath}', which is not a git repo — it must be a local clone of the parent (${manifest.parent.repo})`,
			)
		}
		return fn({ dir: parentPath, source: `SYNC_PARENT_PATH=${parentPath}` })
	}
	const scratch = mkdtempSync(join(tmpdir(), 'sync-parent-'))
	try {
		const clone = join(scratch, 'parent.git')
		execFileSync('git', ['clone', '--bare', '--quiet', manifest.parent.repo, clone], { stdio: 'ignore' })
		return fn({ dir: clone, source: manifest.parent.repo })
	} finally {
		rmSync(scratch, { recursive: true, force: true })
	}
}

/** Resolve any commit-ish to a full sha in the parent. Teaching error when it does not exist. */
export function resolveCommit(parent: ParentRepo, ref: string): string {
	try {
		return git(parent.dir, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])
			.toString('utf8')
			.trim()
	} catch {
		throw new SyncContractError(
			`ref '${ref}' does not resolve to a commit in the parent (${parent.source}) — if this is the sync.yaml pin, the pin is corrupt or the parent history was rewritten; re-pin with: bun sync:pull --to <ref>`,
		)
	}
}

/** Every file path in the parent tree at `ref`. */
export function parentFilesAt(parent: ParentRepo, ref: string): string[] {
	return gitLinesZ(parent.dir, ['ls-tree', '-r', '--name-only', '-z', ref])
}

/** Byte content of `path` in the parent at `ref`. */
export function parentRead(parent: ParentRepo, ref: string, path: string): Buffer {
	return git(parent.dir, ['show', `${ref}:${path}`])
}

/** Whether `path` exists in the parent tree at `ref`. */
export function parentHas(parent: ParentRepo, ref: string, path: string): boolean {
	try {
		git(parent.dir, ['cat-file', '-e', `${ref}:${path}`])
		return true
	} catch {
		return false
	}
}

export type ParentChangeAction = 'add' | 'modify' | 'delete'

export interface ParentChange {
	path: string
	action: ParentChangeAction
}

const STATUS_ACTION: Record<string, ParentChangeAction> = {
	A: 'add',
	M: 'modify',
	T: 'modify', // typechange — content is still what the child needs
	D: 'delete',
}

/** Per-file changes in the parent between two commits (no rename detection — pure A/M/D). */
export function parentChanges(parent: ParentRepo, fromRef: string, toRef: string): ParentChange[] {
	const tokens = gitLinesZ(parent.dir, ['diff', '--name-status', '--no-renames', '-z', fromRef, toRef])
	const changes: ParentChange[] = []
	for (let i = 0; i < tokens.length; i += 2) {
		const status = tokens[i] as string
		const path = tokens[i + 1]
		if (path === undefined)
			throw new SyncContractError(`git diff --name-status returned a dangling status '${status}' — parent diff output is corrupt`)
		const action = STATUS_ACTION[status]
		if (action === undefined)
			throw new SyncContractError(
				`git diff --name-status returned unsupported status '${status}' for '${path}' (rename detection is off; expected A/M/T/D)`,
			)
		changes.push({ path, action })
	}
	return changes
}

// ─── Child working tree ─────────────────────────────────────────────

/**
 * Every file present in the child WORKING TREE (tracked + untracked-unignored, minus
 * files deleted from the worktree). The working tree is the truth being checked — not HEAD.
 */
export function childFiles(childRoot: string): string[] {
	let listed: string[]
	let deleted: string[]
	try {
		listed = gitLinesZ(childRoot, ['ls-files', '-co', '--exclude-standard', '-z'])
		deleted = gitLinesZ(childRoot, ['ls-files', '-d', '-z'])
	} catch {
		throw new SyncContractError(`'${childRoot}' is not a git repo — sync reads the child working tree through git; run it at the repo root`)
	}
	const gone = new Set(deleted)
	return [...new Set(listed)].filter(path => !gone.has(path))
}
