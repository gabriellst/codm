/**
 * lint-liveness — EVERY workspace of this repo is reached by `bun lint`, and no ignore pattern
 * quietly takes one back out.
 *
 * Sibling of `test-liveness` (every test file is executed by some target) and
 * `lang-tooling-orphans` (every per-language directory describes a language this repo speaks).
 * Same disease, third organ: here the orphan is a whole PACKAGE that no linter ever opens.
 *
 * THE MISS, measured 2026-08-07 (E-T7). `bun lint` is `nx run-many -t lint`, so it reaches exactly
 * the projects that DECLARE a `lint` target — and that was 5 of 13, all five of them frontend. The
 * entire backend (`api-typescript` 331 files, `core-typescript` 145, `api-go`), the SDK generator
 * and the e2e suite were outside every lint gate. Not skipped, not baselined: never invoked. The
 * first run after wiring them found 15 problems, including two email templates that shipped
 * hardcoded pt-BR to `en-US` recipients while their `billing` siblings — same process, same
 * mechanism — were correctly translated.
 *
 * THE SECOND MISS, and the reason CHECK 3 exists. `eslint.config.ts` carried the ignore pattern
 * `'**` + `/client/` + `**'` (spelled in pieces here only because a block comment cannot hold it),
 * aimed at the generated SDK. It matches any path SEGMENT named `client`, so it also swallowed
 * `packages/client/{lib,generators}` — the 19 hand-written files that GENERATE that SDK. A rail that
 * only counted TARGETS would have called that package covered while eslint opened none of it.
 *
 * WHAT CHECK 3 IS AND IS NOT — measured, not assumed. eslint 9 does not pass silently over a
 * fully-ignored root: asked to lint a path whose every file is ignored it aborts with `You are
 * linting "lib", but all of the files matching the glob pattern "lib" are ignored` (exit 1 for the
 * named-root form these targets use, exit 2 for the bare `.` form app-react uses — both measured
 * 2026-08-07 by re-planting the pattern). So CHECK 3 is not the last line against a silent pass.
 * Its job is earlier: an ignore is reviewed as one line in a forty-line list, and the day it removes
 * a package from the gate the only signal is a runner abort that reads like broken tooling ("Oops!
 * Something went wrong!") — and only inside a target that names that path. Before E-T7 no target
 * named `packages/client` at all, which is exactly why the pattern survived unnoticed. This turns it
 * into a failure that names the PROJECT, at the moment the config changes.
 *
 * CHECK 1 — every project declares `lint`, or carries a named exemption with a why.
 * CHECK 2 — exemptions are ALIVE: the project still exists and still lacks the target. An
 *   exemption cannot fossilize into permission after the reason expires.
 * CHECK 3 — no whole-segment ignore (`**` + `/<segment>/` + `**`) swallows a non-exempt project.
 * CHECK 4 — negative fixture on a real temp tree, so 1–3 cannot pass merely because this tree
 *   happens to be clean.
 */

import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

export interface Project {
	/** The nx project name — from `project.json`, or the package name for an inferred project. */
	readonly name: string
	/** Repo-relative root. */
	readonly root: string
	readonly targets: readonly string[]
}

/**
 * Every nx project in a tree, from FILES rather than a `nx show projects` spawn.
 *
 * Two families, and missing either one would make this rail blind exactly where the hole was:
 *   · every `project.json` under `packages/` — the explicitly configured projects (10 here),
 *     whose `targets` we read.
 *   · root `package.json` `workspaces` entries WITHOUT a `project.json` — nx infers a project from
 *     the package alone (3 here: contracts + the two generated binding packages). They can carry no
 *     target at all, so a rail that only walked `project.json` would never ask about them.
 */
export function nxProjects(root: string): Project[] {
	const out = new Map<string, Project>()

	for (const rel of new Bun.Glob('packages/**/project.json').scanSync({ cwd: root })) {
		if (rel.includes('node_modules/')) continue
		const doc = JSON.parse(readFileSync(join(root, rel), 'utf-8')) as { name?: string; targets?: Record<string, unknown> }
		// Some tools emit their own `project.json` telemetry/manifest (Storybook's static build writes
		// {generatedAt, hasCustomBabel, ...} into storybook-static/) — same filename, zero nx semantics,
		// and Bun.Glob does not honor .gitignore. An nx project DECLARATION in this repo always carries
		// a string `name`; a project.json without one is an artifact, not a project.
		if (typeof doc.name !== 'string') continue
		const projectRoot = dirname(rel)
		const name = doc.name ?? projectRoot
		out.set(name, { name, root: projectRoot, targets: Object.keys(doc.targets ?? {}).sort() })
	}

	const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8')) as { workspaces?: string[] }
	for (const ws of rootPkg.workspaces ?? []) {
		if (existsSync(join(root, ws, 'project.json'))) continue
		const pkgPath = join(root, ws, 'package.json')
		if (!existsSync(pkgPath)) continue
		const name = (JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name?: string }).name ?? ws
		if (!out.has(name)) out.set(name, { name, root: ws, targets: [] })
	}

	return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The `ignores` globs of the flat eslint config, read from source.
 *
 * Comments are stripped FIRST: the block is heavily annotated and several notes contain quoted
 * words, which a naive string scan would enrol as ignore patterns.
 */
export function eslintIgnores(root: string): string[] {
	const source = readFileSync(join(root, 'eslint.config.ts'), 'utf-8')
	const start = source.indexOf('ignores: [')
	if (start === -1) return []
	const end = source.indexOf(']', start)
	const block = source
		.slice(start, end)
		.split('\n')
		.map(line => line.replace(/\/\/.*$/, ''))
		.join('\n')
	return [...block.matchAll(/'([^']+)'/g)].map(m => m[1] as string)
}

/**
 * Whole-segment ignore patterns (`**` + `/<segment>/` + `**`) that would take a project's entire
 * root back out of eslint's reach. Only this shape is judged, and deliberately so: it matches by
 * NAME anywhere in the tree, so it can hit a package its author never had in mind.
 */
export function swallowedProjects(projects: readonly Project[], ignores: readonly string[]): { project: string; pattern: string }[] {
	const hits: { project: string; pattern: string }[] = []
	for (const pattern of ignores) {
		const segment = /^\*\*\/([^*/]+)\/\*\*$/.exec(pattern)?.[1]
		if (segment === undefined) continue
		for (const project of projects) {
			if (project.root === segment || project.root.endsWith(`/${segment}`) || project.root.includes(`/${segment}/`)) {
				hits.push({ project: project.name, pattern })
			}
		}
	}
	return hits
}

/**
 * Projects allowed to carry no `lint` target — each with the reason and the EXIT, so the entry is
 * a decision under review rather than a silencer. CHECK 2 makes every one of them expire on its own.
 */
const UNLINTED_PROJECTS: Record<string, string> = {
	'@codm/contracts':
		'packages/contracts is eslint-ignored wholesale and cannot be un-ignored yet: it belongs to NO ' +
		'tsconfig project, so the typed project service answers `Parsing error: … was not found by the ' +
		'project service` — 16 of them, measured 2026-08-07 (codegen/ 7, db/ 9). The exit is the one ' +
		'tsconfig.scripts.json took for scripts/ (E-T4): give the package a tsconfig, reference it from ' +
		'the root tsconfig, fix what strictness surfaces, THEN drop this entry. Its formatting half is ' +
		'already covered — `bun check:biome` sweeps every tracked file, contracts included.',
	'@codm/contracts-typescript':
		'Generated wire bindings (packages/contracts/generated/typescript) — emitted by `bun contracts`, ' +
		'never hand-edited. Linting a generator OUTPUT reports on the generator, at the wrong address; ' +
		'the hand-written side is packages/contracts/codegen, above.',
	'@codm/client-typescript':
		'Generated SDK (packages/client/dist/typescript) — emitted by `bun sdk`, never hand-edited. The ' +
		'hand-written generator that produces it is the `client` project, which DOES lint (its lib/ and ' +
		'generators/ were the surface `**/client/**` used to swallow).',
}

describe('lint-liveness (every workspace is reached by `bun lint`)', () => {
	test('the discovery is real — it finds the projects this tree actually has', () => {
		const projects = nxProjects(ROOT)
		expect(projects, 'nxProjects() found nothing — the walk is broken, not the tree').not.toEqual([])
		// Both families, named: a regression that dropped either one would leave this rail measuring
		// exactly as much as before it existed.
		expect(projects.map(p => p.name)).toContain('api-typescript')
		expect(projects.map(p => p.name)).toContain('@codm/contracts')
		expect(eslintIgnores(ROOT), 'no ignore patterns parsed — CHECK 3 would be inert').not.toEqual([])
	})

	test('CHECK 1 — every project declares a `lint` target', () => {
		const unlinted = nxProjects(ROOT)
			.filter(p => !p.targets.includes('lint'))
			.filter(p => !(p.name in UNLINTED_PROJECTS))
			.map(p => `${p.name} (${p.root})`)
		expect(
			unlinted,
			'A workspace no linter ever opens. `bun lint` is `nx run-many -t lint`, so it reaches exactly ' +
				'the projects that DECLARE the target — a package without one is not skipped, it is invisible, ' +
				'and its first lint finding arrives whenever somebody thinks to run eslint by hand. Add a ' +
				'`lint` target (see packages/api/typescript/project.json for the eslint shape and ' +
				'packages/api/go/project.json for the gofmt one), or add a named entry to UNLINTED_PROJECTS ' +
				'with the reason AND the exit.',
		).toEqual([])
	})

	test('CHECK 2 — every exemption is still alive (real project, still lacking the target)', () => {
		const projects = nxProjects(ROOT)
		const stale: string[] = []
		for (const name of Object.keys(UNLINTED_PROJECTS)) {
			const project = projects.find(p => p.name === name)
			if (!project) stale.push(`${name} — no such project; the exemption outlived the package`)
			else if (project.targets.includes('lint')) stale.push(`${name} — now HAS a lint target; the exemption is obsolete`)
		}
		expect(
			stale,
			'An exemption that no longer describes anything. Left in place it becomes standing permission ' +
				'for the next package that happens to take the same name. Delete the entry.',
		).toEqual([])
	})

	test('CHECK 3 — no `**/<segment>/**` ignore swallows a project that is supposed to be linted', () => {
		const projects = nxProjects(ROOT).filter(p => !(p.name in UNLINTED_PROJECTS))
		const swallowed = swallowedProjects(projects, eslintIgnores(ROOT)).map(
			s => `${s.project} — every file under its root is ignored by '${s.pattern}'`,
		)
		expect(
			swallowed,
			'An eslint ignore matched by SEGMENT NAME has taken a whole linted project back out of reach. ' +
				'Its lint target now aborts with eslint\'s "all of the files matching the glob pattern are ' +
				'ignored" — a failure that reads like broken tooling rather than like a package that left ' +
				'the gate. Narrow the pattern to the path you meant (`packages/x/dist/**`, not ' +
				'`**/dist/**`), or exempt the project by name in UNLINTED_PROJECTS with the reason.',
		).toEqual([])
	})

	test('CHECK 4 — fixture: the rail catches an unlinted project and a swallowed one on a real tree', () => {
		const tmp = mkdtempSync(join(tmpdir(), 'lint-liveness-'))
		try {
			const write = (rel: string, body: string) => {
				mkdirSync(join(tmp, dirname(rel)), { recursive: true })
				writeFileSync(join(tmp, rel), body)
			}
			write('package.json', JSON.stringify({ workspaces: ['packages/gen'] }))
			write('packages/api/project.json', JSON.stringify({ name: 'api', targets: { tsc: {}, lint: {} } }))
			write('packages/tools/project.json', JSON.stringify({ name: 'tools', targets: { tsc: {} } })) // NO lint
			write('packages/gen/package.json', JSON.stringify({ name: '@x/gen' })) // inferred, no targets at all
			// A build-tool telemetry file sharing the `project.json` name, no `name` field — must not be
			// discovered as a project.
			write('packages/api/storybook-static/project.json', JSON.stringify({ generatedAt: 123, hasCustomBabel: false }))
			write('eslint.config.ts', "export default [{ ignores: ['**/node_modules/**', '**/api/**'] }]")

			const projects = nxProjects(tmp)
			expect(projects.map(p => p.name).sort()).toEqual(['@x/gen', 'api', 'tools'])

			// CHECK 1 direction — both the project.json project and the INFERRED package are named.
			const unlinted = projects.filter(p => !p.targets.includes('lint')).map(p => p.name)
			expect(unlinted.sort()).toEqual(['@x/gen', 'tools'])

			// …and the rail is not merely returning everything: the project WITH the target is not named.
			expect(unlinted).not.toContain('api')

			// CHECK 3 direction — the segment-name ignore is caught on the project it swallows, and the
			// narrow one is not mistaken for it.
			const ignores = eslintIgnores(tmp)
			expect(ignores).toEqual(['**/node_modules/**', '**/api/**'])
			expect(swallowedProjects(projects, ignores)).toEqual([{ project: 'api', pattern: '**/api/**' }])
			expect(swallowedProjects(projects, ['packages/api/dist/**'])).toEqual([])

			// CHECK 2 direction — an exemption naming a project this tree does not have is stale.
			expect(projects.find(p => p.name === 'ghost')).toBeUndefined()
		} finally {
			rmSync(tmp, { recursive: true, force: true })
		}
	})
})
