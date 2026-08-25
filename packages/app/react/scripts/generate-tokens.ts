#!/usr/bin/env bun
/**
 * generate-tokens.ts — deterministic design/system/pen/tokens.json → styles/tokens.generated.css compiler.
 *
 * Source of truth (once F1 lands): `design/system/pen/tokens.json`, extracted from `design/codm.pen`.
 * This script is the ONLY thing allowed to write `packages/app/ui/styles/tokens.generated.css` — never
 * hand-edit it.
 *
 * ── F0 status (this task, T5) ─────────────────────────────────────────────────────────────────
 * Ported as a PURE, TESTABLE compiler only. `design/system/pen/tokens.json` does not exist yet
 * (F1 extracts it from the .pen) and `packages/app/ui/styles/tokens.generated.css` is not wired into
 * the build — the CURRENT `packages/app/ui/styles/tokens.css` cascade keeps mattering until F2
 * (Decision 2, `.specs/2026-08-24-extracao-ui-fidelity.md`). Running this script directly today is
 * a documented no-op (see `import.meta.main` below); `generateTokensCss` is exported and covered
 * by a synthetic fixture in `generate-tokens.test.ts` — the byte-for-byte golden test against a
 * committed `tokens.json` is F2's job, not F0's.
 *
 * ── Placement decision (registered, ported from bk-products T8) ─────────────────────────────────
 * Every COLOR gets a `--color-<name>` entry inside `@theme inline` — required, or the matching
 * Tailwind color utility is a silent no-op (project memory: react-styling-silent-failures).
 *
 * `radius-*` and the purely-NUMERIC `text-<n>` keys (text-11..text-26) also live in
 * `@theme inline`. Some of those names (radius-sm/md/lg/xl/2xl) collide with Tailwind's own
 * default radius scale — that collision is harmless here because `packages/app/react/src/
 * index.css` redeclares those same names in its OWN `@theme inline` block strictly AFTER this
 * file is imported, so the later declaration wins the cascade and app-react's current radius
 * utilities are unaffected until a later task adopts these tokens directly. The rest of the
 * radius/text-<n> keys (radius-full, radius-pill, text-11, text-14, ...) don't exist as Tailwind
 * defaults at all, so declaring them is purely additive.
 *
 * `space-*`, `icon-*`, `size-*`, the SEMANTIC `text-xs..text-2xl` keys, `weight-*`,
 * `stroke-hair`, `border-hair` and `leading-*` stay PLAIN `:root` custom properties — deliberately
 * OUTSIDE `@theme inline` — because Tailwind v4 treats `--spacing-<n>` and
 * `--text-<xs|sm|base|lg|xl|2xl>` as its OWN reserved scale namespaces. app-react already has a
 * large surface of pre-existing `p-4` / `gap-8` / `text-sm` usage that assumes the FRAMEWORK
 * default (a linear `--spacing` multiplier, and Tailwind's own rem-based text scale) — redeclaring
 * those exact namespaced keys here would silently change what every pre-existing utility class
 * renders as, repo-wide, the moment this file reaches app-react (it is forward-imported from
 * `packages/app/ui/styles/tokens.generated.css`). Consumers reach these plain vars via Tailwind's
 * arbitrary-value syntax instead: `gap-[var(--space-8)]`, `text-[length:var(--icon-16)]`, etc.
 * `rounded-[var(--radius-sm)]` also works this way for anyone who wants the raw var rather than
 * the (safe-but-shadowed) `rounded-sm` utility.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface TokenVar {
	type: 'color' | 'number' | 'string'
	value: string | number
}

export interface TokensJson {
	variables: Record<string, TokenVar>
}

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')
export const TOKENS_JSON_PATH = join(REPO_ROOT, 'design/system/pen/tokens.json')
export const TOKENS_CSS_PATH = join(REPO_ROOT, 'packages', 'app', 'ui', 'styles', 'tokens.generated.css')

/** Font weights this design system actually declares (weight-regular..weight-bold: 400-700). */
const INTER_WEIGHTS = ['400', '500', '600', '700'] as const

/**
 * LEGACY_VAR_MAP — bare `--<name>` custom properties the app consumes via `var(--x)` that
 * `design/system/pen/tokens.json` does not name. Empty in F0: the pen hasn't been extracted yet,
 * so there is nothing to cross-reference against. The CODM map will be derived in F2 by grepping
 * `var(--` across the actual consumers (`packages/app/ui/styles/tokens.css` and its downstream
 * importers) against the pen's extracted keys — UI-FIDELITY G1/W0 equivalent for this repo. It is
 * NOT copied from bk-products: that map documents bk's own legacy surface (sidebar/rail/composer/
 * chat/bubble/chart/brand-purple/etc.), which has no bearing on what CODM's `tokens.css` actually
 * references.
 */
const LEGACY_VAR_MAP: Record<string, string> = {}

function resolveColorValue(value: string): string {
	// Aliases ("$accent") resolve to a var() reference so the alias chain stays live in CSS
	// (e.g. --success: var(--accent);), never inlined/flattened.
	return value.startsWith('$') ? `var(--${value.slice(1)})` : value
}

function isRadiusKey(key: string): boolean {
	return key.startsWith('radius-')
}

function isNumericTextKey(key: string): boolean {
	// text-11, text-12, ... — NOT text-xs/text-sm/text-base/text-lg/text-xl/text-2xl, which are
	// Tailwind's own reserved scale names and stay plain (see module docblock).
	return /^text-\d+$/.test(key)
}

function numberUnit(key: string, value: number): string {
	// leading-prose / leading-prose-sm are unitless line-height ratios; everything else numeric
	// in this token set (radius/space/text/icon/size/stroke-hair/border-hair) is a pixel value.
	return key.startsWith('leading-') ? `${value}` : `${value}px`
}

/**
 * Pure compiler: tokens.json -> tokens.css source text. No filesystem access, so a fixture-driven
 * test can call it directly without `design/system/pen/tokens.json` existing on disk.
 */
export function generateTokensCss(tokensJson: TokensJson): string {
	const rootLines: string[] = []
	// --font-sans is declared once, up front, driven by the design system's chosen family (Inter)
	// rather than the token's own literal value — the token JSON just records "Inter" as a fact,
	// the @fontsource import below is what actually ships it. --font-display/--font-serif are
	// LEGACY slot names the pen doesn't distinguish — the pen ships a single family, so both alias
	// it here (never in app css, where a later declaration would win the cascade back — the exact
	// G1-style regression this file exists to end).
	const themeLines: string[] = [
		'\t--font-sans: "Inter", sans-serif;',
		'\t--font-display: "Inter", sans-serif;',
		'\t--font-serif: "Inter", sans-serif;',
	]

	for (const [key, token] of Object.entries(tokensJson.variables)) {
		if (token.type === 'color') {
			rootLines.push(`\t--${key}: ${resolveColorValue(String(token.value))};`)
			themeLines.push(`\t--color-${key}: var(--${key});`)
			continue
		}

		if (token.type === 'number') {
			const value = token.value as number
			if (isRadiusKey(key) || isNumericTextKey(key)) {
				themeLines.push(`\t--${key}: ${numberUnit(key, value)};`)
			} else {
				rootLines.push(`\t--${key}: ${numberUnit(key, value)};`)
			}
			continue
		}

		// token.type === 'string' — font-sans is handled by the literal line above; every other
		// string token today is a weight-* value ("400".."700"), emitted as-is (no quotes: it is
		// a numeric CSS value, not a font-family string).
		if (key === 'font-sans') continue
		rootLines.push(`\t--${key}: ${token.value};`)
	}

	// LEGACY_VAR_MAP entries are additive to the pen's own keys, never a redefinition of one — a
	// collision means the pen adopted a name this map was standing in for, and the map entry is now
	// dead weight the next edit must remove.
	for (const [key, value] of Object.entries(LEGACY_VAR_MAP)) {
		if (key in tokensJson.variables) {
			throw new Error(
				`generate-tokens: LEGACY_VAR_MAP['${key}'] now collides with a pen-declared token — remove the legacy entry, the pen owns this name.`,
			)
		}
		rootLines.push(`\t--${key}: ${value};`)
	}

	const fontImports = INTER_WEIGHTS.map(weight => `@import "@fontsource/inter/${weight}.css";`).join('\n')

	return `/* GENERATED FILE — do not hand edit. Regenerate: bun packages/app/react/scripts/generate-tokens.ts
 * Source: design/system/pen/tokens.json (extracted from design/codm.pen).
 * See generate-tokens.ts's module docblock for the @theme-inline-vs-plain-:root placement decision. */
${fontImports}

:root {
${rootLines.join('\n')}
}

@theme inline {
${themeLines.join('\n')}
}
`
}

if (import.meta.main) {
	if (!existsSync(TOKENS_JSON_PATH)) {
		console.log(
			'generate-tokens: design/system/pen/tokens.json ainda não existe (F1 extrai do .pen) — nada a gerar',
		)
		process.exit(0)
	}

	const tokensJson = JSON.parse(readFileSync(TOKENS_JSON_PATH, 'utf8')) as TokensJson
	writeFileSync(TOKENS_CSS_PATH, generateTokensCss(tokensJson))
	console.log(`wrote ${TOKENS_CSS_PATH}`)
}
