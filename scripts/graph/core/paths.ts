import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { REPO } from '../../../template.config'

// ── Repo root ────────────────────────────────────────────────────────────────
// The graph CLI may be invoked from any cwd. We locate the monorepo root by:
//   1. REPO.rootEnvVar env override (or GRAPH_ROOT alias for CI compatibility).
//   2. Walking up from cwd looking for the monorepo marker:
//      a package.json with `workspaces` AND a sibling `packages/contracts` directory.
//   3. Falling back to cwd as last resort.

function findMonorepoRoot(): string {
	const override = process.env[REPO.rootEnvVar] ?? process.env.GRAPH_ROOT
	if (override) return resolve(override)

	let cursor = process.cwd()
	while (cursor !== dirname(cursor)) {
		const pkgPath = join(cursor, 'package.json')
		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { workspaces?: unknown }
				if (pkg.workspaces && existsSync(join(cursor, 'packages/contracts'))) {
					return cursor
				}
			} catch {
				// fall through
			}
		}
		cursor = dirname(cursor)
	}
	return process.cwd()
}

export const ROOT = findMonorepoRoot()

// ── Registry + skills (location-stable across template forks) ────────────────

export const REGISTRY_INDEX = join(ROOT, '.claude/registry.yaml')
export const SKILLS_DIR = join(ROOT, '.claude/skills')

// ── Graph output artifacts ───────────────────────────────────────────────────

export const GRAPH_OUT = join(ROOT, '.graph')
export const GRAPH_JSON = join(GRAPH_OUT, 'graph.json')
export const AUDIT_JSON = join(GRAPH_OUT, 'audit.json')

// ── Path helpers ─────────────────────────────────────────────────────────────

export function repoRelative(absPath: string): string {
	return relative(ROOT, resolve(absPath)).replace(/\\/g, '/')
}

export function fromRepo(repoPath: string): string {
	return resolve(ROOT, repoPath)
}
