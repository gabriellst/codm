import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { REPO } from '../template.config'
import { detectLang, globalRegistry, LANGS } from './lib/repo-model'
import { CLASSIFICATION_RULES } from './review'

/**
 * Taxonomy-parity gate — one taxonomy, three consumers (review.ts, classify-edit hook, humans
 * reading .claude/registry.yaml). The artifact universe is DECLARED in the yaml `components:`;
 * review.ts CLASSIFICATION_RULES is the reviewer's interpreter of it. When the two drift, files
 * are SILENTLY dropped from review — that is exactly how `jobs/` vanished for weeks (a yaml-less,
 * rule-less family nobody was warned about). This gate makes the drift a named failure.
 */

const ROOT = resolve(import.meta.dirname, '..')

// yaml components that intentionally have NO review classification rule — each with a WHY.
// A new yaml component missing BOTH a rule and a disposition here fails the gate: deciding
// "how does review see this family?" is part of declaring the component.
const DISPOSITIONS: Record<string, string> = {
	section: 'reviewed as `component` — sections live in -components/ and match the component rule',
	'projection-repository': 'reviewed as `repository` — lives under repositories/, the repository rule claims it',
	storybook: '*.stories.tsx is intentionally skipped by review (dumb stories carry no reviewable logic)',
	'bounded-context': 'composition roots (index.ts / module.go) are intentionally skipped by review',
	e2e: 'Playwright *.spec.ts files match the test-file skip guard — e2e review runs through the e2e skill, not batch review',
}

const yamlComponents = () => Object.keys(globalRegistry().components)
const ruleArtifacts = () => [...new Set(CLASSIFICATION_RULES.map(r => r.artifact))]

describe('taxonomy-parity (.claude/registry.yaml components ⇔ review.ts CLASSIFICATION_RULES)', () => {
	test('every classification-rule artifact is a declared yaml component', () => {
		const components = new Set(yamlComponents())
		const missing = ruleArtifacts().filter(a => !components.has(a))
		expect(
			missing,
			`review.ts classifies artifact(s) that .claude/registry.yaml never declared — add the ` +
				`component (skill, patterns, layer) so the hook and humans see the same taxonomy: ${missing.join(', ')}`,
		).toEqual([])
	})

	test('every yaml component has a classification rule OR a named disposition', () => {
		const artifacts = new Set(ruleArtifacts())
		const unhandled = yamlComponents().filter(c => !artifacts.has(c) && !(c in DISPOSITIONS))
		expect(
			unhandled,
			`yaml component(s) with NO review rule and NO declared disposition — this is the silent-drop ` +
				`class (jobs/ bug): add a CLASSIFICATION_RULES entry in scripts/review.ts, or declare WHY ` +
				`review skips it in DISPOSITIONS (scripts/taxonomy-parity.test.ts): ${unhandled.join(', ')}`,
		).toEqual([])
	})

	test('dispositions are alive (each names an existing yaml component)', () => {
		const components = new Set(yamlComponents())
		const fossil = Object.keys(DISPOSITIONS).filter(c => !components.has(c))
		expect(fossil, 'Fossil disposition — the yaml component it excuses no longer exists. Remove the entry.').toEqual([])
	})

	test('every cross_cutting_bad_practices entry declares a scope', () => {
		const raw = parseYaml(readFileSync(resolve(ROOT, '.claude/registry.yaml'), 'utf8')) as {
			cross_cutting_bad_practices?: { id?: string; scope?: string }[]
		}
		const entries = raw.cross_cutting_bad_practices ?? []
		expect(entries.length).toBeGreaterThan(0)
		const unscoped = entries.filter(e => !e.scope || !['backend', 'frontend', 'all'].includes(e.scope)).map(e => e.id ?? '<no id>')
		expect(
			unscoped,
			'cc-bp entry without a valid `scope:` (backend|frontend|all) — an unscoped entry silently drops out of EVERY review batch.',
		).toEqual([])
		// And the loader sees exactly what the yaml declares.
		expect(Object.keys(globalRegistry().ccBpScopes).sort()).toEqual(entries.map(e => e.id ?? '').sort())
	})

	test('detectLang: the containing workspace decides; extension fallbacks only outside workspaces', () => {
		// Workspace cases DERIVE from the manifest — a stamped repo ships a subset of workspaces
		// and this gate must pass inside any valid stamp (manifest closure). The sample paths
		// exercise containment-beats-extension (e.g. a .tsx under an astro root is astro-lang).
		const SAMPLE_BY_LANG: Record<string, string> = {
			typescript: 'src/billing/entities/Invoice.ts',
			go: 'internal/notifications/handlers/handler.go',
			react: 'src/routes/app/index.tsx',
			astro: 'src/components/Island.tsx',
		}
		for (const ws of Object.values(REPO.workspaces)) {
			const sample = SAMPLE_BY_LANG[ws.lang]
			if (sample === undefined) continue
			expect(detectLang(`${ws.pkgRoot}/${sample}`)).toBe(ws.lang)
		}
		// Outside every declared workspace: extension fallbacks.
		expect(detectLang('scripts/lib/repo-model.ts')).toBe('typescript')
		expect(detectLang('examples/citizens/go/entities/order.go')).toBe('go')
		expect(detectLang('some/loose/Component.tsx')).toBe('react')
	})

	test('LANGS is exactly the language universe of the declared workspaces', () => {
		const fromWorkspaces = [...new Set(Object.values(REPO.workspaces).map(w => w.lang))].sort()
		expect([...LANGS].sort()).toEqual(fromWorkspaces)
	})
})
