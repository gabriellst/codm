import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'

/**
 * Skill→example liveness gate (F2.3) — the mechanical half of the "skills reference living
 * exemplars" convention. A skill registry.yaml may declare an `examples:` list under its root
 * `registry:` key: repo-relative paths (from the repo root) into `examples/**` — the harvested
 * Tier-3 exemplars carrying `CONTEXT-ORIGIN` provenance headers. Review agents and humans follow
 * these links to a REAL instance of the citizen instead of a frozen inline snippet (HD-14).
 *
 * A dead link is worse than no link: it teaches the reader to distrust every `examples:` field
 * and silently reverts the skill to snippet-only guidance. Exemplars are re-harvested (never
 * edited in place — see examples/citizens/go/README.md), so renames/moves happen; this gate turns each
 * one into a named failure at the exact registry that needs updating.
 *
 * Scope: every file named `registry.yaml` under `.claude/skills/` (flat roots AND per-lang
 * variants — the filesystem decides, mirroring resolveRegistryPath in scripts/review.ts).
 * Yaml is loaded via the `yaml` package, same as scripts/lib/repo-model.ts — no regex parsing.
 *
 * Contract for each entry (violations carry the reason):
 *   - must be a string (a yaml scalar, not a nested map/list)
 *   - must be repo-relative: no absolute paths, no `..` traversal — the link must survive clones
 *   - must exist on disk at <repo root>/<entry>
 *
 * Lives in `scripts/` — the shared home for the taxonomy/tooling gates (taxonomy-parity,
 * review-plan) that guard the skill registry machinery itself, not product code.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SKILLS_ROOT = join(ROOT, '.claude', 'skills')

interface Violation {
	/** registry.yaml path, relative to the scanned skills root */
	registry: string
	/** the offending `examples:` entry as written (stringified for non-strings) */
	entry: string
	reason: string
}

function listRegistryFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules') continue
			out.push(...listRegistryFiles(full))
		} else if (entry.name === 'registry.yaml') {
			out.push(full)
		}
	}
	return out
}

/** Scans every registry.yaml under `skillsRoot` and validates its `registry.examples` list:
 *  each entry must be a string, repo-relative, and resolve to an existing path under `repoRoot`.
 *  Registries without an `examples:` field are fine — the field is opt-in per skill. */
function scanExampleLinks(skillsRoot: string, repoRoot: string): Violation[] {
	const violations: Violation[] = []

	for (const file of listRegistryFiles(skillsRoot)) {
		const registry = relative(skillsRoot, file).split('\\').join('/')

		let doc: unknown
		try {
			doc = parseYaml(readFileSync(file, 'utf8'))
		} catch (error) {
			violations.push({ registry, entry: '<file>', reason: `registry.yaml failed to parse as YAML: ${error}` })
			continue
		}

		const examples = (doc as { registry?: { examples?: unknown } } | null)?.registry?.examples
		if (examples === undefined || examples === null) continue

		if (!Array.isArray(examples)) {
			violations.push({
				registry,
				entry: JSON.stringify(examples),
				reason: '`examples:` must be a YAML list of repo-relative paths',
			})
			continue
		}

		for (const entry of examples) {
			if (typeof entry !== 'string') {
				violations.push({ registry, entry: JSON.stringify(entry), reason: 'entry must be a plain string path' })
				continue
			}
			if (isAbsolute(entry) || entry.split('/').includes('..')) {
				violations.push({ registry, entry, reason: 'entry must be repo-relative (no absolute paths, no `..`)' })
				continue
			}
			if (!existsSync(join(repoRoot, entry))) {
				violations.push({ registry, entry, reason: 'dead link — path does not exist on disk' })
			}
		}
	}

	return violations
}

describe('skill-examples (every `examples:` link in .claude/skills/**/registry.yaml is alive)', () => {
	test('every examples: entry is a repo-relative path that exists on disk', () => {
		const violations = scanExampleLinks(SKILLS_ROOT, ROOT)

		const report = violations.map(v => `  .claude/skills/${v.registry}  →  ${v.entry}\n      ${v.reason}`).join('\n')
		expect(
			violations.length,
			`Dead or malformed skill→example link(s). Each \`examples:\` entry points a skill at a REAL ` +
				`harvested exemplar (repo-relative, under examples/**, with a CONTEXT-ORIGIN header). If the ` +
				`exemplar moved or was re-harvested, update the path here; if it is gone, re-harvest it ` +
				`(exemplars are never edited in place — see examples/citizens/go/README.md). Do NOT delete the ` +
				`examples: field just to silence this gate — the link is the skill's living reference:\n${report}`,
		).toBe(0)
	})

	// Negative fixture — proves the scan actually catches a dead link, using a real temp tree
	// (molde console-discipline.test.ts) so this can't accidentally pass just because every link
	// in the real repo happens to be alive.
	test('fixture: a dead examples: path is flagged; a live path and a registry without examples are not', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'skill-examples-fixture-'))
		try {
			const skillsRoot = join(tmpRoot, '.claude', 'skills')
			const offenderDir = join(skillsRoot, 'entity', 'go')
			const controlDir = join(skillsRoot, 'enum', 'go')
			const exemplarDir = join(tmpRoot, 'examples', 'citizens', 'go', 'entity')
			mkdirSync(offenderDir, { recursive: true })
			mkdirSync(controlDir, { recursive: true })
			mkdirSync(exemplarDir, { recursive: true })

			// A live exemplar on disk — linking it must NOT be flagged.
			writeFileSync(join(exemplarDir, 'channel.go'), 'package entities\n')

			// Offender — one live link, one dead link (ghost.go was never harvested), one absolute path.
			writeFileSync(
				join(offenderDir, 'registry.yaml'),
				[
					'registry:',
					'  type: backend',
					'  lang: go',
					'  examples:',
					'    - examples/citizens/go/entity/channel.go',
					'    - examples/citizens/go/entity/ghost.go',
					`    - ${join(tmpRoot, 'examples/citizens/go/entity/channel.go')}`,
					'',
				].join('\n'),
			)

			// Control — no examples: field at all. Must NOT be flagged (the field is opt-in).
			writeFileSync(join(controlDir, 'registry.yaml'), 'registry:\n  type: backend\n  lang: go\n')

			const violations = scanExampleLinks(skillsRoot, tmpRoot)

			expect(violations.map(v => `${v.registry} ${v.entry}`).sort()).toEqual([
				`entity/go/registry.yaml ${join(tmpRoot, 'examples/citizens/go/entity/channel.go')}`,
				'entity/go/registry.yaml examples/citizens/go/entity/ghost.go',
			])
			expect(violations.find(v => v.entry === 'examples/citizens/go/entity/ghost.go')?.reason).toContain('dead link')
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})
