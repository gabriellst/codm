/**
 * Rust client generator. Discovers apis, preprocesses specs, builds the codegen binary
 * once, then invokes it per service to emit per-service mod.rs files. Finally renders
 * the aggregate lib.rs (mod decls + Client + ClientBuilder).
 *
 * Enum dedup (rust-wire spec §F4): contract enums are NOT regenerated in the client —
 * the codegen binary receives a replacements map (contract enum name → path in
 * `codedm_contracts_rust`) so client and wire binding share ONE type per contract enum.
 *
 * No Cargo workspace is involved (spec §F6): the helper crate and the dist crate are
 * standalone; cargo runs via --manifest-path.
 */
import fs from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseContractsOpenapi } from '../../../contracts/codegen/lib/parse-openapi'
import { discoverApis, type ApiSource } from '../../lib/discover'
import { assertClientDistRoot } from '../../lib/output-root'
import { preprocessSpec } from '../../lib/preprocess'
import { renderLibRs, type ServiceMeta } from '../../lib/render/rust'

const repoRoot = path.resolve(import.meta.dir, '../../../..')
const distRoot = assertClientDistRoot(path.resolve(import.meta.dir, '../../dist/rust/src'))
const codegenManifest = path.join(import.meta.dir, 'codegen/Cargo.toml')
const contractsSpec = path.join(repoRoot, 'packages/contracts/dist/contracts.openapi.yaml')

interface Plan {
	source: ApiSource
	preprocessedSpecPath: string
	moduleDir: string
	outFile: string
}

/**
 * Progenitor 0.10 quirk (asserted at method.rs:1197): a SPECIFIC 2xx (200/201) plus
 * `default` both enter the success filter — two response types → panic. (It only pops
 * `default` after a RANGE "2XX".) Rewriting `default` → "4XX" + "5XX" keeps the error
 * envelope TYPED (ranges are error-filtered) instead of dropping it. Rust-generator-local
 * on purpose: kubb/oapi-codegen consume `default` fine, so the shared preprocess must not
 * change shape for them.
 */
function splitDefaultResponses(spec: Record<string, unknown>): void {
	const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>
	for (const pathItem of Object.values(paths)) {
		if (!pathItem || typeof pathItem !== 'object') continue
		for (const op of Object.values(pathItem)) {
			if (!op || typeof op !== 'object') continue
			const responses = (op as Record<string, unknown>).responses as Record<string, unknown> | undefined
			if (!responses?.default) continue
			const hasSpecificSuccess = Object.keys(responses).some(s => /^2\d\d$/.test(s))
			if (!hasSpecificSuccess) continue
			for (const range of ['4XX', '5XX']) {
				if (!(range in responses)) responses[range] = responses.default
			}
			delete responses.default
		}
	}
}

/** Contract enum name → fully-qualified path in the wire crate. */
async function contractEnumReplacements(): Promise<Record<string, string>> {
	const yamlText = await readFile(contractsSpec, 'utf-8')
	const parsed = parseContractsOpenapi(yamlText)
	return Object.fromEntries(parsed.enums.map(e => [e.name, `codedm_contracts_rust::wire::enums::${e.name}`]))
}

async function preprocessAll(sources: ApiSource[]): Promise<Plan[]> {
	const plans: Plan[] = []
	for (const source of sources) {
		const { spec } = await preprocessSpec(source.specPath)
		splitDefaultResponses(spec)
		const tmp = path.join(repoRoot, 'tmp', `client-rust-${source.service}.openapi.json`)
		await mkdir(path.dirname(tmp), { recursive: true })
		await writeFile(tmp, JSON.stringify(spec))
		const moduleDir = path.join(distRoot, source.service)
		await mkdir(moduleDir, { recursive: true })
		plans.push({ source, preprocessedSpecPath: tmp, moduleDir, outFile: path.join(moduleDir, 'mod.rs') })
	}
	return plans
}

function writeStubModFile(plan: Plan): void {
	fs.writeFileSync(
		plan.outFile,
		`//! Stub — overwritten by codegen.\npub struct Client;\nimpl Client { pub fn new_with_client(_url: &str, _http: reqwest::Client) -> Self { Self } }\n`,
	)
}

async function buildCodegenBin(): Promise<void> {
	const proc = Bun.spawn(['cargo', 'build', '--bin', 'rust-codegen', '--release', '--manifest-path', codegenManifest], {
		cwd: repoRoot,
		stdout: 'inherit',
		stderr: 'inherit',
	})
	const exit = await proc.exited
	if (exit !== 0) throw new Error(`cargo build (rust-codegen) exited ${exit}`)
}

async function runProgenitorFor(plan: Plan, replacementsPath: string): Promise<void> {
	const proc = Bun.spawn(
		[
			'cargo',
			'run',
			'--bin',
			'rust-codegen',
			'--release',
			'--manifest-path',
			codegenManifest,
			'--quiet',
			'--',
			plan.preprocessedSpecPath,
			plan.outFile,
			replacementsPath,
		],
		{ cwd: repoRoot, stdout: 'pipe', stderr: 'inherit' },
	)
	const exit = await proc.exited
	if (exit !== 0) throw new Error(`[${plan.source.service}] rust-codegen exited ${exit}`)
}

async function emitAggregateLibRs(plans: Plan[]): Promise<void> {
	const metas: ServiceMeta[] = plans.map(p => ({ source: p.source }))
	await writeFile(path.join(distRoot, 'lib.rs'), renderLibRs(metas))
}

async function main(): Promise<void> {
	console.log('client-rust generator')
	const sources = await discoverApis(repoRoot)
	if (sources.length === 0) {
		console.error('No api services discovered.')
		process.exit(1)
	}
	console.log('discovered:', sources.map(s => s.service).join(', '))

	const replacements = await contractEnumReplacements()
	const replacementsPath = path.join(repoRoot, 'tmp', 'client-rust-replacements.json')
	await mkdir(path.dirname(replacementsPath), { recursive: true })
	await writeFile(replacementsPath, JSON.stringify({ enums: replacements }, null, '\t'))

	const plans = await preprocessAll(sources)
	for (const plan of plans) writeStubModFile(plan)
	await emitAggregateLibRs(plans)
	await buildCodegenBin()
	for (const plan of plans) {
		console.log(`[${plan.source.service}] progenitor running…`)
		await runProgenitorFor(plan, replacementsPath)
	}
	await emitAggregateLibRs(plans) // re-emit in case the service set changed
	console.log('done.')
}

main()
