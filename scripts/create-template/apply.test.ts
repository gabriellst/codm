/**
 * apply.test.ts — the StampPlan interpreter against a FABRICATED source tree in a temp dir
 * (mold: scripts/examples/promote.test.ts). The fixture repo mirrors the template universe's
 * shape, so planStamp(FIXTURE) → applyStamp is a true miniature of the real stamping pipeline:
 * copy rules, prunes, JSON edits, line strips, manifest closure and rendered files are all
 * asserted on the resulting tree. Primitive edge cases (evalCopyRules, applyJsonEdit) are pinned
 * separately — the interpreter's vocabulary is closed, so these ARE its spec.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { applyJsonEdit, applyStamp, evalCopyRules, type JsonValue } from './apply'
import { planStamp, type RepoLike, type StampPlan } from './plan'
import { managedBlockKeys } from './render-manifest'

// The same fixture universe as plan.test.ts — ids are the relation vocabulary.
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
	},
	env: {
		COMPOSE_KEY: { consumers: ['compose'], example: 'x' },
		TS_ONLY: { consumers: ['apiTs'], example: 'x' },
		GO_ONLY: { consumers: ['apiGo'], example: 'x' },
	},
	workspaceRoots: { apiTs: 'packages/api/typescript/src', apiGo: 'packages/api/go/internal', appReact: 'packages/app/react/src' },
	packageRoots: {
		contracts: 'packages/contracts',
		apiTs: 'packages/api/typescript',
		apiGo: 'packages/api/go',
		appReact: 'packages/app/react',
		client: 'packages/client',
		clientTsDist: 'packages/client/dist/typescript',
		clientGoDist: 'packages/client/dist/go',
		contractsGenTs: 'packages/contracts/generated/typescript',
		contractsGenGo: 'packages/contracts/generated/go',
	},
}

const FIXTURE_MANIFEST = `// fixture manifest
// ── STAMP-MANAGED: workspaces — fixture ──
const WORKSPACES = {
	apiTs: { pkgRoot: 'packages/api/typescript' },
	apiGo: { pkgRoot: 'packages/api/go' },
	appReact: { pkgRoot: 'packages/app/react' },
	contracts: { pkgRoot: 'packages/contracts' },
	client: { pkgRoot: 'packages/client' },
}
// ── STAMP-MANAGED-END: workspaces ──
export const REPO = {
	// ── STAMP-MANAGED: workspaceRoots — fixture ──
	workspaceRoots: {
		apiTs: 'packages/api/typescript/src',
		apiGo: 'packages/api/go/internal',
		appReact: 'packages/app/react/src',
	},
	// ── STAMP-MANAGED-END: workspaceRoots ──
	// ── STAMP-MANAGED: packageRoots — fixture ──
	packageRoots: {
		contracts: 'packages/contracts',
		apiTs: 'packages/api/typescript',
		apiGo: 'packages/api/go',
		appReact: 'packages/app/react',
		client: 'packages/client',
		clientTsDist: \`\${WORKSPACES.client.pkgRoot}/dist/typescript\`,
		clientGoDist: \`\${WORKSPACES.client.pkgRoot}/dist/go\`,
		contractsGenTs: 'packages/contracts/generated/typescript',
		contractsGenGo: 'packages/contracts/generated/go',
	},
	// ── STAMP-MANAGED-END: packageRoots ──
	// ── STAMP-MANAGED: env — fixture ──
	env: {
		COMPOSE_KEY: { consumers: ['compose'], example: 'x' },
		TS_ONLY: { consumers: ['apiTs'], example: 'x' },
		GO_ONLY: { consumers: ['apiGo'], example: 'x' },
	},
	// ── STAMP-MANAGED-END: env ──
}
`

let root: string
let src: string
let dest: string
let plan: StampPlan

const write = (rel: string, content: string) => {
	const abs = join(src, rel)
	mkdirSync(dirname(abs), { recursive: true })
	writeFileSync(abs, content)
}
const destHas = (rel: string): boolean => existsSync(join(dest, rel))
const destRead = (rel: string): string => readFileSync(join(dest, rel), 'utf-8')

beforeAll(async () => {
	root = mkdtempSync(join(tmpdir(), 'stamp-apply-'))
	src = join(root, 'template')
	dest = join(root, 'stamp')
	mkdirSync(src, { recursive: true })

	write(
		'package.json',
		`${JSON.stringify(
			{
				name: 'template',
				workspaces: [
					'packages/contracts',
					'packages/contracts/generated/typescript',
					'packages/api/typescript',
					'packages/api/typescript/core',
					'packages/app/react',
					'packages/app/styles',
					'packages/client',
					'packages/client/dist/typescript',
				],
				scripts: {
					dev: 'nx run-many -t dev -p api-typescript,api-go,app-react --parallel=3',
					'dev:api': 'nx run-many -t dev -p api-typescript,api-go --parallel=2',
					'dev:api:typescript': 'nx run api-typescript:dev',
					'dev:api:go': 'nx run api-go:dev',
					'dev:app:react': 'nx run app-react:dev',
					'sdk:typescript': 'nx run client:generate',
					'sdk:go': 'nx run client:generate',
					sdk: 'nx run client:generate',
				},
			},
			null,
			'\t',
		)}\n`,
	)
	write(
		'packages/contracts/package.json',
		`${JSON.stringify(
			{
				name: '@codedm/contracts',
				scripts: {
					'codegen:wire:typescript': 'bun codegen/emit-wire-ts.ts',
					'codegen:wire:go': 'bun codegen/emit-wire-go.ts',
					'codegen:wire': 'bun run codegen:wire:typescript && bun run codegen:wire:go',
					all: 'stale',
				},
			},
			null,
			'\t',
		)}\n`,
	)
	write('template.config.ts', FIXTURE_MANIFEST)
	write('CLAUDE.md', '| `packages/api/typescript` | ts |\n| `packages/api/go` | go |\n| `packages/app/react` | react |\n')
	write('.env', 'SECRET=live\n')
	write('.env.local', 'SECRET=local\n')
	write('.env.example', 'STALE=1\n')
	write('.envrc', 'use flake\n')
	write('node_modules/junk/index.js', 'x\n')
	write('.claude/worktrees/wip/file.ts', 'x\n')
	write('.nx/cache/hash', 'x\n')
	write('packages/api/typescript/src/index.ts', 'export {}\n')
	write('packages/api/typescript/core/package.json', '{ "name": "@codedm/core-typescript" }\n')
	write('packages/api/go/main.go', 'package main\n')
	write('packages/app/react/src/main.tsx', 'export {}\n')
	write('packages/app/styles/tokens.css', ':root {}\n')
	write('packages/client/dist/typescript/package.json', '{ "name": "@codedm/client-typescript" }\n')
	write('packages/client/dist/go/client.go', 'package client\n')
	write('packages/contracts/generated/typescript/package.json', '{ "name": "@codedm/contracts-typescript" }\n')
	write('packages/contracts/generated/go/wire.go', 'package wire\n')
	write('packages/app/react/dist/bundle.js', 'built\n')

	plan = planStamp(FIXTURE, { projectName: 'stamped-demo', backends: ['typescript'], frontends: ['react'] })
	await applyStamp(plan, { srcDir: src, destDir: dest })
})

afterAll(() => {
	rmSync(root, { recursive: true, force: true })
})

describe('applyStamp — the miniature pipeline', () => {
	it('copy rules: live env, caches, worktrees and rebuildable dist never ship; whitelists do', () => {
		expect(destHas('.env')).toBe(false)
		expect(destHas('.env.local')).toBe(false)
		expect(destHas('.envrc')).toBe(true)
		expect(destHas('node_modules')).toBe(false)
		expect(destHas('.claude/worktrees')).toBe(false)
		expect(destHas('.nx/cache')).toBe(false)
		expect(destHas('packages/app/react/dist')).toBe(false)
		// Committed generated workspaces ARE whitelisted through the dist/ skip.
		expect(destHas('packages/client/dist/typescript/package.json')).toBe(true)
		expect(destHas('packages/contracts/generated/typescript/package.json')).toBe(true)
	})

	it('prunes dropped workspace trees and their per-language generated outputs', () => {
		expect(destHas('packages/api/go')).toBe(false)
		expect(destHas('packages/client/dist/go')).toBe(false)
		expect(destHas('packages/contracts/generated/go')).toBe(false)
		expect(destHas('packages/api/typescript/src/index.ts')).toBe(true)
		expect(destHas('packages/app/react/src/main.tsx')).toBe(true)
		expect(destHas('packages/app/styles/tokens.css')).toBe(true)
	})

	it('patches root package.json: rename, workspace filter, script ownership, re-derived aggregates', () => {
		const pkg = JSON.parse(destRead('package.json')) as { name: string; workspaces: string[]; scripts: Record<string, string> }
		expect(pkg.name).toBe('stamped-demo')
		expect(pkg.workspaces).toEqual([
			'packages/contracts',
			'packages/contracts/generated/typescript',
			'packages/api/typescript',
			'packages/api/typescript/core',
			'packages/app/react',
			'packages/app/styles',
			'packages/client',
			'packages/client/dist/typescript',
		])
		expect(pkg.scripts['dev:api:go']).toBeUndefined()
		expect(pkg.scripts['sdk:go']).toBeUndefined()
		expect(pkg.scripts['dev:api:typescript']).toBe('nx run api-typescript:dev')
		expect(pkg.scripts.dev).toBe('nx run-many -t dev -p api-typescript,app-react --parallel=2')
		expect(pkg.scripts['dev:api']).toBe('nx run-many -t dev -p api-typescript --parallel=1')
	})

	it('patches contracts package.json: dropped wire script deleted, aggregates re-derived', () => {
		const pkg = JSON.parse(destRead('packages/contracts/package.json')) as { scripts: Record<string, string> }
		expect(pkg.scripts['codegen:wire:go']).toBeUndefined()
		expect(pkg.scripts['codegen:wire']).toBe('bun run codegen:wire:typescript')
		expect(pkg.scripts.all).toBe('bun run tsp:compile && bun run codegen:wire && bun run drizzle:generate')
	})

	it('strips the CLAUDE.md rows of dropped workspaces only', () => {
		const claude = destRead('CLAUDE.md')
		expect(claude).not.toContain('`packages/api/go`')
		expect(claude).toContain('`packages/api/typescript`')
		expect(claude).toContain('`packages/app/react`')
	})

	it('MANIFEST CLOSURE: the stamped manifest declares only kept workspaces and env keys', () => {
		const manifest = destRead('template.config.ts')
		expect(managedBlockKeys(manifest, 'workspaces')).toEqual(['apiTs', 'appReact', 'contracts', 'client'])
		expect(managedBlockKeys(manifest, 'workspaceRoots')).toEqual(['apiTs', 'appReact'])
		expect(managedBlockKeys(manifest, 'packageRoots')).toEqual([
			'contracts',
			'apiTs',
			'appReact',
			'client',
			'clientTsDist',
			'contractsGenTs',
		])
		expect(managedBlockKeys(manifest, 'env')).toEqual(['COMPOSE_KEY', 'TS_ONLY'])
	})

	it('rendered files land verbatim (.env.example from the pruned registry, replacing the copy)', () => {
		const rendered = plan.files.find(f => f.path === '.env.example')
		expect(destRead('.env.example')).toBe(rendered?.content ?? '')
		expect(destRead('.env.example')).not.toContain('STALE')
		expect(destRead('.env.example')).not.toContain('GO_ONLY')
	})
})

// ─── Primitive specs ────────────────────────────────────────────────────────

describe('evalCopyRules', () => {
	const rules = [
		{ action: 'keep', endsWith: '/.env.example', reason: 'ships' },
		{ action: 'skip', endsWith: '/.env', reason: 'live' },
		{ action: 'skip', contains: '/.env.', reason: 'variants' },
		{ action: 'skip', contains: '/dist/', reason: 'output' },
	] as const

	it('first match wins; no match copies', () => {
		expect(evalCopyRules(rules, '/repo/.env.example')).toBe(true)
		expect(evalCopyRules(rules, '/repo/.env')).toBe(false)
		expect(evalCopyRules(rules, '/repo/.env.local')).toBe(false)
		expect(evalCopyRules(rules, '/repo/.envrc')).toBe(true)
		expect(evalCopyRules(rules, '/repo/pkg/dist/x.js')).toBe(false)
		expect(evalCopyRules(rules, '/repo/src/index.ts')).toBe(true)
	})
})

describe('applyJsonEdit', () => {
	it('set creates intermediate containers; delete and dropUnder no-op on missing paths', () => {
		const doc: Record<string, JsonValue> = {}
		applyJsonEdit(doc, { op: 'set', path: ['a', 'b'], value: 1 })
		expect(doc).toEqual({ a: { b: 1 } })
		applyJsonEdit(doc, { op: 'delete', path: ['ghost', 'key'] })
		applyJsonEdit(doc, { op: 'dropUnder', path: ['ghost'], roots: ['x'] })
		expect(doc).toEqual({ a: { b: 1 } })
	})

	it('dropUnder removes exact matches and nested paths, keeps siblings with a shared prefix', () => {
		const doc = {
			workspaces: ['packages/api/typescript', 'packages/api/typescript/core', 'packages/api/typescript-extras', 'packages/app'],
		}
		applyJsonEdit(doc, { op: 'dropUnder', path: ['workspaces'], roots: ['packages/api/typescript'] })
		expect(doc.workspaces).toEqual(['packages/api/typescript-extras', 'packages/app'])
	})

	it('refuses structural surprises: non-array dropUnder, path through a non-object', () => {
		expect(() => applyJsonEdit({ scripts: 'oops' }, { op: 'dropUnder', path: ['scripts'], roots: ['x'] })).toThrow(/expects an array/)
		expect(() => applyJsonEdit({ a: 1 }, { op: 'set', path: ['a', 'b'], value: 2 })).toThrow(/non-object/)
	})
})
