/**
 * TypeScript client generator — Kubb pipeline + per-service Client class + aggregate.
 * Flat pipeline: discoverApis → preprocessSpec → buildPlan → runKubb → emitServiceClient → emitAggregateClient.
 */
import { REPO } from '../../../template.config'
import path from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { safeBuild } from '@kubb/core'
import { pluginOas } from '@kubb/plugin-oas'
import { pluginTs } from '@kubb/plugin-ts'
import { pluginZod } from '@kubb/plugin-zod'
import { pluginReactQuery } from '@kubb/plugin-react-query'
import { pluginClient } from '@kubb/plugin-client'
import { discoverApis, type ApiSource } from '../lib/discover'
import { preprocessSpec } from '../lib/preprocess'
import { renderServiceClient, renderAggregateClient, type ServiceMeta } from '../lib/render/typescript'

const repoRoot = path.resolve(import.meta.dirname, '../../..')
const distRoot = path.resolve(import.meta.dirname, '../dist/typescript/src')

interface Plan {
	source: ApiSource
	preprocessedSpecPath: string
	outputRoot: string
	generateHooks: boolean
}

/**
 * Normalize the emitted JSON Schema for two `@kubb/*` quirks before kubb reads it.
 * TS-only: Go's oapi-codegen handles both forms, so it's left untouched.
 *
 * 1. `const` → single-value `enum`. Zod's `toJSONSchema` emits `z.literal(x)` as
 *    `{ const: x }`, but `const` is a JSON-Schema-2020 / OpenAPI-3.1 keyword —
 *    not valid 3.0 (which this spec is, per preprocess R-01). `@kubb/plugin-ts`
 *    renders a bare `const` by widening to its base type (`string`/`boolean`),
 *    collapsing literal discriminants to `string`; it renders a single-value
 *    `enum` as a TS literal. Rewriting `{ const: x }` → `{ enum: [x] }` makes the
 *    spec valid 3.0 and restores literal types — which is what lets the frontend
 *    narrow a discriminated union (e.g. PlatformRegistrySchema's
 *    connectionMode/type/platform).
 *
 * 2. Empty `anyOf`/`oneOf`/`allOf` → dropped (leaving a permissive schema). An
 *    empty `z.tuple([])` (e.g. the `scopes` of a non-OAuth platform descriptor)
 *    serializes to `{ type: 'array', items: { anyOf: [] }, maxItems: 0 }`. That
 *    `{ anyOf: [] }` is a degenerate empty union; `@kubb/plugin-zod` resolves it
 *    to no element schema and emits `z.array().min(0).max(0)` — invalid, since
 *    `z.array()` needs an element. Stripping the empty combinator leaves `{}`
 *    (= any), so kubb emits `z.array(z.any())…` and compiles. The array is
 *    `maxItems: 0` anyway, so the element type is never exercised at runtime.
 */
function normalizeForKubb(node: unknown): void {
	if (!node || typeof node !== 'object') return
	if (Array.isArray(node)) {
		for (const child of node) normalizeForKubb(child)
		return
	}
	const obj = node as Record<string, unknown>
	if ('const' in obj && !('enum' in obj)) {
		obj.enum = [obj.const]
		delete obj.const
	}
	for (const combinator of ['anyOf', 'oneOf', 'allOf'] as const) {
		if (Array.isArray(obj[combinator]) && (obj[combinator] as unknown[]).length === 0) {
			delete obj[combinator]
		}
	}
	for (const value of Object.values(obj)) normalizeForKubb(value)
}

async function preprocessAll(sources: ApiSource[]): Promise<Plan[]> {
	const plans: Plan[] = []
	for (const source of sources) {
		const { spec, skippedSse } = await preprocessSpec(source.specPath)
		normalizeForKubb(spec)
		const tmp = path.join(repoRoot, 'tmp', `client-ts-${source.service}.openapi.json`)
		await mkdir(path.dirname(tmp), { recursive: true })
		await writeFile(tmp, JSON.stringify(spec))
		const hasPaths = Object.keys((spec.paths ?? {}) as object).length > 0
		console.log(`[${source.service}] preprocessed (sse skipped: ${skippedSse}, paths: ${hasPaths ? 'yes' : 'no'})`)
		plans.push({
			source,
			preprocessedSpecPath: tmp,
			outputRoot: path.join(distRoot, source.service),
			generateHooks: hasPaths,
		})
	}
	return plans
}

/**
 * Per-service ky-based http wrapper. Lives alongside the Kubb output so the
 * generated client functions import via a short relative path. The wrapper
 * is a 2-line file that binds the shared ky core to this service's name so
 * `resolveURL` can look up the correct base URL from the registry.
 */
async function writeServiceHttp(plan: Plan): Promise<void> {
	const file = path.join(plan.outputRoot, '_http.ts')
	await mkdir(plan.outputRoot, { recursive: true })
	const body = [
		`// AUTO-GENERATED — do not edit. Bound to the '${plan.source.service}' service.`,
		`import { createClient } from '../http'`,
		`export default createClient('${plan.source.service}')`,
		`export type { Client, RequestConfig, ResponseConfig, ResponseErrorConfig } from '../http'`,
		``,
	].join('\n')
	await writeFile(file, body)
}

function buildKubbConfig(plan: Plan) {
	const httpImport = `${REPO.sdkPackage}/${plan.source.service}/_http`
	// Flat output across all four Kubb subdirs. We don't group by tag because the
	// fallback for untagged operations is the literal string "undefined", which is
	// uglier than a single flat namespace per service.
	const plugins = [
		pluginOas({ generators: [], validate: false }),
		// enumType `asPascalConst`: `export const XEnum = {…} as const` + a same-named union type. PascalCase
		// names (`OperationalCostFlowEnum.DEBIT`) so call sites read like a TS enum WITHOUT the nominality.
		// Real TS `enum`s were tried and reverted: string enums are NOMINAL, so string literals
		// (`'EXAMPLE_KIND'`, `data.kind === 'SINGLE_GLOBAL'` discriminated-union narrowing) stop being
		// assignable, and a boolean-valued enum (ListPlatformDescriptors) isn't even a legal TS enum
		// (TS18033). The `as const` object stays iterable (`Object.values(XEnum)`) and union-compatible.
		// Requires @kubb/plugin-ts >= 4.20.4 (PR #2429) so the barrel value-exports the merged const+type
		// instead of `export type` (which dropped the runtime value → TS1362). We are on 4.37.9.
		pluginTs({ enumType: 'asPascalConst', output: { path: path.join(plan.outputRoot, 'types'), barrelType: 'named' } }),
		...(plan.generateHooks
			? [
					pluginZod({ output: { path: path.join(plan.outputRoot, 'zod'), barrelType: 'named' } }),
					pluginReactQuery({
						output: { path: path.join(plan.outputRoot, 'hooks'), barrelType: 'named' },
						client: { importPath: httpImport },
					}),
					pluginClient({ output: { path: path.join(plan.outputRoot, 'client'), barrelType: 'named' }, importPath: httpImport }),
				]
			: []),
	]
	return {
		config: {
			root: repoRoot,
			input: { path: plan.preprocessedSpecPath },
			output: { path: plan.outputRoot, barrelType: 'named' as const, clean: false },
			plugins,
		},
	}
}

async function runKubb(plan: Plan): Promise<void> {
	const result = await safeBuild(buildKubbConfig(plan))
	if (result.failedPlugins.size > 0) {
		for (const { plugin, error } of result.failedPlugins) {
			console.error(`[${plan.source.service}] ${plugin.name} failed:`, error)
		}
		throw new Error(`[${plan.source.service}] Kubb generation failed`)
	}
}

/**
 * Extract value-export function names from the root service index.ts whose
 * source paths start with `./client/`. These are the Kubb-generated HTTP
 * client functions that the ServiceClient class will wrap.
 *
 * Kubb with `group: { type: 'tag' }` emits tag-grouped subdirs under `client/`
 * instead of a flat `client/index.ts`. We read the root barrel to discover
 * function names and their actual relative paths, then synthesize the
 * `client/index.ts` barrel that `renderServiceClient` expects (it imports
 * `from './client'`).
 */
interface ClientExport {
	name: string
	from: string
}

async function readClientExports(plan: Plan): Promise<ClientExport[]> {
	const text = await Bun.file(path.join(plan.outputRoot, 'index.ts')).text()
	const exports: ClientExport[] = []
	const re = /^export \{ (\w+) \} from "(\.\/client\/.+)";$/gm
	for (const m of text.matchAll(re)) exports.push({ name: m[1]!, from: m[2]! })
	return exports
}

async function writeClientBarrel(plan: Plan, exports: ClientExport[]): Promise<void> {
	const lines = exports.map(e => `export { ${e.name} } from '${e.from.replace(/^\.\/client\//, './')}'`)
	await writeFile(path.join(plan.outputRoot, 'client', 'index.ts'), `${lines.join('\n')}\n`)
}

async function emitServiceClient(plan: Plan): Promise<void> {
	if (!plan.generateHooks) return
	const exports = await readClientExports(plan)
	await writeClientBarrel(plan, exports)
	const meta: ServiceMeta = { source: plan.source, clientFunctionNames: exports.map(e => e.name) }
	// On case-insensitive filesystems (macOS) `./client` would resolve to Client.ts; force explicit path.
	const code = renderServiceClient(meta).replace("} from './client'\n", "} from './client/index.ts'\n")
	await writeFile(path.join(plan.outputRoot, 'Client.ts'), code)
}

async function emitAggregateClient(plans: Plan[]): Promise<void> {
	const metas: ServiceMeta[] = plans.filter(p => p.generateHooks).map(p => ({ source: p.source, clientFunctionNames: [] }))
	const code = renderAggregateClient(metas)
	await writeFile(path.join(distRoot, 'index.ts'), code)
}

async function main(): Promise<void> {
	console.log('client-typescript generator')
	const sources = await discoverApis(repoRoot)
	if (sources.length === 0) {
		console.error('No api services discovered.')
		process.exit(1)
	}
	console.log('discovered:', sources.map(s => s.service).join(', '))

	const plans = await preprocessAll(sources)
	for (const plan of plans) {
		await writeServiceHttp(plan)
		console.log(`[${plan.source.service}] kubb running…`)
		await runKubb(plan)
		await emitServiceClient(plan)
	}
	await emitAggregateClient(plans)
	console.log('done.')
}

main()
