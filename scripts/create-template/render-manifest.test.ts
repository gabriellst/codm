/**
 * render-manifest.test.ts — the MANIFEST CLOSURE gates (same class as `bun env:generate --check`).
 *
 * The committed template.config.ts is BOTH the data source and the render target: the faithfulness
 * gate proves that re-rendering every STAMP-MANAGED block with full keep-sets reproduces the
 * committed file byte-for-byte, and the parity gates prove each block's text keys mirror the
 * same-named REPO field 1:1. Because a stamped manifest is this renderer's own output, the exact
 * same gates hold INSIDE a stamp — closure is self-maintaining. Negative fixtures pin the marker
 * contract: a manifest without (or with duplicated/mangled) markers must be REFUSED, never
 * silently half-rendered.
 */

import { afterAll, describe, expect, it } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { REPO } from '../../template.config'
import { backendAliases, frontendAliases, planStamp, type ManifestKeep } from './plan'
import {
	MANAGED_BLOCKS,
	MANIFEST_FILE,
	managedBlockKeys,
	parseManagedBlock,
	renderManagedBlock,
	renderStampedManifest,
} from './render-manifest'

const ROOT = resolve(import.meta.dirname, '..', '..')
const source = readFileSync(resolve(ROOT, MANIFEST_FILE), 'utf-8')

const fullKeep: ManifestKeep = {
	workspaces: Object.keys(REPO.workspaces),
	workspaceRoots: Object.keys(REPO.workspaceRoots),
	packageRoots: Object.keys(REPO.packageRoots),
	env: Object.keys(REPO.env),
}

const scratch: string[] = []
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

describe('manifest contract (template.config.ts ⇔ STAMP-MANAGED markers)', () => {
	it('declares every managed block exactly once', () => {
		for (const name of MANAGED_BLOCKS) expect(() => parseManagedBlock(source, name)).not.toThrow()
	})

	it('block text keys mirror the same-named REPO field 1:1, in order', () => {
		expect(managedBlockKeys(source, 'workspaces')).toEqual(Object.keys(REPO.workspaces))
		expect(managedBlockKeys(source, 'workspaceRoots')).toEqual(Object.keys(REPO.workspaceRoots))
		expect(managedBlockKeys(source, 'packageRoots')).toEqual(Object.keys(REPO.packageRoots))
		expect(managedBlockKeys(source, 'env')).toEqual(Object.keys(REPO.env))
	})

	it('FAITHFULNESS: rendering the unpruned REPO reproduces the committed manifest byte-for-byte', () => {
		expect(renderStampedManifest(source, fullKeep)).toBe(source)
	})
})

describe('pruned render (manifest closure for a real selection)', () => {
	// Derive a minimal real selection from the live universe — first backend + first frontend.
	// In the template this drops apiGo/appExpo/appAstro; inside a single-target stamp it is the
	// full selection and the render is the identity — the gate holds in both worlds.
	const backends = backendAliases(REPO).slice(0, 1)
	const frontends = frontendAliases(REPO).slice(0, 1)
	const plan = planStamp(REPO, { projectName: 'closure-probe', backends, frontends })
	const rendered = renderStampedManifest(source, plan.manifest)

	it('each block keeps exactly the plan keep-set', () => {
		expect(managedBlockKeys(rendered, 'workspaces')).toEqual([...plan.manifest.workspaces])
		expect(managedBlockKeys(rendered, 'workspaceRoots')).toEqual([...plan.manifest.workspaceRoots])
		expect(managedBlockKeys(rendered, 'packageRoots')).toEqual([...plan.manifest.packageRoots])
		expect(managedBlockKeys(rendered, 'env')).toEqual([...plan.manifest.env])
	})

	it('the pruned manifest is a live module: importable, with pruned REPO fields and derived appTargets', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'stamp-manifest-'))
		scratch.push(dir)
		const file = join(dir, 'pruned-template.config.ts')
		writeFileSync(file, rendered)
		const mod = (await import(file)) as { REPO: typeof REPO }
		expect(Object.keys(mod.REPO.workspaces)).toEqual([...plan.manifest.workspaces])
		expect(Object.keys(mod.REPO.workspaceRoots)).toEqual([...plan.manifest.workspaceRoots])
		expect(Object.keys(mod.REPO.packageRoots)).toEqual([...plan.manifest.packageRoots])
		expect(Object.keys(mod.REPO.env)).toEqual([...plan.manifest.env])
		// appTargets derives from the (now pruned) workspace table — closure propagates for free.
		expect(frontends).toEqual([...mod.REPO.appTargets])
	})
})

// ─── Negative fixtures — the marker contract REFUSES malformed manifests ───

const fixtureBlock = (body: string) =>
	`head\n\t// ── STAMP-MANAGED: env — fixture ──\n\tenv: {${body}\n\t},\n\t// ── STAMP-MANAGED-END: env ──\ntail\n`

describe('marker-contract negative fixtures', () => {
	it('parses a well-formed block, attaching leading comments to the entry below', () => {
		// The values stress the scanner: braces inside strings, template interpolation with a
		// nested object literal, a line comment between entries.
		const src = fixtureBlock(
			`\n\t\t// section\n\t\tA: { consumers: ['compose'], example: '(\${PROJECT}-\${SERVICE})' },\n\t\tB: \`\${x({ a: 1 })}/dist\`,`,
		)
		const block = parseManagedBlock(src, 'env')
		expect(block.entries.map(e => e.key)).toEqual(['A', 'B'])
		// Dropping A also drops its attached comment; keeping everything is the identity.
		expect(renderManagedBlock(src, 'env', new Set(['B']))).not.toContain('// section')
		expect(renderManagedBlock(src, 'env', new Set(['A', 'B']))).toBe(src)
	})

	it('refuses a manifest missing the start or end marker', () => {
		expect(() => parseManagedBlock('const x = {}\n', 'env')).toThrow(/missing start marker/)
		expect(() => parseManagedBlock('// ── STAMP-MANAGED: env — fixture ──\nenv: {},\n', 'env')).toThrow(/missing end marker/)
	})

	it('refuses duplicated markers', () => {
		expect(() => parseManagedBlock(fixtureBlock('\n\t\tA: 1,') + fixtureBlock('\n\t\tB: 2,'), 'env')).toThrow(/duplicated/)
	})

	it('refuses an entry without a trailing comma (a pruned subset would go syntactically dead)', () => {
		expect(() => parseManagedBlock(fixtureBlock('\n\t\tA: 1,\n\t\tB: 2'), 'env')).toThrow(/trailing comma/)
	})

	it('refuses an entry it cannot key (spreads have no stable identity to prune by)', () => {
		expect(() => parseManagedBlock(fixtureBlock('\n\t\t...SPREAD,'), 'env')).toThrow(/without a `key:`/)
	})

	it('refuses a block whose region has no object literal', () => {
		const src = 'x\n\t// ── STAMP-MANAGED: env — fixture ──\n\t// ── STAMP-MANAGED-END: env ──\n'
		expect(() => parseManagedBlock(src, 'env')).toThrow(/no object literal/)
	})
})

describe('filterEntryConsumers (stamped manifests never NAME pruned workspaces)', () => {
	const { filterEntryConsumers } = require('./render-manifest') as typeof import('./render-manifest')

	it('drops pruned ids from a surviving entry and keeps formatting for untouched entries', () => {
		const entry = "\t\tDATABASE_URL: { consumers: ['apiTs', 'apiGo'], schema: 'kernel', example: 'x' },\n"
		const kept = new Set(['apiTs', 'compose'])
		expect(filterEntryConsumers(entry, kept)).toBe("\t\tDATABASE_URL: { consumers: ['apiTs'], schema: 'kernel', example: 'x' },\n")
	})

	it('is the byte identity when every id is kept (faithfulness)', () => {
		const entry = "\t\tX: { consumers: ['apiTs', 'compose'], example: 'x' },\n"
		expect(filterEntryConsumers(entry, new Set(['apiTs', 'compose', 'apiGo']))).toBe(entry)
	})
})
