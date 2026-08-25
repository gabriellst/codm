import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { globalRegistry } from './lib/repo-model'
import { CLASSIFICATION_RULES } from './review'

/**
 * registry-pointers — every pointer declared in `.claude/registry.yaml` must aim at something that
 * exists.
 *
 * Ported from template-fullstack, which took it from codedm (origin `2483d449`). Sibling of
 * `skill-examples.test.ts` (which does this for `examples:` links) and `doc-coherence.test.ts`
 * (which does it for the paths docs name in prose); this one covers the two pointers the taxonomy
 * itself is made of: `skill:` and `patterns:`.
 *
 * The concrete miss it was written for: the `desktop` component declared
 * `packages/app/react/src/lib/native/*.ts` long after that seam had migrated to `src/services/`.
 * The folder did not exist AT ALL, so the pattern matched nothing, so nobody was ever told — a dead
 * pointer costs nothing at runtime and is therefore invisible until a human reads the yaml and
 * believes it. `taxonomy-parity` could not see it either: it compares the component universe
 * against review.ts CLASSIFICATION_RULES, and both sides agreed on the NAME. The falsifier that
 * motivated the file: planting a bogus pattern AND a bogus `skill:` left the tooling suite fully
 * green.
 *
 * THIS REPO WAS THE DOWNSTREAM. On the first run here (2026-08-14) CHECK 2 came back RED with
 * three dead pointers, and one of them was that very `lib/native` — codm's seam had moved to
 * `src/services/`, `scripts/review.ts` already routed it there
 * (`packages/app/react/src/services/.*\.tsx?$` → desktop-shell), and only `.claude/registry.yaml`
 * still named the old folder. The other two: `packages/e2e/support/**` (this repo's e2e helpers
 * live in `packages/e2e/utils/**`, `given/` included) and
 * `packages/api/typescript/src/shared/middlewares/[star].ts` — that last one not merely dead but
 * SUBSUMED, since the line above it (`src/[star]/middlewares/[star].ts`) matches `src/shared/...`
 * anyway (measured: `new Bun.Glob(...).match('…/src/shared/middlewares/X.ts') === true`). All three
 * were repointed or removed in the same commit that added this file.
 *
 * (`[star]` stands for the glob wildcard: written literally, the `*` followed by `/` would CLOSE
 * this block comment — which is exactly how it broke on first run, with `ReferenceError:
 * middlewares is not defined`.)
 *
 * CHECK 1 — every `skill:` (yaml components AND review.ts rules) names a real
 * `.claude/skills/<skill>/SKILL.md`. A pointer with no "not yet" case: the playbook either exists
 * or the reviewer is being sent to a directory that isn't there.
 *
 * CHECK 2 — every positive pattern's ANCHOR DIRECTORY exists. The anchor is the static prefix
 * before the first wildcard segment: a per-context glob like the entity one anchors at
 * `packages/api/typescript/src`. Anchor-existence, not match-count, is the honest discriminator:
 * a repo legitimately declares an artifact family it has no instance of yet, and asserting a count
 * would make the rail a budget instead of a fact. What is NEVER legitimate is naming a directory
 * the tree does not contain — that is the `lib/native` shape, and it is what this check fails on.
 * This registry's own header already states the principle ("a pattern for a directory that does not
 * exist is coverage in name only"); until now nothing enforced it.
 *
 * Negation patterns (`!…`) are filters, not pointers, and are out of scope by construction.
 *
 * CHECK 3 — a warning-only radar listing patterns whose anchor is real but which match zero files:
 * the "declared capability, no instance yet" set, judged by a human, never failed.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SKILLS_DIR = join(ROOT, '.claude', 'skills')

/**
 * Patterns whose anchor directory is deliberately absent, each with a why. An entry here is a
 * DECISION ("the convention is declared, the tree has not formalized it"), not a silencer: the
 * PENDING_ANCHORS check fails the moment the anchor appears, so the exemption cannot outlive its
 * reason. Empty is the goal — the fix for a dead pointer is normally to repoint it.
 */
const PENDING_ANCHORS: { pattern: string; why: string }[] = [
	{
		pattern: 'packages/app/astro/src/components/ui/*.astro',
		why: "the primitive entry's own note declares astro primitives as CONDITIONAL — 'src/components/ui/ if the project chooses to formalize them; otherwise alongside route-scoped components'. This tree has not formalized them (src/components/ holds only the global chrome — Nav/Footer/LocaleSwitcher — since the [locale]/ Option B migration moved BlogCard into its page scope); the pattern documents where they go when it does.",
	},
	{
		pattern: 'packages/app/astro/src/components/ui/*.tsx',
		why: 'same conditional convention as the .astro sibling above — the astro island flavor of a formalized primitive.',
	},
]

const WILDCARD = /[*?[\]{}]/

/** The static prefix of a glob, up to (not including) the first wildcard segment. */
export function anchorOf(pattern: string): string {
	const segments = pattern.split('/')
	const firstWildcard = segments.findIndex(segment => WILDCARD.test(segment))
	return (firstWildcard === -1 ? segments : segments.slice(0, firstWildcard)).join('/')
}

/** Every positive (non-negation) pattern declared by any component, tagged with its component. */
function declaredPatterns(): { component: string; pattern: string }[] {
	const out: { component: string; pattern: string }[] = []
	for (const [component, entry] of Object.entries(globalRegistry().components)) {
		for (const pattern of entry.patterns ?? []) {
			if (pattern.startsWith('!')) continue
			out.push({ component, pattern })
		}
	}
	return out
}

/** True when the pattern's anchor resolves: a directory for globs, the file itself when literal. */
export function anchorResolves(pattern: string, root: string): boolean {
	const anchor = anchorOf(pattern)
	if (anchor === '') return true // repo-root-relative glob — nothing to resolve
	const full = join(root, anchor)
	if (!existsSync(full)) return false
	return WILDCARD.test(pattern) ? statSync(full).isDirectory() : true
}

const matchCount = (pattern: string, root: string): number => [...new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true })].length

describe('registry-pointers (.claude/registry.yaml pointers resolve)', () => {
	test('every `skill:` names a real .claude/skills/<skill>/SKILL.md', () => {
		const fromYaml = Object.entries(globalRegistry().components).map(([component, entry]) => ({
			where: `components.${component}`,
			skill: entry.skill,
		}))
		const fromRules = [...new Set(CLASSIFICATION_RULES.map(rule => rule.skill))].map(skill => ({
			where: `review.ts CLASSIFICATION_RULES`,
			skill,
		}))

		const dead = [...fromYaml, ...fromRules].filter(ref => ref.skill === undefined || !existsSync(join(SKILLS_DIR, ref.skill, 'SKILL.md')))
		expect(
			dead.map(ref => `${ref.where} → .claude/skills/${ref.skill ?? '<none>'}/SKILL.md`),
			'A declared skill has no playbook on disk — review sends the agent to a directory that is not there. ' +
				'Renaming a skill means renaming it in .claude/registry.yaml AND scripts/review.ts in the same change.',
		).toEqual([])
	})

	test('every pattern anchors at a directory this repo actually has', () => {
		const pending = new Set(PENDING_ANCHORS.map(entry => entry.pattern))
		const dead = declaredPatterns()
			.filter(({ pattern }) => !pending.has(pattern) && !anchorResolves(pattern, ROOT))
			.map(({ component, pattern }) => `${component}: ${pattern}  (anchor "${anchorOf(pattern)}" does not exist)`)

		expect(
			dead,
			'Pattern(s) anchored at a directory this tree does not contain — a dead pointer matches nothing, ' +
				'warns nobody, and quietly teaches every reader a layout the repo abandoned. Repoint it at the ' +
				'real location, or declare it in PENDING_ANCHORS (scripts/registry-pointers.test.ts) with a why.',
		).toEqual([])
	})

	test('PENDING_ANCHORS entries are alive (declared pattern, still-absent anchor)', () => {
		const declared = new Set(declaredPatterns().map(({ pattern }) => pattern))
		const fossil = PENDING_ANCHORS.filter(entry => !declared.has(entry.pattern) || anchorResolves(entry.pattern, ROOT)).map(
			entry => entry.pattern,
		)
		expect(
			fossil,
			'Fossil PENDING_ANCHORS entry — the pattern was removed from the registry, or its anchor now EXISTS ' +
				'(the tree formalized the convention). Drop the exemption so the pattern is gated like every other.',
		).toEqual([])
	})

	// r8-5: `expect(Array.isArray(empty)).toBe(true)` used to close this test — a tautology, since
	// `.filter(...)` can never return anything BUT an array. Molde: the context-map liveness ratchet
	// (packages/api/typescript/tests/architecture/context-map.test.ts, `unused.length`) and the
	// error-coherence measure (same dir, `warnings.length`) — both turn a "warning only" list into a
	// COUNT ratchet instead of a vacuous assertion. THE NUMBER IS PER-REPO: the template carries 13,
	// and copying that here would have made this test fail on arrival for a reason that has nothing
	// to do with codm. Measured at 8 in this tree on 2026-08-14, and the 8 are named in the failure
	// message below. Kept as a
	// count (not `toEqual([...])` of the full content) because the set is expected to shrink
	// piecemeal as individual artifact families get their first instance — a content-diff would churn
	// on every such change, while the count still catches growth AND shrinkage.
	test('patterns with a real anchor but zero matches are listed as a warning, never a failure', () => {
		const empty = declaredPatterns().filter(({ pattern }) => anchorResolves(pattern, ROOT) && matchCount(pattern, ROOT) === 0)
		if (empty.length > 0) {
			console.warn(
				`[registry-pointers] ${empty.length} pattern(s) match no file today — declared artifact families ` +
					`this tree has no instance of yet (that is legitimate; the anchor is real). Cleanup radar, not a gate:\n` +
					empty.map(({ component, pattern }) => `  ${component}: ${pattern}`).join('\n'),
			)
		}
		expect(
			empty.length,
			`empty.length is the ratchet over the "warning only" tolerance (idiom: context-map.test.ts's ` +
				`unused.length / error-coherence.test.ts's warnings.length) — the declared-but-uninstantiated ` +
				`pattern set stays MEASURED, not gated, but the number may not drift silently: grow it (a new ` +
				`declared pattern has no instance yet) by editing this number in the SAME diff; shrink it (a ` +
				`family got its first instance) by lowering this number too:\n` +
				empty.map(({ component, pattern }) => `  ${component}: ${pattern}`).join('\n'),
		).toBe(8)
	})

	// Negative fixture — proves the anchor check catches an offender against a REAL temp tree, so it
	// cannot pass merely because the registry happens to be clean (molde: doc-coherence / skill-examples).
	test('fixture: a pattern naming a non-existent folder is flagged; a real-but-empty one is not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'registry-pointers-fixture-'))
		try {
			mkdirSync(join(tmpRoot, 'src', 'services'), { recursive: true })
			writeFileSync(join(tmpRoot, 'src', 'services', 'BadgeService.ts'), 'export {}\n')
			mkdirSync(join(tmpRoot, 'src', 'jobs'), { recursive: true }) // real folder, no instance yet

			// The exact shape of the bug: the seam moved from lib/native to services, the pointer did not.
			expect(anchorResolves('src/lib/native/*.ts', tmpRoot)).toBe(false)
			expect(anchorOf('src/lib/native/*.ts')).toBe('src/lib/native')

			// Live anchors stay green — including the declared-but-empty family the radar merely warns about.
			expect(anchorResolves('src/services/**/*.ts', tmpRoot)).toBe(true)
			expect(anchorResolves('src/jobs/*.ts', tmpRoot)).toBe(true)
			expect(matchCount('src/jobs/*.ts', tmpRoot)).toBe(0)
			expect(matchCount('src/services/**/*.ts', tmpRoot)).toBe(1)
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
