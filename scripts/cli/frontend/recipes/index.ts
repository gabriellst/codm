// Component recipes — sugar over block flag combinations.
// V1 ships four. More recipes (list-section, stats-section, detail-header) wait
// for V2 once these prove themselves in real usage (spec §6).

export interface Recipe {
	// Blocks auto-enabled by this recipe. The user can opt out individual
	// blocks via `--no-<block>` (except for blocks that are required by the
	// recipe's text shape — e.g. empty-state always needs i18n).
	blocks: string[]
	// Element tag emitted when --as is not passed.
	defaultElement?: string
	// When true, `--i18n=<prefix>` is required for this recipe (visible text guaranteed).
	requiresI18n?: boolean
	// Render the JSX body inside the root element. Receives the i18n prefix
	// (only when --i18n is passed) and the block-aggregated jsxBody string.
	renderBody?: (args: { i18nPrefix?: string; pascal: string }) => string
	// Slots the recipe emits beyond what the i18n block defaults to (added to
	// auto-trigger keys).
	i18nSlots?: string[]
}

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

const ROOT = process.cwd()

type RecipeFragment = {
	blocks: string[]
	defaultElement?: string
	requiresI18n?: boolean
	host?: string
}

const recipeCache = new Map<string, Record<string, RecipeFragment>>()

function loadRecipes(lang: string): Record<string, RecipeFragment> {
	const hit = recipeCache.get(lang)
	if (hit) return hit
	const path = join(ROOT, '.claude/skills/component', lang, 'registry.yaml')
	const doc = parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown>
	const root = (doc.registry && typeof doc.registry === 'object' ? doc.registry : doc) as Record<string, unknown>
	const recs = (root.recipes ?? {}) as Record<string, RecipeFragment>
	recipeCache.set(lang, recs)
	return recs
}

/** Load a recipe's block-refs and host body fragment from the registry.
 *  Returns the raw fragment (with {{placeholders}} unresolved). */
export function loadRecipe(name: string, lang: string): RecipeFragment {
	const recs = loadRecipes(lang)
	const r = recs[name]
	if (!r) throw new Error(`[recipes] no recipe "${name}" in ${lang} registry`)
	return r
}

import { plain } from './plain'
import { section } from './section'
import { card } from './card'
import { emptyState } from './empty-state'

export const recipes: Record<string, Recipe> = {
	plain,
	section,
	card,
	'empty-state': emptyState,
}
