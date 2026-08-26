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

// Longest srcRoot first so nested/overlapping roots resolve to the most specific workspace.
const WORKSPACES_BY_ROOT = [...Object.values(REPO.workspaces)].sort((a, b) => b.srcRoot.length - a.srcRoot.length)

/**
 * Resolve a file's language: workspace containment FIRST (the declared contract — a fork may name
 * its TS backend `main-back`; the declared root, not the name, decides), then extension fallbacks
 * for files outside any declared workspace root (scripts/, fixtures, a package's own config files).
 *
 * Containment is tested against **`srcRoot`**, not `pkgRoot`, and that distinction is what makes a
 * BILINGUAL workspace work. `appTauri` declares `lang: 'rust'` with
 * `srcRoot: packages/app/tauri/src-tauri/src` — its native half — while the rest of the package is
 * the TypeScript config surface that renders the host's committed JSON. Matching on `pkgRoot` gave
 * `config/app.ts` the language `rust`, so a manifest file and a process reaper resolved to the same
 * playbook. For every workspace whose srcRoot IS its pkgRoot (client, e2e) nothing changes, and for
 * the rest the files between the two roots are package config, which the extension fallbacks answer
 * identically. `contracts` used to be in that same-root group too, but its own src/ envelope
 * (`packages/contracts/src`, the wire/contexts/db move) split it the same way: `codegen/`,
 * `generated/`, `catalog/` and `fixtures/` now sit OUTSIDE srcRoot and fall through to the `.ts`
 * extension default — which resolves to `typescript` either way, since `contracts` is mono-lingual,
 * so the fallback is a no-op in practice (unlike `appTauri`'s bilingual split, where the fallback
 * answers differently from the declared workspace `lang`).
 *
 * `.rs` joined the fallbacks with the shell: `src-tauri/build.rs` and `src-tauri/tests/*.rs` sit
 * outside `srcRoot` and are unambiguously Rust.
 */
export function detectLang(file: string): SkillLang {
	const norm = file.replace(/\\/g, '/')
	for (const w of WORKSPACES_BY_ROOT) {
		if (norm.includes(`${w.srcRoot}/`)) return w.lang
	}
	if (norm.endsWith('.go')) return 'go'
	if (norm.endsWith('.rs')) return 'rust'
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
