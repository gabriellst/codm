import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { Bindings, Snippet } from './types'

const ROOT = process.cwd()

const PLACEHOLDER = /\{\{(\w+)\}\}/g

/** Substitute every {{key}} with bindings[key]; throw on a missing binding or a
 *  placeholder that survives substitution (a value must not smuggle in a {{leak}}). */
export function interpolate(template: string, vars: Record<string, string>): string {
	const out = template.replace(PLACEHOLDER, (_m, key: string) => {
		if (!(key in vars)) throw new Error(`[snippet] no binding for placeholder {{${key}}}`)
		return vars[key]
	})
	const leftover = out.match(PLACEHOLDER)
	if (leftover) throw new Error(`[snippet] unresolved placeholder(s) after interpolation: ${leftover.join(', ')}`)
	return out
}

/** Render a parsed Snippet against its Bindings: pick skeleton (default or
 *  _variant), resolve fragment-refs, then interpolate. */
export function renderSnippet(snippet: Snippet, bindings: Bindings): string {
	const { _variant, ...rest } = bindings

	let body = snippet.skeleton
	if (_variant !== undefined) {
		const named = snippet.skeletons?.[_variant]
		if (named === undefined) throw new Error(`[snippet] no skeleton variant "${_variant}"`)
		body = named
	}

	// First pass: collect all literal string bindings.
	const flat: Record<string, string> = {}
	for (const [k, v] of Object.entries(rest)) {
		if (typeof v === 'string') {
			flat[k] = v
		}
	}

	// Second pass: resolve fragment-refs (which may reference the literal bindings).
	for (const [k, v] of Object.entries(rest)) {
		if (typeof v !== 'string') {
			const ref = v as { fragment: string }
			const frag = snippet.fragments?.[ref.fragment]
			if (frag === undefined) throw new Error(`[snippet] no fragment "${ref.fragment}"`)
			flat[k] = interpolate(frag, flat) // fragment may reference earlier-resolved vars
		}
	}

	return interpolate(body, flat)
}

/** Load `<skill>/<lang>/registry.yaml` and return its `snippet` block.
 *  Mirrors the variant-then-flat resolution in scripts/graph/core/review-query.ts.
 *  Skills may place data at the top level OR under a `registry:` wrapper — both are supported. */
export function loadSnippet(skill: string, lang: string): Snippet {
	const path = join(ROOT, '.claude/skills', skill, lang, 'registry.yaml')
	const doc = parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown>
	// Unwrap `registry:` wrapper if present (mirrors review-query.ts line 115)
	const root = doc.registry && typeof doc.registry === 'object' ? (doc.registry as Record<string, unknown>) : doc
	const snippet = root.snippet as Snippet | undefined
	if (!snippet?.skeleton) throw new Error(`[snippet] ${skill}/${lang}/registry.yaml has no snippet.skeleton`)
	return snippet
}

/** Convenience used by the backend templates adapter. */
export function renderArtifact(skill: string, lang: string, bindings: Bindings): string {
	return renderSnippet(loadSnippet(skill, lang), bindings)
}
