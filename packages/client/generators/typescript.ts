/**
 * TypeScript client generator — Kubb pipeline + per-service Client class + aggregate.
 * Flat pipeline: discoverApis → preprocessSpec → buildPlan → runKubb → emitServiceClient → emitAggregateClient.
 */
import { REPO } from '../../../template.config'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import { safeBuild } from '@kubb/core'
import { pluginOas } from '@kubb/plugin-oas'
import { pluginTs } from '@kubb/plugin-ts'
import { pluginZod } from '@kubb/plugin-zod'
import { pluginReactQuery } from '@kubb/plugin-react-query'
import { pluginClient } from '@kubb/plugin-client'
import { pluginMcp } from '@kubb/plugin-mcp'
import { discoverApis, type ApiSource } from '../lib/discover'
import { assertClientDistRoot } from '../lib/output-root'
import { preprocessSpec } from '../lib/preprocess'
import { renderServiceClient, renderAggregateClient, type ServiceMeta } from '../lib/render/typescript'

/** Escape a scope name for embedding in the anchored tag RegExp — a scope is ours, but the anchor is the point. */
function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const repoRoot = path.resolve(import.meta.dirname, '../../..')
const distRoot = assertClientDistRoot(path.resolve(import.meta.dirname, '../dist/typescript/src'))

interface Plan {
	source: ApiSource
	preprocessedSpecPath: string
	outputRoot: string
	generateHooks: boolean
	/**
	 * MCP scope → the operationIds declared under it, read from the `x-mcp-scope` vendor extension of
	 * the spec. Empty for every service that declares none (today: the Go gateway).
	 *
	 * THE SPEC IS THE CROSSING. The declaration is a TYPED MANIFEST in the api package
	 * (`src/agent/mcp/manifest.ts`, keyed by controller CLASS), and `packages/contracts` cannot import
	 * from `api/src` — so the manifest reaches Kubb through the emitted spec, written by the same
	 * emitter seam that already writes `x-error-codes`. There is no second list here: this is a READ.
	 */
	mcpScopes: Map<string, string[]>
}

/**
 * Collect `operationId`s by MCP scope from a preprocessed spec.
 *
 * Reads the vendor extension rather than the synthetic `mcp:<scope>` tag, deliberately: the extension
 * is the DECLARATION OF RECORD and the tag is only the transport Kubb can filter on. Reading the
 * transport to verify the transport would make the count assertion below tautological.
 */
function collectMcpScopes(spec: Record<string, unknown>): Map<string, string[]> {
	const scopes = new Map<string, string[]>()
	const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>
	for (const operations of Object.values(paths)) {
		for (const operation of Object.values(operations)) {
			if (!operation || typeof operation !== 'object') continue
			const record = operation as { operationId?: string; 'x-mcp-scope'?: unknown }
			const declared = record['x-mcp-scope']
			if (!Array.isArray(declared) || !record.operationId) continue
			for (const scope of declared as string[]) {
				const bucket = scopes.get(scope) ?? []
				bucket.push(record.operationId)
				scopes.set(scope, bucket)
			}
		}
	}
	return scopes
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
 *
 * 3. `x-enum-varnames` → dropped. The Go emitter (swaggo convention) attaches it
 *    so oapi-codegen can name Go constants; but under it `@kubb/plugin-ts`
 *    abandons the `asPascalConst` naming and emits the enum const with the SAME
 *    name as the type (no `Enum` suffix) — and the named barrel then exports the
 *    identifier twice (`export type { X }` + `export { X }`), a TS2300 on every
 *    annotated enum (20 in the gateway spec). Stripping restores the suffixed
 *    const path (`XEnum` + `type X`), identical to the typescript service output.
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
	delete obj['x-enum-varnames']
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
			mcpScopes: collectMcpScopes(spec as Record<string, unknown>),
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

	for (const scope of plan.mcpScopes.keys()) await writeMcpScopeHttp(plan, scope)
}

/**
 * The per-scope http shim — THE ONLY AUTH SEAM THAT EXISTS for a generated tool.
 *
 * Measured, not assumed: no generated handler takes a config or headers parameter
 * (`mcpGenerator` passes `isConfigurable={false}` to the shared client component), so the module named
 * by `client.importPath` is the single point where anything can be attached to a tool's outbound
 * request. That makes this file security-relevant rather than plumbing.
 *
 * It is NOT the ordinary service client. Two differences, both load-bearing:
 *  - it attaches the run token from the router's `AsyncLocalStorage`, which is what lets the daemon
 *    tell "issue A's agent" from "issue B's agent" on an inbound tool-driven write;
 *  - `requireMcpRunToken()` THROWS outside a router context, so a handler invoked directly cannot fall
 *    through to an anonymous request that the daemon would serve as itself. Swapping this shim for the
 *    plain service client is exactly the confused-deputy regression AC-6.19(c) forbids.
 *
 * `baseURL` is deliberately absent from the pluginMcp config, so the call site emits
 * `fetch({ method, url, data })` and the repo's own `resolveURL` registry still decides the host.
 */
async function writeMcpScopeHttp(plan: Plan, scope: string): Promise<void> {
	const dir = path.join(plan.outputRoot, `mcp-${scope}`)
	await mkdir(dir, { recursive: true })
	const body = `// AUTO-GENERATED — do not edit. MCP scope '${scope}' of the '${plan.source.service}' service.
//
// THE ONLY AUTH SEAM a generated tool has: the handlers take no config parameter, so this module is
// the single place a run token can be attached. It THROWS outside a router-established context rather
// than degrading to an anonymous request the daemon would serve with full operator authority.
import { createClient } from '../../http'
import { requireMcpRunToken, MCP_RUN_TOKEN_HEADER } from '../../mcp-run-context'
import type { Client, RequestConfig, ResponseConfig, ResponseErrorConfig } from '../../http'

const core = createClient('${plan.source.service}')

const client = async <TData, TError = unknown, TVariables = unknown>(
	config: RequestConfig<TVariables>,
): Promise<ResponseConfig<TData>> =>
	core<TData, TError, TVariables>({
		...config,
		headers: { ...(config.headers as Record<string, string> | undefined), [MCP_RUN_TOKEN_HEADER]: requireMcpRunToken() },
	})

export default client
export type { Client, RequestConfig, ResponseConfig, ResponseErrorConfig }
`
	await writeFile(path.join(dir, '_http.ts'), body)
}

/**
 * TWO POST-GENERATION FIXUPS, plus the assertion that keeps an empty tool surface from shipping green.
 *
 * (a) THE EMITTED SERVER TYPECHECKS BUT DOES NOT RUN. `serverGenerator` writes
 *     `import … from "@modelcontextprotocol/sdk/server/mcp"` with no `.js`. The SDK's exports map is
 *     `"./*": { types: ./dist/esm/*.d.ts, import: ./dist/esm/* }`, so `tsc` resolves through `types`
 *     (`mcp.d.ts` exists) while the RUNTIME resolver looks for `dist/esm/server/mcp`, which does not.
 *     A `tsc`-only gate would ship this green — which is why AC-6.16 pairs the fixup with a runtime
 *     smoke and why its falsifier reverts this rewrite and shows `bun tsc` still passing.
 *
 * (b) THE COUNT ASSERTION. A scope typo, an unsupported filter `type`, or a PascalCase `operationId`
 *     pattern all produce ZERO tools with `RESULT: build ok` and no warning (measured three ways).
 *     The agent would then simply have no tools and degrade silently into the inferred path — exactly
 *     the failure AC-6.4/AC-6.7 exist to distinguish from the declared one. So the generator counts
 *     what it emitted against what the spec declared, and THROWS.
 */
async function fixupAndVerifyMcpOutput(plan: Plan): Promise<void> {
	for (const [scope, operationIds] of plan.mcpScopes) {
		const dir = path.join(plan.outputRoot, `mcp-${scope}`)
		const serverFile = path.join(dir, 'server.ts')
		if (!existsSync(serverFile)) throw new Error(`[${plan.source.service}] mcp scope '${scope}' emitted no server.ts`)

		const original = await Bun.file(serverFile).text()
		const patched = original
			.replace(/@modelcontextprotocol\/sdk\/server\/mcp"/g, '@modelcontextprotocol/sdk/server/mcp.js"')
			.replace(/@modelcontextprotocol\/sdk\/server\/stdio"/g, '@modelcontextprotocol/sdk/server/stdio.js"')
		if (patched !== original) await writeFile(serverFile, patched)

		// Count `registerTool(` in the emitted server, not handler FILES: the server is what an MCP
		// client actually sees, and a handler file nobody registered would be an invisible tool.
		const registered = [...patched.matchAll(/registerTool\(\s*"([^"]+)"/g)].map(m => m[1]!)
		const expected = [...operationIds].sort()
		const actual = [...registered].sort()
		if (expected.length !== actual.length || expected.some((id, i) => id !== actual[i])) {
			throw new Error(
				`[${plan.source.service}] mcp scope '${scope}': the emitted tool surface does not match the manifest.\n` +
					`  declared in the spec (x-mcp-scope): ${expected.join(', ') || '(none)'}\n` +
					`  registered in server.ts:            ${actual.join(', ') || '(none)'}\n` +
					`  A zero-tool surface builds "ok" and degrades the agent silently — that is why this throws.`,
			)
		}
		console.log(`[${plan.source.service}] mcp scope '${scope}': ${actual.length} tools — ${actual.join(', ')}`)
	}
}

function buildKubbConfig(plan: Plan) {
	const httpImport = `${REPO.sdkPackage}/${plan.source.service}/_http`
	// Output paths must stay ABSOLUTE (plugin paths resolve against the global
	// output otherwise), and main() pins cwd to repoRoot: kubb relativizes absolute
	// outputs against `root` and resolves a subset of writes against the process
	// CWD — with cwd=packages/client that materialized a stray self-copy under
	// packages/client/packages/. main() asserts no stray tree post-generate.
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
		// ONE pluginMcp INSTANCE PER DECLARED SCOPE. Three properties of this block are load-bearing and
		// each was measured against the real spec:
		//
		//  1. `include` IS THE SECURITY BOUNDARY. Without it, ALL 40 operations became tools. The filter
		//     is fail-closed (`if (context.include && !isIncluded) return null`), so the allowlist is
		//     what keeps a controller born tomorrow out of a model's reach. Never omit it.
		//  2. THE PATTERN IS AN ANCHORED RegExp, NEVER A STRING. String patterns are UNANCHORED
		//     substring matches — `'mcp:issue'` matched the tag `mcp:issue-handling`, and a scope named
		//     `system` would match a tag `subsystem`. Filtering by `operationId` instead is a trap of
		//     its own: the matcher uses `getOperationId({ friendlyCase: true })` (camelCase), so our
		//     PascalCase ids silently match nothing.
		//  3. `barrelType: false` IS MANDATORY. With the default, the ROOT barrel re-exports
		//     `getServer/server/startServer` from BOTH scopes (TS2308) and injects every tool handler
		//     into the barrel the frontend app imports.
		//
		// `client.baseURL` is omitted on purpose — passing it inlines a literal host at every call site
		// and the repo's `resolveURL` registry stops deciding.
		...[...plan.mcpScopes.keys()].map(scope =>
			pluginMcp({
				output: { path: path.join(plan.outputRoot, `mcp-${scope}`), barrelType: false },
				include: [{ type: 'tag', pattern: new RegExp(`^mcp:${escapeRegExp(scope)}$`) }],
				client: { importPath: `${REPO.sdkPackage}/${plan.source.service}/mcp-${scope}/_http` },
			}),
		),
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
	process.chdir(repoRoot)
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
		await fixupAndVerifyMcpOutput(plan)
		await emitServiceClient(plan)
	}
	await emitAggregateClient(plans)
	const strays = [path.join(repoRoot, 'packages/client/packages'), ...plans.map(p => path.join(p.outputRoot, 'packages'))].filter(p =>
		existsSync(p),
	)
	if (strays.length > 0) throw new Error(`stray nested gen output at ${strays.join(', ')} — kubb wrote outside the dist root`)
	console.log('done.')
}

main()
