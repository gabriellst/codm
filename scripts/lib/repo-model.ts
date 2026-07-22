// scripts/lib/repo-model.ts — the ONE interpreter of the repo's structural contracts for tooling.
//
// CLAUDE.md Non-Negotiable §5: language is a WORKSPACE property (REPO.workspaces[*].lang), never
// inferred from a folder/package name; taxonomy (components, cc-bp scopes) lives in
// .claude/registry.yaml as data. Every tool (review, classify-edit hook, detectors, graph) imports
// THIS module — local mirrors of detectLang/LANGS/scope maps are the drift class this file kills
// (HD-07/08/09/11 of .plans/2026-07-21-declarative-repo.md).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { REPO, type Workspace } from '../../template.config'

/** The language universe — derived from the workspace table, never re-declared. */
export type SkillLang = Workspace['lang']
export const LANGS: readonly SkillLang[] = [...new Set(Object.values(REPO.workspaces).map(w => w.lang))]

// Longest pkgRoot first so nested/overlapping roots resolve to the most specific workspace.
const WORKSPACES_BY_ROOT = [...Object.values(REPO.workspaces)].sort((a, b) => b.pkgRoot.length - a.pkgRoot.length)

/**
 * Resolve a file's language: workspace containment FIRST (the declared contract — a fork may name
 * its TS backend `main-back`; the pkgRoot, not the name, decides), then extension fallbacks for
 * files outside any declared workspace (scripts/, fixtures).
 */
export function detectLang(file: string): SkillLang {
	const norm = file.replace(/\\/g, '/')
	for (const w of WORKSPACES_BY_ROOT) {
		if (norm.includes(`${w.pkgRoot}/`)) return w.lang
	}
	if (norm.endsWith('.go')) return 'go'
	if (norm.endsWith('.astro')) return 'astro'
	if (norm.endsWith('.tsx')) return 'react'
	return 'typescript'
}

export interface GlobalRegistry {
	/** artifact name → { skill, patterns, layer } from .claude/registry.yaml components. */
	components: Record<string, { skill?: string; patterns?: string[]; layer?: string }>
	/** cc-bp id → review scope, from each entry's `scope:` field (HD-09: the split CC_BP_SCOPE map died). */
	ccBpScopes: Record<string, 'backend' | 'frontend' | 'all'>
}

const GLOBAL_REGISTRY_PATH = resolve(import.meta.dirname, '..', '..', '.claude', 'registry.yaml')
let cached: GlobalRegistry | null = null

/** Parse .claude/registry.yaml once — the single taxonomy source for every tool. */
export function globalRegistry(): GlobalRegistry {
	if (!cached) {
		const doc = parseYaml(readFileSync(GLOBAL_REGISTRY_PATH, 'utf8')) as {
			components?: GlobalRegistry['components']
			cross_cutting_bad_practices?: { id?: string; scope?: 'backend' | 'frontend' | 'all' }[]
		}
		const ccBpScopes: GlobalRegistry['ccBpScopes'] = {}
		for (const bp of doc.cross_cutting_bad_practices ?? []) {
			if (bp.id && bp.scope) ccBpScopes[bp.id] = bp.scope
		}
		cached = { components: doc.components ?? {}, ccBpScopes }
	}
	return cached
}
