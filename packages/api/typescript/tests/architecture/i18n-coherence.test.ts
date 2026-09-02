import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

/**
 * i18n-coherence guard — the mechanical half of the "one catalogue, two locales, no dangling keys"
 * convention for the React app (`packages/app/react`). Compile-time key validation was deliberately
 * dropped there (`src/@types/i18next.d.ts`: the `typeof pt` augmentation blew TypeScript's
 * instantiation depth past ~600 keys), so `t()` accepts ANY string and a missing key renders as the
 * raw key at runtime — invisible to `tsc`, caught only here (rung 2 of the ladder in this folder's
 * README; rung 1 returns when the catalogue is split into typed namespaces).
 *
 * Three checks (molde `console-discipline.test.ts`: mechanical scan + teaching failure + negative
 * fixture in a temp dir):
 *
 *   (a) STRUCTURE PARITY — `locales/pt.json` and `locales/en.json` expose the SAME recursive key
 *       set (compared as dot-joined leaf paths, so an object-on-one-side/string-on-the-other
 *       divergence is caught too). Missing keys are reported per side.
 *   (b) REFERENCES RESOLVE — every i18n key referenced from `src/` with a LITERAL string —
 *       `t('key')` / `t("key")` / `t(`key`)` without `${`, and `i18nPrefix="key"` (the enum-mode
 *       contract of select/combobox/toggle-group, which render `t(`${i18nPrefix}.${value}`)`, so
 *       the PREFIX NODE must exist as an object) — resolves in `pt.json` (the `fallbackLng`; (a)
 *       makes en equivalent). Dynamic keys (`t(`...${x}`)`, `t(variable)`) are out of scope by
 *       construction. The scan models real i18next resolution, not just bare lookup:
 *         - plural families: `t('x.count')` resolves via `x.count_one` / `x.count_other` / any CLDR
 *           plural-category suffix;
 *         - keyPrefix-bound `t`: a file that binds `getFixedT(lang, 'translation', '<prefix>')` or
 *           `useTranslation(..., { keyPrefix: '<prefix>' })` (e.g. `lib/zod-config.ts` binds `zod`)
 *           has its literal keys accepted when they resolve bare OR under a prefix declared in that
 *           file. File-scoped approximation — documented, and proven non-over-accepting by the
 *           fixture (a key resolving under NO binding is still flagged).
 *   (c) UNREFERENCED LEAVES — leaf keys no literal reference (nor referenced-prefix subtree, nor
 *       plural base) touches are WARNED, never failed: dynamically-referenced families (error codes
 *       via `t(code)` in `lib/errors.ts`, zod bundle reads) land here by construction, so this list
 *       is a cleanup radar, not a gate.
 *
 * False positives on (b) are fixed by modeling the i18next semantics the scan missed (as keyPrefix
 * was) or by a named EXEMPTIONS entry with a `why` — never by weakening the regexes (README: a
 * weakened detector is a hole every future file falls through).
 */

const APP_REACT_SRC = join(import.meta.dir, '..', '..', '..', '..', 'app', 'react', 'src')
const LOCALES_DIR = join(APP_REACT_SRC, 'locales')

/** Files (relative to the scanned src root) exempt from check (b), each with a why. Empty today. */
const EXEMPTIONS: { file: string; why: string }[] = []

type LocaleNode = { [key: string]: LocaleNode | string }

/** CLDR plural categories i18next appends as `_<category>` leaf suffixes. */
const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const
const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/

// Literal-key reference shapes. `(['"`])((?:(?!\1).)*?)\1` = any quote style, non-greedy, matching
// closer; keys containing `${` (template interpolation) are discarded by the caller as dynamic.
const T_CALL_RE = /\bt\(\s*(['"`])((?:(?!\1).)*?)\1/g
const I18N_PREFIX_RE = /i18nPrefix\s*[=:]\s*\{?\s*(['"`])((?:(?!\1).)*?)\1/g
// keyPrefix bindings: getFixedT's third argument / useTranslation's keyPrefix option.
const GET_FIXED_T_PREFIX_RE = /getFixedT\([^)]*?,\s*['"`]translation['"`]\s*,\s*(['"`])((?:(?!\1).)*?)\1/g
const KEY_PREFIX_OPTION_RE = /keyPrefix:\s*(['"`])((?:(?!\1).)*?)\1/g

interface I18nReference {
	/** Path relative to the scanned src root. */
	file: string
	line: number
	/** `t` = literal t() call (must resolve to a translatable leaf); `prefix` = i18nPrefix (must resolve to an object node). */
	kind: 't' | 'prefix'
	key: string
	/** keyPrefix bindings declared anywhere in the same file. */
	filePrefixes: readonly string[]
}

function readLocale(path: string): LocaleNode {
	return JSON.parse(readFileSync(path, 'utf8')) as LocaleNode
}

/** All dot-joined paths whose value is NOT a nested object — the structural fingerprint of a catalogue. */
function collectLeafKeys(node: LocaleNode, prefix = ''): string[] {
	const out: string[] = []
	for (const [key, value] of Object.entries(node)) {
		const path = prefix === '' ? key : `${prefix}.${key}`
		if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
			out.push(...collectLeafKeys(value, path))
		} else {
			out.push(path)
		}
	}
	return out
}

function resolveNode(catalogue: LocaleNode, key: string): LocaleNode | string | undefined {
	let node: LocaleNode | string | undefined = catalogue
	for (const part of key.split('.')) {
		if (typeof node !== 'object' || node === null) return undefined
		node = node[part]
	}
	return node
}

/** A `t()` key is translatable when it is a string leaf or has a plural-suffixed sibling family. */
function translatableKeyExists(catalogue: LocaleNode, key: string): boolean {
	if (typeof resolveNode(catalogue, key) === 'string') return true
	const lastDot = key.lastIndexOf('.')
	const parentKey = lastDot === -1 ? '' : key.slice(0, lastDot)
	const lastSegment = lastDot === -1 ? key : key.slice(lastDot + 1)
	const parent = parentKey === '' ? catalogue : resolveNode(catalogue, parentKey)
	if (typeof parent !== 'object' || parent === null) return false
	return PLURAL_CATEGORIES.some(category => typeof parent[`${lastSegment}_${category}`] === 'string')
}

function listSourceFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules') continue
			out.push(...listSourceFiles(full))
		} else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
			out.push(full)
		}
	}
	return out
}

const lineOfIndex = (content: string, index: number): number => content.slice(0, index).split('\n').length

/** Extracts every literal-key i18n reference (t() calls + i18nPrefix attributes) under `srcRoot`,
 *  tagging each with the keyPrefix bindings its file declares. Dynamic keys (`${`) are skipped. */
function scanReferences(srcRoot: string): I18nReference[] {
	const references: I18nReference[] = []
	for (const file of listSourceFiles(srcRoot)) {
		const rel = relative(srcRoot, file).split('\\').join('/')
		const content = readFileSync(file, 'utf8')
		const filePrefixes = [...content.matchAll(GET_FIXED_T_PREFIX_RE), ...content.matchAll(KEY_PREFIX_OPTION_RE)]
			.map(m => m[2] as string)
			.filter(prefix => !prefix.includes('${'))
		for (const { re, kind } of [
			{ re: T_CALL_RE, kind: 't' as const },
			{ re: I18N_PREFIX_RE, kind: 'prefix' as const },
		]) {
			for (const match of content.matchAll(re)) {
				const key = match[2] as string
				if (key.includes('${')) continue
				references.push({ file: rel, line: lineOfIndex(content, match.index ?? 0), kind, key, filePrefixes })
			}
		}
	}
	return references
}

/** Check (b): references whose key resolves neither bare nor under any of the file's keyPrefix bindings. */
function findDanglingReferences(catalogue: LocaleNode, references: I18nReference[]): I18nReference[] {
	const exemptFiles = new Set(EXEMPTIONS.map(e => e.file))
	return references.filter(ref => {
		if (exemptFiles.has(ref.file)) return false
		if (ref.kind === 'prefix') {
			const node = resolveNode(catalogue, ref.key)
			return !(typeof node === 'object' && node !== null)
		}
		if (translatableKeyExists(catalogue, ref.key)) return false
		return !ref.filePrefixes.some(prefix => translatableKeyExists(catalogue, `${prefix}.${ref.key}`))
	})
}

/** Check (c): leaves no literal reference resolves to — directly, as a plural base, or under a referenced prefix node. */
function findUnreferencedLeaves(catalogue: LocaleNode, references: I18nReference[]): string[] {
	const used = new Set<string>()
	const prefixNodes: string[] = []
	for (const ref of references) {
		if (ref.kind === 'prefix') {
			prefixNodes.push(ref.key)
			continue
		}
		if (translatableKeyExists(catalogue, ref.key)) used.add(ref.key)
		for (const prefix of ref.filePrefixes) {
			if (translatableKeyExists(catalogue, `${prefix}.${ref.key}`)) used.add(`${prefix}.${ref.key}`)
		}
	}
	return collectLeafKeys(catalogue).filter(leaf => {
		if (used.has(leaf) || used.has(leaf.replace(PLURAL_SUFFIX_RE, ''))) return false
		return !prefixNodes.some(prefix => leaf.startsWith(`${prefix}.`))
	})
}

describe('i18n-coherence (pt/en parity, literal references resolve, unused keys warned)', () => {
	test('(a) locales/pt.json and locales/en.json expose the same recursive key set', () => {
		const ptLeaves = new Set(collectLeafKeys(readLocale(join(LOCALES_DIR, 'pt.json'))))
		const enLeaves = new Set(collectLeafKeys(readLocale(join(LOCALES_DIR, 'en.json'))))
		const missingInEn = [...ptLeaves].filter(k => !enLeaves.has(k)).sort()
		const missingInPt = [...enLeaves].filter(k => !ptLeaves.has(k)).sort()

		const report = [
			...missingInEn.map(k => `  missing in en.json (present in pt.json): ${k}`),
			...missingInPt.map(k => `  missing in pt.json (present in en.json): ${k}`),
		].join('\n')
		expect(
			missingInEn.length + missingInPt.length,
			`Locale catalogues diverged — every key added to one of packages/app/react/src/locales/{pt,en}.json ` +
				`must be added to BOTH in the same change (same nesting; a node that is an object on one side and a ` +
				`string on the other counts as divergence). Add the missing side, never delete the present one to ` +
				`silence this rail:\n${report}`,
		).toBe(0)
	})

	// A WHOLE-TREE WALK, and 5s is bun's default for a UNIT test rather than a budget anyone chose
	// for one. This reads every source file under the scan roots (~4.7k tracked files), which costs
	// 3-6s on its own and crosses the default under full-suite load — measured on Windows, where
	// filesystem walks are slowest, and reported as an ordinary red with no mention of time. Same
	// shape as `concurrent-boot`'s 180_000 and the cross-service spike's boot hook: the cost is a
	// property of the repo's size, so the budget is declared instead of inherited.
	test('(b) every literal t()/i18nPrefix key referenced in src resolves in pt.json', () => {
		const catalogue = readLocale(join(LOCALES_DIR, 'pt.json'))
		const dangling = findDanglingReferences(catalogue, scanReferences(APP_REACT_SRC))

		const report = dangling
			.map(v => `  ${v.file}:${v.line}  →  ${v.kind === 'prefix' ? `i18nPrefix="${v.key}" (no such object node)` : `t('${v.key}')`}`)
			.join('\n')
		expect(
			dangling.length,
			`Dangling i18n reference(s) — at runtime these render the RAW KEY instead of a translation (tsc ` +
				`cannot catch this: typed keys are disabled, see src/@types/i18next.d.ts). Fix the reference to an ` +
				`existing key, or add the key to BOTH pt.json and en.json (check (a) holds them in parity). An ` +
				`i18nPrefix must name an OBJECT node whose children are the enum values. Never silence by weakening ` +
				`the scan — model the missed i18next semantics or add a named EXEMPTIONS entry with a why:\n${report}`,
		).toBe(0)
	}, 60_000)

	test('(c) pt.json leaves referenced nowhere in src are listed as a warning, never a failure', () => {
		const catalogue = readLocale(join(LOCALES_DIR, 'pt.json'))
		const unused = findUnreferencedLeaves(catalogue, scanReferences(APP_REACT_SRC))

		if (unused.length > 0) {
			console.warn(
				`[i18n-coherence] ${unused.length} pt.json leaf key(s) have no literal reference in ` +
					`packages/app/react/src — candidates for cleanup. Dynamically-referenced families ` +
					`(t(\`...\${x}\`), t(code) — e.g. errors.* via lib/errors.ts) appear here by construction; ` +
					`judge before deleting:\n${unused.map(k => `  ${k}`).join('\n')}`,
			)
		}
		expect(Array.isArray(unused)).toBe(true)
	})

	// Negative fixtures — prove the scans actually catch offenders, using a real temp directory (not
	// the repo tree, molde console-discipline.test.ts) so they can't pass just because the real tree
	// happens to be clean.
	test('fixture (a): a structural pt/en divergence is reported per side, including object-vs-string', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'i18n-coherence-fixture-'))
		try {
			const pt: LocaleNode = { a: { title: 'Título', onlyPt: 'Só em pt' }, c: { deep: { x: '1' } } }
			const en: LocaleNode = { a: { title: 'Title' }, b: { onlyEn: 'Only in en' }, c: { deep: 'flattened' } }
			const ptLeaves = new Set(collectLeafKeys(pt))
			const enLeaves = new Set(collectLeafKeys(en))

			expect([...ptLeaves].filter(k => !enLeaves.has(k)).sort()).toEqual(['a.onlyPt', 'c.deep.x'])
			expect([...enLeaves].filter(k => !ptLeaves.has(k)).sort()).toEqual(['b.onlyEn', 'c.deep'])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})

	test('fixture (b): dangling t() and i18nPrefix are flagged; existing, plural, keyPrefix-bound and dynamic keys are not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'i18n-coherence-fixture-'))
		try {
			const routesDir = join(tmpRoot, 'routes')
			const libDir = join(tmpRoot, 'lib')
			mkdirSync(routesDir, { recursive: true })
			mkdirSync(libDir, { recursive: true })

			const catalogue: LocaleNode = {
				a: { title: 'Título' },
				n: { count_one: '{{count}} item', count_other: '{{count}} itens' },
				zod: { required: 'Obrigatório' },
				enums: { Language: { 'pt-BR': 'Português (Brasil)' } },
			}

			// Offender + controls: one dangling t() key and one dangling i18nPrefix node, next to an
			// existing key, a plural base, a dynamic template key, and a variable key (both skipped).
			writeFileSync(
				join(routesDir, 'page.tsx'),
				`export function Page() {\n` +
					`\tconst kind: string = 'x'\n` +
					`\tconst variableKey: string = 'a.title'\n` +
					`\treturn (\n` +
					`\t\t<div>\n` +
					`\t\t\t<span>{t('a.title')}</span>\n` +
					`\t\t\t<span>{t('a.missing')}</span>\n` +
					`\t\t\t<span>{t(\`dyn.\${kind}\`)}</span>\n` +
					`\t\t\t<span>{t(variableKey)}</span>\n` +
					`\t\t\t<span>{t('n.count', { count: 2 })}</span>\n` +
					`\t\t\t<Select i18nPrefix="enums.Language" />\n` +
					`\t\t\t<Select i18nPrefix="enums.Missing" />\n` +
					`\t\t</div>\n` +
					`\t)\n` +
					`}\n`,
			)

			// keyPrefix-bound file: 'required' resolves under the declared 'zod' binding (not flagged);
			// 'nope' resolves under NO binding (flagged) — the prefix modeling does not over-accept.
			writeFileSync(
				join(libDir, 'zod-map.ts'),
				`const t = i18n.getFixedT(i18n.language, 'translation', 'zod')\n` +
					`export const ok = t('required')\n` +
					`export const broken = t('nope')\n`,
			)

			const dangling = findDanglingReferences(catalogue, scanReferences(tmpRoot))

			expect(dangling.map(v => `${v.file} ${v.kind} ${v.key}`).sort()).toEqual([
				'lib/zod-map.ts t nope',
				'routes/page.tsx prefix enums.Missing',
				'routes/page.tsx t a.missing',
			])
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})

/**
 * (d) ENUM LABEL COVERAGE — D5, the half the three checks above structurally cannot see.
 *
 * `enumLabel('ThreadStatus', v)` reads `enums.ThreadStatus[v]` out of the bundle at runtime and
 * silently FALLS BACK TO THE RAW VALUE when the key is absent — so a missing translation does not
 * dangle (check (b) never sees a literal key), does not diverge (check (a) is happy while both
 * catalogues omit it equally), and does not even look wrong in review. It shows up only in the
 * product, as `NEEDS_ATTENTION` sitting in a Portuguese sentence — which is exactly the founder's
 * report, and exactly why spot-fixing the two they happened to notice would not have been a sweep.
 *
 * The enum's VALUES come from the generated SDK, i.e. the same source the components render from,
 * so adding a member to a contract enum fails here until both catalogues learn the word.
 */
const SDK_TYPES_DIR = join(APP_REACT_SRC, '..', '..', '..', 'client', 'dist', 'typescript', 'src', 'typescript', 'types')

/** Enum names the console asks `enumLabel` for — excluding the helper's own tests and JSDoc. */
function renderedEnumNames(srcRoot: string): string[] {
	const names = new Set<string>()
	for (const file of listSourceFiles(srcRoot)) {
		if (relative(srcRoot, file).split('\\').join('/').startsWith('lib/enums')) continue
		for (const match of readFileSync(file, 'utf8').matchAll(/enumLabel\(\s*'([A-Za-z0-9_]+)'/g)) names.add(match[1] as string)
	}
	return [...names].sort()
}

/** The members of a generated SDK enum object, or `[]` when no such enum is generated. */
function sdkEnumValues(name: string): string[] {
	const pattern = new RegExp(`export const ${name}(?:Enum)?\\s*=\\s*\\{([^}]*)\\}`, 'g')
	const values = new Set<string>()
	for (const file of readdirSync(SDK_TYPES_DIR)) {
		if (!file.endsWith('.ts')) continue
		for (const block of readFileSync(join(SDK_TYPES_DIR, file), 'utf8').matchAll(pattern)) {
			for (const value of (block[1] as string).matchAll(/"([A-Za-z0-9_]+)"/g)) values.add(value[1] as string)
		}
	}
	return [...values]
}

describe('i18n-coherence — enum labels (D5)', () => {
	test('(d) every enum the console renders has EVERY value translated in both catalogues', () => {
		const pt = (readLocale(join(LOCALES_DIR, 'pt.json')) as { enums?: Record<string, Record<string, string>> }).enums ?? {}
		const en = (readLocale(join(LOCALES_DIR, 'en.json')) as { enums?: Record<string, Record<string, string>> }).enums ?? {}

		const gaps: string[] = []
		let checked = 0
		for (const name of renderedEnumNames(APP_REACT_SRC)) {
			const values = sdkEnumValues(name)
			// No generated enum by that name — a doc example or a UI-local set, not a contract enum.
			if (values.length === 0) continue
			checked++
			for (const value of values) {
				if (!pt[name]?.[value]) gaps.push(`  pt.json  enums.${name}.${value}`)
				if (!en[name]?.[value]) gaps.push(`  en.json  enums.${name}.${value}`)
			}
		}

		// Guards the guard: if the scan stops finding enums (a rename of `enumLabel`, a moved SDK
		// output dir), this rail would pass vacuously while covering nothing.
		expect(checked, 'enum-label scan matched NO contract enums — the scan broke, it did not pass').toBeGreaterThan(5)
		expect(
			gaps.length,
			`Enum value(s) with no label — \`enumLabel\` falls back to the RAW VALUE, so these render as ` +
				`e.g. "NEEDS_ATTENTION" inside a translated sentence and no other rail can see it. Add the key to ` +
				`BOTH catalogues under \`enums.<Enum>.<VALUE>\`:\n${gaps.join('\n')}`,
		).toBe(0)
	})
})
