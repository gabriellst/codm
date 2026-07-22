// Loads a component block's output chunks from the registry and interpolates each
// via the Phase-A renderer. Block fns keep their conditional logic; only the output
// strings live in YAML. The assembler (artifacts/component.ts) is unchanged.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { REPO } from '../../../../template.config'
import { interpolate } from '../../snippet/render'
import type { BlockOutput } from './types'

const ROOT = process.cwd()

type FragmentChunks = {
	imports?: string[]
	hookCalls?: string[]
	jsxBefore?: string
	jsxBody?: string
	declarations?: string[]
	exports?: string[]
	i18nSlots?: string[]
}

const cache = new Map<string, Record<string, FragmentChunks>>()

function loadBlocks(lang: string): Record<string, FragmentChunks> {
	const hit = cache.get(lang)
	if (hit) return hit
	const path = join(ROOT, '.claude/skills/component', lang, 'registry.yaml')
	const doc = parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown>
	const root = (doc.registry && typeof doc.registry === 'object' ? doc.registry : doc) as Record<string, unknown>
	const blocks = (root.blocks ?? {}) as Record<string, FragmentChunks>
	cache.set(lang, blocks)
	return blocks
}

/** Render a block's BlockOutput from its registry fragment, interpolating bindings.
 *  Returns {} when the block has no fragment (caller decides fallback). */
export function renderBlock(blockName: string, lang: string, bindings: Record<string, string>): BlockOutput {
	const chunks = loadBlocks(lang)[blockName]
	if (!chunks) return {}
	// {{sdkPackage}} is always bound: emitted SDK import specifiers flow from
	// template.config.ts, never from a literal in a fragment (sync-machinery P1-2).
	const vars = { sdkPackage: REPO.sdkSpecifier, ...bindings }
	const one = (s: string) => interpolate(s, vars)
	const many = (xs?: string[]) => xs?.map(one)
	return {
		...(chunks.imports ? { imports: many(chunks.imports) } : {}),
		...(chunks.hookCalls ? { hookCalls: many(chunks.hookCalls) } : {}),
		...(chunks.jsxBefore ? { jsxBefore: one(chunks.jsxBefore) } : {}),
		...(chunks.jsxBody ? { jsxBody: one(chunks.jsxBody) } : {}),
		...(chunks.declarations ? { declarations: many(chunks.declarations) } : {}),
		...(chunks.exports ? { exports: many(chunks.exports) } : {}),
		...(chunks.i18nSlots ? { i18nSlots: chunks.i18nSlots } : {}), // literal key tails — not interpolated
	}
}
