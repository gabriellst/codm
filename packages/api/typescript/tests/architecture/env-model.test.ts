import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { KERNEL_ENV_KEYS } from '@codm/core-typescript'
import { PRODUCT_ENV_KEYS } from '@shared/config'

// Root files are OUTSIDE this tsconfig project — load them at runtime via computed paths (bun
// resolves fine; tsc doesn't try to project-check non-literal dynamic imports).
type EnvDecl = {
	consumers: readonly string[]
	schema?: 'kernel' | 'product'
	group?: string
	example: string
	doc?: string
	secret?: boolean
	advanced?: boolean
}
const ROOT = join(import.meta.dir, '..', '..', '..', '..', '..')
const { REPO } = (await import(join(ROOT, 'template.config.ts'))) as { REPO: { env: Record<string, EnvDecl> } }
const { renderEnvExample } = (await import(join(ROOT, 'scripts/env/generate.ts'))) as { renderEnvExample: () => string }

/**
 * Env-model guard — the parity rails behind the env registry (template.config.ts REPO.env).
 *
 * Every env key is declared ONCE in the registry with its CONSUMERS (workspace ids + 'compose');
 * the Zod schemas stay the runtime truth for typing/coercion. These rails make the layers
 * impossible to drift:
 *   ENV-01 — kernel parity: Config.ts RawEnvSchema keys == registry keys with schema: 'kernel'.
 *   ENV-02 — product parity: ProductConfig schema keys == registry keys with schema: 'product'.
 *   ENV-03 — go parity: every env key config.go reads is declared with 'apiGo' in consumers.
 *   ENV-04 — .env.example is GENERATED: committed file == renderEnvExample() output byte-for-byte.
 *
 * Before this rail the same key lived in up to 5 hand-synced places (HD-03 of the declarative-repo
 * plan) and ~31 schema keys were missing from .env.example. Now: change the registry, run
 * `bun env:generate`, and the schemas must follow — any mismatch names the exact keys.
 */

const REPO_ROOT = ROOT
const entries = Object.entries(REPO.env) as [string, EnvDecl][]

const setDiff = (a: string[], b: string[]) => ({
	missingInB: a.filter(k => !b.includes(k)).sort(),
	extraInB: b.filter(k => !a.includes(k)).sort(),
})

describe('env-model (single env registry; schemas, .env.example and Go reads gated to parity)', () => {
	test('ENV-01: kernel schema keys == registry entries with schema:kernel', () => {
		const registryKernel = entries.filter(([, d]) => d.schema === 'kernel').map(([k]) => k)
		const diff = setDiff(registryKernel, [...KERNEL_ENV_KEYS])
		expect(
			diff,
			`Kernel env drift — declare the key in template.config.ts REPO.env (schema: 'kernel', consumers ` +
				`incl. 'apiTs') AND in core Config.ts RawEnvSchema; both sides must match.`,
		).toEqual({ missingInB: [], extraInB: [] })
	})

	test("ENV-05: schema field ⇔ 'apiTs' consumer (contract coherence)", () => {
		const bad = entries.filter(([, d]) => (d.schema !== undefined) !== d.consumers.includes('apiTs')).map(([k]) => k)
		expect(bad, "`schema` is required exactly when 'apiTs' is a consumer — fix the registry entry.").toEqual([])
	})

	test('ENV-02: product schema keys == registry entries with schema:product', () => {
		const registryProduct = entries.filter(([, d]) => d.schema === 'product').map(([k]) => k)
		const diff = setDiff(registryProduct, [...PRODUCT_ENV_KEYS])
		expect(
			diff,
			`Product env drift — declare the key in REPO.env (schema: 'product') AND ` +
				`in src/shared/config/ProductConfig.ts; both sides must match.`,
		).toEqual({ missingInB: [], extraInB: [] })
	})

	test('ENV-03: every env key config.go reads is declared for Go in the registry', () => {
		const goSource = readFileSync(join(REPO_ROOT, 'packages/api/go/core/config/config.go'), 'utf8')
		// Keys come ONLY from env-accessor call sites — bare quoted UPPERCASE literals elsewhere are
		// enum VALUES (DEVELOPMENT, WARN), not env keys (the verbatim medscall config style).
		const goReads = [
			...new Set([...goSource.matchAll(/(?:getEnvOrDefault|os\.Getenv)\("([A-Z][A-Z0-9_]+)"/g)].map(m => m[1] ?? '')),
		].filter(Boolean)
		const declaredForGo = entries.filter(([, d]) => d.consumers.includes('apiGo')).map(([k]) => k)
		const undeclared = goReads.filter(k => !declaredForGo.includes(k)).sort()
		expect(undeclared, `config.go reads env keys not declared for Go in REPO.env — add 'apiGo' to the entry's consumers.`).toEqual([])
	})

	test('ENV-04: .env.example is exactly the registry rendering (bun env:generate)', () => {
		const committed = readFileSync(join(REPO_ROOT, '.env.example'), 'utf8')
		expect(committed === renderEnvExample(), '.env.example is out of sync with template.config.ts REPO.env — run: bun env:generate').toBe(
			true,
		)
	})

	// Negative fixture — proves the set-diff actually reports both directions.
	test('fixture: a key missing from either side is reported with its name', () => {
		const diff = setDiff(['A', 'B'], ['B', 'C'])
		expect(diff).toEqual({ missingInB: ['A'], extraInB: ['C'] })
	})
})
