/**
 * plan.test.ts — the canonical stamp model, proven on a FIXTURE universe plus live-repo parity.
 *
 * Fixture assertions pin the ALGEBRA (what a selection keeps, prunes, edits) independent of the
 * live checkout, so they hold identically inside a stamped copy. Live gates pin the INEVITABLE
 * REDECLARATIONS against reality: the full-selection plan must reproduce the committed aggregate
 * scripts and .env.example byte-for-byte (the same class of gate as `bun env:generate --check`),
 * and GENERATED_OUTPUT_DEPS must agree with the manifest's path templates (negative-fixture'd).
 */

import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO } from '../../template.config'
import {
	backendAliases,
	frontendAliases,
	planStamp,
	validateGeneratedOutputDeps,
	type JsonEdit,
	type RepoLike,
	type StampPlan,
} from './plan'

const ROOT = resolve(import.meta.dirname, '..', '..')

// ─── Fixture universe (mirrors the template's shape; ids are the relation vocabulary) ───

const FIXTURE: RepoLike = {
	workspaces: {
		apiTs: {
			pkgRoot: 'packages/api/typescript',
			srcRoot: 'packages/api/typescript/src',
			lang: 'typescript',
			kind: 'backend',
			alias: 'typescript',
			nxProject: 'api-typescript',
			devServer: 'aggregate',
		},
		apiGo: {
			pkgRoot: 'packages/api/go',
			srcRoot: 'packages/api/go/internal',
			lang: 'go',
			kind: 'backend',
			alias: 'go',
			nxProject: 'api-go',
			devServer: 'aggregate',
		},
		appReact: {
			pkgRoot: 'packages/app/react',
			srcRoot: 'packages/app/react/src',
			lang: 'react',
			kind: 'frontend',
			alias: 'react',
			nxProject: 'app-react',
			devServer: 'aggregate',
		},
		// Fixture-universe workspace (NOT a live workspace of this repo): a third frontend
		// whose alias/paths exercise pruning of a dropped target. 'expo' left the
		// Workspace.lang union with the expo removal, so the fixture declares a live lang.
		appExpo: {
			pkgRoot: 'packages/app/expo',
			srcRoot: 'packages/app/expo',
			lang: 'react',
			kind: 'frontend',
			alias: 'expo',
			nxProject: 'app-expo',
			devServer: 'standalone',
		},
		appAstro: {
			pkgRoot: 'packages/app/astro',
			srcRoot: 'packages/app/astro/src',
			lang: 'astro',
			kind: 'frontend',
			alias: 'astro',
			nxProject: 'app-astro',
			devServer: 'aggregate',
		},
		contracts: {
			pkgRoot: 'packages/contracts',
			srcRoot: 'packages/contracts',
			lang: 'typescript',
			kind: 'shared',
			alias: 'contracts',
			nxProject: null,
			devServer: null,
		},
		client: {
			pkgRoot: 'packages/client',
			srcRoot: 'packages/client',
			lang: 'typescript',
			kind: 'shared',
			alias: 'client',
			nxProject: 'client',
			devServer: null,
		},
		e2e: {
			pkgRoot: 'packages/e2e',
			srcRoot: 'packages/e2e',
			lang: 'typescript',
			kind: 'shared',
			alias: 'e2e',
			nxProject: 'e2e',
			devServer: null,
		},
	},
	env: {
		COMPOSE_KEY: { consumers: ['compose'], example: 'x' },
		TS_ONLY: { consumers: ['apiTs'], example: 'x' },
		GO_ONLY: { consumers: ['apiGo'], example: 'x' },
		BOTH_BACKENDS: { consumers: ['apiTs', 'apiGo'], example: 'x' },
		REACT_ONLY: { consumers: ['appReact'], example: 'x' },
	},
	workspaceRoots: {
		apiTs: 'packages/api/typescript/src',
		apiGo: 'packages/api/go/internal',
		appReact: 'packages/app/react/src',
		appExpo: 'packages/app/expo',
		appAstro: 'packages/app/astro/src',
	},
	packageRoots: {
		contracts: 'packages/contracts',
		apiTs: 'packages/api/typescript',
		apiGo: 'packages/api/go',
		appReact: 'packages/app/react',
		appExpo: 'packages/app/expo',
		appAstro: 'packages/app/astro',
		client: 'packages/client',
		clientTsDist: 'packages/client/dist/typescript',
		clientGoDist: 'packages/client/dist/go',
		contractsGenTs: 'packages/contracts/generated/typescript',
		contractsGenGo: 'packages/contracts/generated/go',
		e2e: 'packages/e2e',
	},
}

const plan = (backends: string[], frontends: string[]): StampPlan => planStamp(FIXTURE, { projectName: 'demo', backends, frontends })

const editsFor = (p: StampPlan, file: string): readonly JsonEdit[] => p.jsonPatches.find(patch => patch.file === file)?.edits ?? []
const findSet = (edits: readonly JsonEdit[], ...path: string[]): unknown => {
	const hit = edits.find(e => e.op === 'set' && e.path.join('.') === path.join('.'))
	return hit && hit.op === 'set' ? hit.value : undefined
}
const deletes = (edits: readonly JsonEdit[]): string[] => edits.filter(e => e.op === 'delete').map(e => e.path.join('.'))

describe('planStamp — selection algebra (fixture universe)', () => {
	it('typescript+react: drops go/expo/astro trees, their generated outputs, scripts and env keys', () => {
		const p = plan(['typescript'], ['react'])
		expect([...p.keptWorkspaces]).toEqual(['apiTs', 'appReact', 'contracts', 'client', 'e2e'])
		expect([...p.prune].sort()).toEqual([
			'packages/api/go',
			'packages/app/astro',
			'packages/app/expo',
			'packages/client/dist/go',
			'packages/contracts/generated/go',
		])
		const root = editsFor(p, 'package.json')
		expect(findSet(root, 'name')).toBe('demo')
		expect(deletes(root)).toEqual(['scripts.dev:api:go', 'scripts.sdk:go', 'scripts.dev:app:expo', 'scripts.dev:app:astro'])
		expect(findSet(root, 'scripts', 'dev')).toBe('nx run-many -t dev -p api-typescript,app-react --parallel=2')
		expect(findSet(root, 'scripts', 'dev:api')).toBe('nx run-many -t dev -p api-typescript --parallel=1')
		const contracts = editsFor(p, 'packages/contracts/package.json')
		expect(deletes(contracts)).toEqual(['scripts.codegen:wire:go'])
		expect(findSet(contracts, 'scripts', 'codegen:wire')).toBe('bun run codegen:wire:typescript')
		expect(p.manifest.env).toEqual(['COMPOSE_KEY', 'TS_ONLY', 'BOTH_BACKENDS', 'REACT_ONLY'])
		expect(p.manifest.workspaceRoots).toEqual(['apiTs', 'appReact'])
		expect(p.manifest.packageRoots).toEqual(['contracts', 'apiTs', 'appReact', 'client', 'clientTsDist', 'contractsGenTs', 'e2e'])
		expect(p.lineStrips).toEqual([
			{
				file: 'CLAUDE.md',
				patterns: ['^\\| `packages/api/go`.*\\n', '^\\| `packages/app/expo`.*\\n', '^\\| `packages/app/astro`.*\\n'],
			},
		])
	})

	it('go+astro: the symmetric prune — typescript trees, wire codegen, and ts-only env keys go', () => {
		const p = plan(['go'], ['astro'])
		expect([...p.keptWorkspaces]).toEqual(['apiGo', 'appAstro', 'contracts', 'client', 'e2e'])
		expect([...p.prune].sort()).toEqual([
			'packages/api/typescript',
			'packages/app/expo',
			'packages/app/react',
			'packages/client/dist/typescript',
			'packages/contracts/generated/typescript',
		])
		const root = editsFor(p, 'package.json')
		expect(deletes(root)).toEqual(['scripts.dev:api:typescript', 'scripts.sdk:typescript', 'scripts.dev:app:react', 'scripts.dev:app:expo'])
		expect(findSet(root, 'scripts', 'dev')).toBe('nx run-many -t dev -p api-go,app-astro --parallel=2')
		const contracts = editsFor(p, 'packages/contracts/package.json')
		expect(deletes(contracts)).toEqual(['scripts.codegen:wire:typescript'])
		expect(findSet(contracts, 'scripts', 'codegen:wire')).toBe('bun run codegen:wire:go')
		expect(p.manifest.env).toEqual(['COMPOSE_KEY', 'GO_ONLY', 'BOTH_BACKENDS'])
		expect(p.manifest.packageRoots).toEqual(['contracts', 'apiGo', 'appAstro', 'client', 'clientGoDist', 'contractsGenGo', 'e2e'])
	})

	it('zero backends: client dies with its layer, layer parents are pruned, SDK scripts vanish', () => {
		const p = plan([], ['react'])
		expect([...p.keptWorkspaces]).toEqual(['appReact', 'contracts', 'e2e'])
		expect(p.prune).toContain('packages/api')
		expect(p.prune).toContain('packages/client')
		const root = editsFor(p, 'package.json')
		expect(deletes(root)).toContain('scripts.sdk')
		expect(deletes(root)).toContain('scripts.sdk:build')
		expect(deletes(root)).toContain('scripts.emit-openapi')
		expect(deletes(root)).toContain('scripts.dev:api')
		expect(findSet(root, 'scripts', 'dev')).toBe('nx run-many -t dev -p app-react --parallel=1')
		const contracts = editsFor(p, 'packages/contracts/package.json')
		expect(findSet(contracts, 'scripts', 'codegen:wire')).toBe('echo "no codegen targets"')
	})

	it('zero frontends: packages/app parent is pruned (sweeping non-workspace siblings like styles)', () => {
		const p = plan(['typescript'], [])
		expect(p.prune).toContain('packages/app')
		const root = editsFor(p, 'package.json')
		expect(deletes(root)).toContain('scripts.dev:app:react')
		expect(findSet(root, 'scripts', 'dev')).toBe('nx run-many -t dev -p api-typescript --parallel=1')
	})

	it('full selection: nothing pruned, nothing stripped, aggregates keep every project', () => {
		const p = plan(['typescript', 'go'], ['react', 'expo', 'astro'])
		expect([...p.prune]).toEqual([])
		expect([...p.lineStrips]).toEqual([])
		expect([...p.keptWorkspaces]).toEqual(Object.keys(FIXTURE.workspaces))
		expect(findSet(editsFor(p, 'package.json'), 'scripts', 'dev')).toBe(
			'nx run-many -t dev -p api-typescript,api-go,app-react,app-astro --parallel=4',
		)
	})

	it('.env.example is re-rendered from the pruned registry (kept keys only)', () => {
		const p = plan(['go'], [])
		const envFile = p.files.find(f => f.path === '.env.example')
		expect(envFile).toBeDefined()
		expect(envFile?.content).toContain('COMPOSE_KEY=')
		expect(envFile?.content).toContain('GO_ONLY=')
		expect(envFile?.content).not.toContain('TS_ONLY=')
		expect(envFile?.content).not.toContain('REACT_ONLY=')
	})
})

describe('planStamp — the model REFUSES what it cannot classify', () => {
	it('unknown selection tokens are a hard error, never silently ignored', () => {
		expect(() => plan(['rust'], [])).toThrow(/unknown backend selection token/)
		expect(() => plan([], ['vue'])).toThrow(/unknown frontend selection token/)
	})

	it('a workspaceRoots key that is not a workspace id is a hard error', () => {
		const broken: RepoLike = { ...FIXTURE, workspaceRoots: { ...FIXTURE.workspaceRoots, ghost: 'packages/ghost' } }
		expect(() => planStamp(broken, { projectName: 'x', backends: ['typescript'], frontends: [] })).toThrow(/workspaceRoots key 'ghost'/)
	})

	it('a packageRoots key with no declared owner is a hard error', () => {
		const broken: RepoLike = { ...FIXTURE, packageRoots: { ...FIXTURE.packageRoots, mystery: 'packages/mystery' } }
		expect(() => planStamp(broken, { projectName: 'x', backends: ['typescript'], frontends: [] })).toThrow(/packageRoots key 'mystery'/)
	})
})

describe('GENERATED_OUTPUT_DEPS gate (inevitable redeclaration of manifest path templates)', () => {
	it('agrees with the fixture and the LIVE manifest', () => {
		expect(validateGeneratedOutputDeps(FIXTURE)).toEqual([])
		expect(validateGeneratedOutputDeps(REPO)).toEqual([])
	})

	it('negative fixture: a path not hosted under its declared host drifts', () => {
		const broken: RepoLike = { ...FIXTURE, packageRoots: { ...FIXTURE.packageRoots, clientTsDist: 'packages/elsewhere/dist/typescript' } }
		expect(validateGeneratedOutputDeps(broken).join('\n')).toMatch(/clientTsDist: .*not hosted under client/)
		expect(() => planStamp(broken, { projectName: 'x', backends: ['typescript'], frontends: [] })).toThrow(/GENERATED_OUTPUT_DEPS drifted/)
	})

	it('negative fixture: a missing entry whose deps all ship drifts (presence parity)', () => {
		const { clientGoDist: _dropped, ...rest } = FIXTURE.packageRoots
		const broken: RepoLike = { ...FIXTURE, packageRoots: rest }
		expect(validateGeneratedOutputDeps(broken).join('\n')).toMatch(/clientGoDist: absent from packageRoots/)
	})

	it('negative fixture: a path with the wrong language suffix drifts', () => {
		const broken: RepoLike = {
			...FIXTURE,
			packageRoots: { ...FIXTURE.packageRoots, contractsGenGo: 'packages/contracts/generated/typescript2' },
		}
		expect(validateGeneratedOutputDeps(broken).join('\n')).toMatch(/contractsGenGo: .*not the go output/)
	})
})

describe('live-repo parity (full-selection plan ⇔ committed aggregates)', () => {
	const committedPkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')) as { name: string; scripts: Record<string, string> }
	const committedContracts = JSON.parse(readFileSync(resolve(ROOT, REPO.packageRoots.contracts, 'package.json'), 'utf-8')) as {
		scripts: Record<string, string>
	}
	const full = planStamp(REPO, { projectName: committedPkg.name, backends: backendAliases(REPO), frontends: frontendAliases(REPO) })

	it('keeps everything: no prune, no strips, no script deletes', () => {
		expect([...full.prune]).toEqual([])
		expect([...full.lineStrips]).toEqual([])
		for (const patch of full.jsonPatches) expect(deletes(patch.edits)).toEqual([])
	})

	it('re-derives the committed aggregate scripts byte-for-byte', () => {
		const root = editsFor(full, 'package.json')
		expect(findSet(root, 'scripts', 'dev')).toBe(committedPkg.scripts.dev)
		expect(findSet(root, 'scripts', 'dev:api')).toBe(committedPkg.scripts['dev:api'])
		const contracts = editsFor(full, `${REPO.packageRoots.contracts}/package.json`)
		expect(findSet(contracts, 'scripts', 'codegen:wire')).toBe(committedContracts.scripts['codegen:wire'])
		expect(findSet(contracts, 'scripts', 'all')).toBe(committedContracts.scripts.all)
	})

	it('re-derives the committed .env.example byte-for-byte', () => {
		const envFile = full.files.find(f => f.path === '.env.example')
		expect(envFile?.content).toBe(readFileSync(resolve(ROOT, '.env.example'), 'utf-8'))
	})
})
