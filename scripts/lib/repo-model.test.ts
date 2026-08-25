import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO } from '../../template.config'

/**
 * Workspace-contract liveness — REPO.workspaces is the first-class table every tool derives from
 * (detectLang, create-template stamping, env consumers, generated-roots). A declaration that
 * drifted from the filesystem poisons every consumer at once, so each field is gated against the
 * reality it names: pkgRoot/srcRoot must exist, nxProject must equal the project.json `name`
 * (null must mean NO project.json), aliases must stay unique (they are selection tokens).
 */

const ROOT = resolve(import.meta.dirname, '..', '..')
const entries = Object.entries(REPO.workspaces)

describe('repo-model workspace contract (template.config.ts ⇔ filesystem)', () => {
	test('every workspace pkgRoot and srcRoot exists on disk', () => {
		const missing = entries.flatMap(([id, w]) => [w.pkgRoot, w.srcRoot].filter(p => !existsSync(resolve(ROOT, p))).map(p => `${id}: ${p}`))
		expect(missing, 'Workspace root declared in template.config.ts does not exist — fix the declaration or the tree.').toEqual([])
	})

	test('nxProject matches project.json name; null means no project.json', () => {
		const drift: string[] = []
		for (const [id, w] of entries) {
			const projectJson = resolve(ROOT, w.pkgRoot, 'project.json')
			if (w.nxProject === null) {
				if (existsSync(projectJson)) drift.push(`${id}: declares nxProject null but ${w.pkgRoot}/project.json exists`)
			} else if (!existsSync(projectJson)) {
				drift.push(`${id}: declares nxProject '${w.nxProject}' but ${w.pkgRoot}/project.json is missing`)
			} else {
				const name = (JSON.parse(readFileSync(projectJson, 'utf8')) as { name?: string }).name
				if (name !== w.nxProject) drift.push(`${id}: nxProject '${w.nxProject}' != project.json name '${name}'`)
			}
		}
		expect(drift, 'Workspace.nxProject drifted from project.json — create-template stamping would target a ghost project.').toEqual([])
	})

	test('workspace aliases are unique selection tokens', () => {
		const aliases = entries.map(([, w]) => w.alias)
		expect(new Set(aliases).size).toBe(aliases.length)
	})
})
