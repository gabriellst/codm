/**
 * classify-edit hook + core engine tests.
 *
 * 1. PARITY — synthetic PostToolUse payloads through the spawned hook (stdin → stdout),
 *    asserting additionalContext findings, and exit 0 ALWAYS (even on malformed stdin).
 * 2. REGEX AUDIT — every mechanical:true rule across ALL registries must have detect /
 *    detect_skip patterns that compile with `new RegExp` (closes the safeRegExp
 *    silent-drop hole: a rule whose regex doesn't compile silently loses enforcement).
 * 3. UNIT — globToRegExp / matchSkill / detectLang / runRules / loadUniversalRules edges.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
	ROOT,
	type Rule,
	detectLang,
	globToRegExp,
	loadComponentsIndex,
	loadMechanicalRules,
	loadUniversalRules,
	matchSkill,
	runRules,
	safeRegExp,
} from './classify-edit-core'

const HOOK = resolve(ROOT, '.claude/hooks/classify-edit.ts')

async function runHook(stdin: string): Promise<{ exitCode: number; stdout: string }> {
	const proc = Bun.spawn(['bun', HOOK], {
		stdin: Buffer.from(stdin),
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...process.env, CLASSIFY_EDIT_RUNNING: '0' },
	})
	const exitCode = await proc.exited
	const stdout = await new Response(proc.stdout).text()
	return { exitCode, stdout }
}

function contextOf(stdout: string): string {
	const parsed = JSON.parse(stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } }
	expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse')
	return parsed.hookSpecificOutput.additionalContext
}

// ─── 1. PARITY — spawned hook against synthetic PostToolUse payloads ───

describe('hook parity', () => {
	test('Write with `as any` in a backend usecase file → universal as-any finding', async () => {
		const { exitCode, stdout } = await runHook(
			JSON.stringify({
				tool_name: 'Write',
				tool_input: {
					file_path: `${ROOT}/packages/api/typescript/src/catalog/usecases/CreateProduct.ts`,
					content: 'export class CreateProduct {\n\trun(result: object) {\n\t\tconst data = result as any\n\t\treturn data\n\t}\n}\n',
				},
			}),
		)
		expect(exitCode).toBe(0)
		const context = contextOf(stdout)
		expect(context).toStartWith('⚠️ EDIT-QUALITY — catalog/usecases/CreateProduct.ts matches registry bad-practices:')
		expect(context).toContain('• [as-any] `as any` discards all type safety — type it properly')
		expect(context).toEndWith('Fix the cause; do not cast/widen/suppress/fork-schema to dodge it.')
		expect(context).not.toContain('[as-unknown]')
	})

	test('Edit with z.nativeEnum + .extend in a react route → route bp-04, no universal finding', async () => {
		const { exitCode, stdout } = await runHook(
			JSON.stringify({
				tool_name: 'Edit',
				tool_input: {
					file_path: `${ROOT}/packages/app/react/src/routes/products/index.tsx`,
					new_string: 'const searchSchema = listProductsQuerySchema.extend({ status: z.nativeEnum(ProductStatus) })',
				},
			}),
		)
		expect(exitCode).toBe(0)
		const context = contextOf(stdout)
		expect(context).toStartWith('⚠️ EDIT-QUALITY — routes/products/index.tsx matches registry bad-practices:')
		expect(context).toContain('• [bp-04] Creating searchSchema without composing SDK schema')
		expect(context).not.toContain('[as-any]')
	})

	test('Edit with z.nativeEnum alone in a react route → flagged by universal cc-bp-16', async () => {
		// Was silent before v1.1: only cc-bp-04 loaded from cross_cutting_bad_practices, so the
		// nativeEnum detect was inert. Universal cc rules now all load — the hook flags it.
		const { exitCode, stdout } = await runHook(
			JSON.stringify({
				tool_name: 'Edit',
				tool_input: {
					file_path: `${ROOT}/packages/app/react/src/routes/products/index.tsx`,
					new_string: 'const statusSchema = z.nativeEnum(ProductStatus)',
				},
			}),
		)
		expect(exitCode).toBe(0)
		expect(stdout).toContain('cc-bp-16')
	})

	test('MultiEdit joins new_strings — @ts-expect-error in a component → ts-expect-error finding', async () => {
		const { exitCode, stdout } = await runHook(
			JSON.stringify({
				tool_name: 'MultiEdit',
				tool_input: {
					file_path: `${ROOT}/packages/app/react/src/routes/products/-components/ProductList/index.tsx`,
					edits: [{ new_string: '// @ts-expect-error legacy' }, { new_string: 'const y = 2' }],
				},
			}),
		)
		expect(exitCode).toBe(0)
		expect(contextOf(stdout)).toContain('• [ts-expect-error] @ts-expect-error suppresses the error instead of fixing its cause')
	})

	test('clean payload → exit 0, no output', async () => {
		const { exitCode, stdout } = await runHook(
			JSON.stringify({
				tool_name: 'Edit',
				tool_input: { file_path: `${ROOT}/packages/app/react/src/routes/products/index.tsx`, new_string: 'const x = 1' },
			}),
		)
		expect(exitCode).toBe(0)
		expect(stdout).toBe('')
	})

	test('malformed stdin → exit 0, no output, never blocks', async () => {
		const { exitCode, stdout } = await runHook('not json {{{')
		expect(exitCode).toBe(0)
		expect(stdout).toBe('')
	})

	test('out-of-scope files (tests, .claude, non-TS) → silent even with violations', async () => {
		for (const file_path of [
			`${ROOT}/packages/api/typescript/src/catalog/usecases/CreateProduct.test.ts`,
			`${ROOT}/.claude/hooks/some-hook.ts`,
			`${ROOT}/packages/app/react/README.md`,
		]) {
			const { exitCode, stdout } = await runHook(
				JSON.stringify({ tool_name: 'Write', tool_input: { file_path, content: 'const data = x as any\n' } }),
			)
			expect(exitCode).toBe(0)
			expect(stdout).toBe('')
		}
	})
})

// ─── 2. REGEX AUDIT — every mechanical detect/detect_skip in the repo must compile ───

function collectRegistryFiles(): string[] {
	const files = [resolve(ROOT, '.claude/registry.yaml')]
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir)) {
			const path = join(dir, entry)
			if (statSync(path).isDirectory()) walk(path)
			else if (entry === 'registry.yaml') files.push(path)
		}
	}
	walk(resolve(ROOT, '.claude/skills'))
	return files
}

describe('regex audit', () => {
	test('every mechanical:true detect/detect_skip regex across all registries compiles', () => {
		const failures: string[] = []
		const registries = collectRegistryFiles()
		expect(registries.length).toBeGreaterThan(1)

		for (const file of registries) {
			let doc: unknown
			try {
				doc = parseYaml(readFileSync(file, 'utf8'))
			} catch (err) {
				failures.push(`${relative(ROOT, file)}: YAML parse failed — ${err}`)
				continue
			}
			// Recursive visit: mechanical rules live under bad_practices,
			// cross_cutting_bad_practices, or any future section.
			const visit = (node: unknown) => {
				if (Array.isArray(node)) {
					for (const item of node) visit(item)
					return
				}
				if (node == null || typeof node !== 'object') return
				const obj = node as Record<string, unknown>
				if (obj.mechanical === true) {
					for (const key of ['detect', 'detect_skip'] as const) {
						const raw = obj[key]
						const patterns = Array.isArray(raw) ? raw : raw != null ? [raw] : []
						for (const pattern of patterns) {
							try {
								new RegExp(String(pattern))
							} catch (err) {
								failures.push(`${relative(ROOT, file)} [${obj.id}] ${key}: ${JSON.stringify(String(pattern))} — ${err}`)
							}
						}
					}
				}
				for (const value of Object.values(obj)) visit(value)
			}
			visit(doc)
		}
		expect(failures).toEqual([])
	})
})

// ─── 3. UNIT — core engine pieces ───

describe('detectLang', () => {
	test('workspace containment routes every DECLARED workspace to its lang (manifest closure: a stamp with a subset selection must pass too)', async () => {
		// Derive cases from the manifest instead of enumerating the full universe — a stamped
		// repo ships only its kept workspaces, and this gate must hold inside ANY valid stamp.
		const { REPO } = await import(join(ROOT, 'template.config.ts'))
		const SAMPLE_BY_LANG: Record<string, string> = {
			typescript: 'src/sample/entities/Sample.ts',
			go: 'internal/sample/usecases/run.go',
			react: 'src/lib/sample.ts',
			astro: 'src/components/Hero.tsx',
		}
		for (const ws of Object.values(REPO.workspaces) as { pkgRoot: string; lang: string }[]) {
			const sample = SAMPLE_BY_LANG[ws.lang]
			if (sample === undefined) continue
			expect(detectLang(`${ROOT}/${ws.pkgRoot}/${sample}`)).toBe(ws.lang)
		}
	})

	test('extension fallbacks outside every workspace root', () => {
		expect(detectLang('src/pages/index.astro')).toBe('astro') // .astro is astro anywhere
		expect(detectLang('Standalone.tsx')).toBe('react') // bare .tsx falls back to react
		expect(detectLang('script.ts')).toBe('typescript') // everything else falls back to typescript
	})
})

describe('globToRegExp', () => {
	test('single * does not cross path segments', () => {
		const re = globToRegExp('packages/api/typescript/src/*/entities/*.ts')!
		expect(re.test('packages/api/typescript/src/catalog/entities/Product.ts')).toBe(true)
		expect(re.test('packages/api/typescript/src/catalog/entities/sub/Product.ts')).toBe(false)
		expect(re.test('packages/api/typescript/src/a/b/entities/Product.ts')).toBe(false)
	})

	test('**/ matches zero or more segments', () => {
		const re = globToRegExp('packages/app/react/src/routes/**/-components/*/index.tsx')!
		expect(re.test('packages/app/react/src/routes/-components/Foo/index.tsx')).toBe(true) // zero segments
		expect(re.test('packages/app/react/src/routes/a/-components/Foo/index.tsx')).toBe(true)
		expect(re.test('packages/app/react/src/routes/a/b/c/-components/Foo/index.tsx')).toBe(true)
		expect(re.test('packages/app/react/src/routes/a/-components/Foo/Bar/index.tsx')).toBe(false)
	})

	test('trailing ** matches everything below', () => {
		const re = globToRegExp('packages/api/typescript/src/ui/**')!
		expect(re.test('packages/api/typescript/src/ui/usecases/deep/GetDashboard.ts')).toBe(true)
		expect(re.test('packages/api/typescript/src/catalog/usecases/Create.ts')).toBe(false)
	})

	test('regex metacharacters in globs are escaped', () => {
		const re = globToRegExp('packages/app/react/src/routes/(app)/**/*.tsx')!
		expect(re.test('packages/app/react/src/routes/(app)/profile/edit.tsx')).toBe(true)
		expect(re.test('packages/app/react/src/routes/app/profile/edit.tsx')).toBe(false)
	})

	test('end-anchored but not start-anchored (absolute paths match)', () => {
		const re = globToRegExp('packages/contracts/db/schema/*.ts')!
		expect(re.test(`${ROOT}/packages/contracts/db/schema/orders.ts`)).toBe(true)
		expect(re.test(`${ROOT}/packages/contracts/db/schema/orders.ts.bak`)).toBe(false)
	})
})

describe('matchSkill (real components index)', () => {
	const components = loadComponentsIndex()

	test('routes backend artifacts', () => {
		expect(matchSkill(`${ROOT}/packages/api/typescript/src/catalog/usecases/CreateProduct.ts`, components)).toEqual({
			skill: 'usecase',
			artifact: 'usecase',
		})
		expect(matchSkill(`${ROOT}/packages/api/typescript/src/catalog/entities/Product.ts`, components)).toEqual({
			skill: 'entity',
			artifact: 'entity',
		})
	})

	test('negative glob: ui/** BFF usecases route to query, not usecase', () => {
		expect(matchSkill(`${ROOT}/packages/api/typescript/src/ui/usecases/GetDashboard.ts`, components)).toEqual({
			skill: 'query',
			artifact: 'query',
		})
	})

	test('negative glob: !*/index.ts barrels match nothing', () => {
		expect(matchSkill(`${ROOT}/packages/api/typescript/src/catalog/entities/index.ts`, components)).toBeNull()
	})

	test('longest positive pattern wins: Form > Section > component', () => {
		const base = `${ROOT}/packages/app/react/src/routes/products/-components`
		expect(matchSkill(`${base}/ProductForm/index.tsx`, components)?.skill).toBe('form')
		expect(matchSkill(`${base}/ProductListSection/index.tsx`, components)).toEqual({ skill: 'component', artifact: 'section' })
		expect(matchSkill(`${base}/ProductList/index.tsx`, components)).toEqual({ skill: 'component', artifact: 'component' })
	})

	test('unrouted file → null', () => {
		expect(matchSkill(`${ROOT}/packages/app/react/src/lib/format.ts`, components)).toBeNull()
	})
})

describe('safeRegExp', () => {
	test('compiles valid patterns, null for invalid', () => {
		expect(safeRegExp('\\bas\\s+any\\b')).toBeInstanceOf(RegExp)
		expect(safeRegExp('([')).toBeNull()
	})
})

describe('runRules', () => {
	const rule = (over: Partial<Rule>): Rule => ({
		id: 'r1',
		rule: 'no foo',
		skill: 'test-skill',
		severity: 'error',
		detect: [/\bfoo\b/],
		skip: [],
		...over,
	})

	test('detect hit yields {id, rule, skill}', () => {
		expect(runRules([rule({})], 'const foo = 1')).toEqual([{ id: 'r1', rule: 'no foo', skill: 'test-skill' }])
	})

	test('no detect hit yields nothing', () => {
		expect(runRules([rule({})], 'const bar = 1')).toEqual([])
	})

	test('detect_skip is whole-text: any skip match suppresses the rule', () => {
		const r = rule({ skip: [/sanctioned/] })
		expect(runRules([r], 'foo here')).toHaveLength(1)
		expect(runRules([r], 'foo here\n// sanctioned elsewhere')).toEqual([])
	})

	test('empty skip never suppresses', () => {
		expect(runRules([rule({ skip: [] })], 'foo')).toHaveLength(1)
	})
})

describe('loadUniversalRules (registry-driven via cc-bp-04)', () => {
	test('keeps the legacy ids for the cast set, plus every other mechanical cc rule', () => {
		const rules = loadUniversalRules()
		const ids = rules.map(r => r.id)
		// cc-bp-04's patterns keep their legacy per-pattern ids
		for (const legacy of ['as-any', 'as-never', 'as-unknown', 'eslint-disable', 'ts-expect-error', 'ts-ignore']) {
			expect(ids).toContain(legacy)
		}
		// every OTHER mechanical cross_cutting_bad_practices entry loads under its own cc id
		for (const cc of ['cc-bp-16', 'cc-bp-20', 'cc-bp-21']) expect(ids).toContain(cc)
		for (const r of rules.filter(x => !x.id.startsWith('cc-'))) {
			expect(r.skill).toBe('universal')
			expect(r.detect).toHaveLength(1)
			// cc-bp-04 deliberately has NO detect_skip — whole-text skip would let a sanctioned
			// `as const` anywhere in the edit suppress a real `as any` hit.
			expect(r.skip).toHaveLength(0)
		}
	})

	test('flags banned casts, never flags sanctioned casts', () => {
		const rules = loadUniversalRules()
		expect(runRules(rules, 'const data = x as any').map(f => f.id)).toEqual(['as-any'])
		expect(runRules(rules, 'const cols = [1, 2] as const')).toEqual([])
		expect(runRules(rules, "throw new BaseError('X' as DomainErrors)")).toEqual([])
	})

	test('sanctioned cast in the same edit does NOT suppress a banned cast', () => {
		// cc-bp-04 carries no detect_skip (whole-text skip would mask real hits) — the detect
		// regexes themselves never match sanctioned casts, so both behaviors hold at once.
		const rules = loadUniversalRules()
		expect(runRules(rules, 'const cols = [1] as const\nconst data = x as any').map(f => f.id)).toEqual(['as-any'])
	})
})

describe('loadMechanicalRules', () => {
	test('universal set first, then skill + one level of context_reads, deduped', () => {
		const rules = loadMechanicalRules('route', 'react')
		const universalIds = loadUniversalRules().map(r => r.id)
		expect(rules.slice(0, universalIds.length).map(r => r.id)).toEqual(universalIds)
		// route/react/registry.yaml bp-04 (.extend) + context_reads [component] rules present
		expect(rules.some(r => r.skill === 'route' && r.id === 'bp-04')).toBe(true)
		expect(rules.some(r => r.skill === 'component')).toBe(true)
		// deduped by <skill>::<id>
		const keys = rules.map(r => `${r.skill}::${r.id}`)
		expect(new Set(keys).size).toBe(keys.length)
	})
})
