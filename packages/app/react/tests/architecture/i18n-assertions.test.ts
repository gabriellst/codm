import { describe, expect, it } from 'bun:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import pt from '../../src/locales/pt.json' with { type: 'json' }
import en from '../../src/locales/en.json' with { type: 'json' }

/**
 * RAIL I18N-01 — a test may not assert on hardcoded UI copy. If the string is in the catalog, the
 * assertion reads it FROM the catalog.
 *
 * The rule was already doctrine and already had a helper, and neither did anything. It is stated in
 * exactly one line — `packages/e2e/tests/README.md:25`, *"assert against the app's own locale
 * strings, never hardcoded copy"* — and the helper it names, `packages/e2e/utils/i18n.ts`, was
 * imported by **zero** test files when this rail was written (2026-08-18). Declared, tooled, unused,
 * ungated: the exact shape this repo keeps finding, and the reason the rule needs a rail rather than
 * another sentence.
 *
 * WHY IT MATTERS, measured rather than argued. `06-onboarding-attach.spec.ts:75` asserted the
 * literal `'Converse com seu código'`, which is the VALUE of `onboarding.slides.slide1Title` in
 * `pt.json`. Two failure modes follow, and both are worse than a compile error:
 *   1. A copy edit — a comma, an accent, a rewording — breaks a test that has nothing to do with the
 *      change, and the failure surfaces as `Unable to find an element with the text: …`, which reads
 *      like a broken feature rather than a stale string.
 *   2. The assertion silently stops meaning what it says the moment the app renders another locale.
 *      Nothing tells you; the query simply finds nothing.
 *
 * THE PREDICATE, and why it cannot cry wolf: a literal is a violation **only if it appears as a leaf
 * VALUE in `pt.json`**. A `data-testid`, a URL, a CSS selector, an enum token or a fixture name is
 * not in the catalog, so it can never be flagged. Conversely a real piece of user-facing copy is in
 * the catalog by construction — the repo's own rule is that every user-facing string comes from
 * `t()` (`packages/app/react/CLAUDE.md`). So the rule is exact in both directions, with no allowlist
 * to curate.
 *
 * WHY IT LIVES IN THE REACT LANE while it mostly guards `packages/e2e`: `bun run test` is
 * `nx run-many -t test --exclude=e2e` (package.json:41), so a rail placed in `packages/e2e` would
 * never run in CI — the very hole this repo measured as F7. `app-react:test` is inside `bun run
 * test`, and this directory already carries cross-package rails (`go-boundary.test.ts`). The rail
 * follows the gate, not the folder.
 *
 * THE FIX the failure message hands you: import the typed `t()` from `packages/e2e/utils/i18n.ts`
 * (its key type is derived from `pt.json`, so a renamed key becomes a `tsc` error) and assert
 * `t('the.key')` instead of the literal.
 */

const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..', '..')
const E2E_TESTS = join(REPO_ROOT, 'packages', 'e2e', 'tests')
const REACT_SRC = join(REPO_ROOT, 'packages', 'app', 'react', 'src')
const REACT_TESTS = join(REPO_ROOT, 'packages', 'app', 'react', 'tests')

/** Every leaf value of the catalog → the dotted key that owns it. */
function catalogIndex(node: unknown, prefix = '', out = new Map<string, string>()): Map<string, string> {
	if (typeof node === 'string') {
		// First key wins: a value shared by two keys still yields ONE actionable suggestion.
		if (!out.has(node)) out.set(node, prefix)
		return out
	}
	if (node && typeof node === 'object') {
		for (const [k, v] of Object.entries(node)) catalogIndex(v, prefix ? `${prefix}.${k}` : k, out)
	}
	return out
}

/**
 * BOTH catalogs. Indexing only `pt.json` was this rail's second measured gap: an assertion on an
 * English string is the same defect, and `ServicesProvider.test.tsx` already carries a literal that
 * collides with `en:home.setupWorkspaceTitle`. `pt` is indexed first so its key wins a tie, which
 * keeps the suggested fix in the repo's default locale.
 */
const VALUE_TO_KEY = catalogIndex(en, '', catalogIndex(pt))

/**
 * TESTS WHOSE SUBJECT IS THE LABEL MACHINERY ITSELF — they MUST assert literals.
 *
 * `enumLabel('ChannelStatus', 'DISCONNECTED')` is only proven correct by comparing it to the actual
 * string. Asserting `t('enums.ChannelStatus.DISCONNECTED')` there would compare the catalog to
 * itself and pass vacuously no matter how broken the resolver is — the rule would destroy the very
 * test that guards it. Same for this rail's own self-test below, which pins the index by value.
 *
 * This is an allowlist, and it is deliberately two entries long with a stated reason each. If it
 * ever needs a third, the question to ask is whether that test really tests the MECHANISM or has
 * merely become inconvenient — the second answer is how allowlists rot.
 */
const MECHANISM_TESTS = new Set([
	'lib/enums.test.ts', // proves enumLabel() resolves a key to its string, in both locales
	'architecture/i18n-assertions.test.ts', // this file: its self-test pins the catalog index by value
])

/**
 * Query APIs whose argument is USER-FACING COPY. Deliberately excludes `getByTestId`, `locator`,
 * `getByRole(role)` without a name, and anything selector-shaped — those never carry copy.
 */
const COPY_QUERIES = [
	/\b(?:getBy|findBy|queryBy|getAllBy|findAllBy|queryAllBy)Text\(\s*(['"`])([^'"`]+)\1/g,
	/\b(?:getBy|findBy|queryBy)(?:Placeholder|Label|Title|AltText)[A-Za-z]*\(\s*(['"`])([^'"`]+)\1/g,
	// `name:` ONLY inside a getByRole(...) call. A bare /\bname:/ was the rail's first version and it
	// was WRONG — measured on the first run: it flagged `11-artifact-preview.spec.ts:144`, which is
	// `givenArtifact({ name: 'Deploy de preview' })`, a fixture being SEEDED, not an assertion. (It
	// collided because pt.json genuinely labels `enums.ArtifactKind.LINK` with that same string.)
	// A rail that flags the setup of a test is worse than no rail: it teaches people to ignore it.
	/\bgetByRole\([^)]*\bname:\s*(['"`])([^'"`]+)\1/g,
	// Content assertions, added after a measured MISS. The first version listed only query APIs and
	// went green while `expect(host.textContent).toContain('Anônimo')` (UserProfile/index.test.tsx:73)
	// and `expect(rendered).toContain('Configurações da conversa')` (storybook.spike:55) sat right
	// there. A test does not have to use a query helper to couple itself to copy — asserting the
	// rendered text directly is the same defect wearing different syntax.
	/\b(?:toContain|toContainText|toHaveText|toHaveTextContent|toHaveValue|toHaveAttribute)\([^)]*?(['"`])([^'"`]+)\1/g,
]

interface Violation {
	file: string
	line: number
	literal: string
	key: string
}

function tsFilesDeep(dir: string, suffix: RegExp, prefix = ''): string[] {
	if (!existsSync(dir)) return []
	const out: string[] = []
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const rel = prefix ? `${prefix}/${e.name}` : e.name
		if (e.isDirectory()) out.push(...tsFilesDeep(join(dir, e.name), suffix, rel))
		else if (suffix.test(e.name)) out.push(rel)
	}
	return out
}

function scan(root: string, suffix: RegExp): { violations: Violation[]; scanned: number } {
	const violations: Violation[] = []
	let scanned = 0
	for (const rel of tsFilesDeep(root, suffix)) {
		if (MECHANISM_TESTS.has(rel)) continue
		scanned++
		const source = readFileSync(join(root, rel), 'utf8')
		const lines = source.split('\n')
		lines.forEach((text, i) => {
			// A line that already reads from the catalog is the CURE, not the disease.
			if (/\bt\(/.test(text)) return
			// A test NAME is prose describing the case, not an assertion coupled to copy. Measured:
			// `ProvidersSection/index.test.tsx:89` names the case `… CODEX/OPENCODE "Em breve"`, which
			// is documentation and must not be rewritten into a t() call.
			if (/^\s*(?:it|test|describe)\s*(?:\.\w+)?\s*\(/.test(text)) return
			for (const re of COPY_QUERIES) {
				re.lastIndex = 0
				for (const m of text.matchAll(re)) {
					const literal = m[2] ?? ''
					const key = VALUE_TO_KEY.get(literal)
					if (key) violations.push({ file: rel, line: i + 1, literal, key })
				}
			}
		})
	}
	return { violations, scanned }
}

const report = (v: Violation[]) =>
	v.map(x => `  ${x.file}:${x.line}  asserts the literal ${JSON.stringify(x.literal)}  →  use t('${x.key}')`).join('\n')

const CURE =
	`\n\nThe string is a VALUE in src/locales/pt.json, so the assertion must read it from there:\n` +
	`import { t } from '<rel>/utils/i18n'   // typed against pt.json — a renamed key becomes a tsc error\n` +
	`then assert t('the.key') instead of the literal. See the docblock at the top of this rail.`

describe('i18n-assertions — a test never hardcodes copy that lives in the catalog', () => {
	it('I18N-01: no e2e spec asserts a literal that is a pt.json value', () => {
		const { violations, scanned } = scan(E2E_TESTS, /\.spec\.ts$/)
		expect(scanned, 'scanned ZERO e2e specs — this rail lost its subject, it is not passing').toBeGreaterThan(0)
		expect(violations.length, `Hardcoded UI copy in e2e assertions:\n${report(violations)}${CURE}`).toBe(0)
	})

	it('I18N-02: no react test asserts a literal that is a catalog value', () => {
		// BOTH trees. Scanning only `src/` was this rail's third measured gap — `tests/spikes/` and
		// `tests/architecture/` hold real test files, and `storybook.spike.test.tsx:55` sat there
		// asserting `toContain('Configurações da conversa')` while the rail reported clean.
		const fromSrc = scan(REACT_SRC, /\.test\.tsx?$/)
		const fromTests = scan(REACT_TESTS, /\.test\.tsx?$/)
		const violations = [...fromSrc.violations, ...fromTests.violations]
		const scanned = fromSrc.scanned + fromTests.scanned
		expect(scanned, 'scanned ZERO react tests — this rail lost its subject, it is not passing').toBeGreaterThan(0)
		expect(violations.length, `Hardcoded UI copy in react assertions:\n${report(violations)}${CURE}`).toBe(0)
	})

	it('the catalog index is real (guards the predicate itself, not the corpus)', () => {
		// If pt.json ever failed to load, VALUE_TO_KEY would be empty and BOTH rules above would pass
		// while checking nothing — a green rail with no predicate. This is the falsifier for that.
		expect(VALUE_TO_KEY.size).toBeGreaterThan(100)
		expect(VALUE_TO_KEY.get('Converse com seu código')).toBeDefined()
	})
})
