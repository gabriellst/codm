/**
 * Atlas drift guard — every `owner:` anchor in .claude/atlas/axes.yaml must resolve to
 * something real. A renamed pattern id / moved file otherwise dangles silently and the
 * routing table starts lying (the exact drift failure the atlas exists to prevent).
 *
 * Owner grammar: `<skill>#<anchor>` where
 *   skill  = a .claude/skills/<skill> dir, or the specials `registry` (.claude/registry.yaml),
 *            `app-react` (packages/app/react), `form-react` (.claude/skills/form/react)
 *   anchor = a pattern/bp id (`id: <anchor>` greppable in the skill's registry.yaml files),
 *            a variant dir (`typescript`, `react`), a file (`CLAUDE.md`),
 *            a registry top-level key (`components`), or a SKILL.md heading slug
 *            (`layer-union-table` → "Layer → Error-Union Table").
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..')
const SKILLS = join(ROOT, '.claude', 'skills')

interface Axis {
	id: string
	owner: string
	rung: string
}

function registryFilesOf(skillDir: string): string[] {
	const out: string[] = []
	const walk = (dir: string) => {
		for (const e of readdirSync(dir)) {
			const p = join(dir, e)
			if (statSync(p).isDirectory()) walk(p)
			else if (e === 'registry.yaml') out.push(p)
		}
	}
	if (existsSync(skillDir)) walk(skillDir)
	return out
}

function anchorIdExists(files: string[], anchor: string): boolean {
	return files.some(f => new RegExp(`^\\s+-? ?id: ${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(readFileSync(f, 'utf8')))
}

function resolveOwner(owner: string): string | null {
	const [skill, anchor] = owner.split('#')
	if (!skill || !anchor) return `malformed owner '${owner}'`

	if (skill === 'registry') {
		const text = readFileSync(join(ROOT, '.claude', 'registry.yaml'), 'utf8')
		if (anchor === 'components') return /^components:/m.test(text) ? null : `no 'components:' key`
		return new RegExp(`^\\s+- id: ${anchor}\\s*$`, 'm').test(text) ? null : `id '${anchor}' not in .claude/registry.yaml`
	}
	if (skill === 'app-react') {
		return existsSync(join(ROOT, 'packages', 'app', 'react', anchor)) ? null : `packages/app/react/${anchor} missing`
	}
	const skillDir = skill === 'form-react' ? join(SKILLS, 'form', 'react') : join(SKILLS, skill)
	if (!existsSync(skillDir)) return `skill dir '${skill}' missing`

	// Variant-dir anchor (typescript / react / go …)
	if (existsSync(join(skillDir, anchor)) && statSync(join(skillDir, anchor)).isDirectory()) return null
	// Heading-slug anchor: slug words must all appear in some SKILL.md heading of the skill
	if (/^[a-z][a-z-]*$/.test(anchor)) {
		const words = anchor.split('-')
		const mds: string[] = []
		const walk = (dir: string) => {
			for (const e of readdirSync(dir)) {
				const p = join(dir, e)
				if (statSync(p).isDirectory()) walk(p)
				else if (e === 'SKILL.md') mds.push(p)
			}
		}
		walk(skillDir)
		const found = mds.some(f =>
			readFileSync(f, 'utf8')
				.split('\n')
				.some(l => l.startsWith('#') && words.every(w => l.toLowerCase().includes(w))),
		)
		if (found) return null
	}
	// Pattern/bp id anchor
	if (anchorIdExists(registryFilesOf(skillDir), anchor)) return null
	return `anchor '${anchor}' not found under skill '${skill}'`
}

describe('atlas anchors', () => {
	const doc = parse(readFileSync(join(ROOT, '.claude', 'atlas', 'axes.yaml'), 'utf8')) as { axes: Axis[] }

	test('axes.yaml parses and has axes', () => {
		expect(Array.isArray(doc.axes)).toBe(true)
		expect(doc.axes.length).toBeGreaterThan(20)
	})

	test('every owner anchor resolves', () => {
		const failures = doc.axes.map(a => ({ id: a.id, err: resolveOwner(a.owner) })).filter(r => r.err)
		expect(failures).toEqual([])
	})

	test('every rung is a known ladder level', () => {
		const levels = new Set(['type', 'scaffold', 'detector', 'docs'])
		expect(doc.axes.filter(a => !levels.has(a.rung)).map(a => a.id)).toEqual([])
	})
})
