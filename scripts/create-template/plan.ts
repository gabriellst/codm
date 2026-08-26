// scripts/create-template/plan.ts — the CANONICAL STAMP MODEL (B5, .plans/2026-07-21-post-critic-batch.md).
//
// ┌────────────────────────────────────────────────────────────────────────────────────────────┐
// │ create-template is a tiny COMPILER, not a pile of patch functions:                         │
// │                                                                                            │
// │   (REPO, StampSelection) ── planStamp (PURE) ──▶ StampPlan ── applyStamp ──▶ stamped dir   │
// │                                                                                            │
// │ planStamp derives EVERYTHING from template.config.ts REPO plus the declared relations      │
// │ below — set algebra over the workspace table, never an if on a name (CLAUDE.md §5). The    │
// │ plan is plain data: ordered copy rules, prune paths, JSON edits, line strips, manifest     │
// │ keep-sets, rendered files. applyStamp (apply.ts) is the ONE interpreter of that data — it  │
// │ has no knowledge of backends, frontends, languages, or env keys.                           │
// │                                                                                            │
// │ The transformation vocabulary is CLOSED — five primitives:                                 │
// │   CopyRule   ordered keep/skip path predicates for the recursive copy (first match wins)   │
// │   prune      repo-relative directories removed after the copy                              │
// │   JsonEdit   set / delete / dropUnder over parsed JSON documents                           │
// │   LineStrip  regex line removals over prose files (CLAUDE.md workspace-table rows)         │
// │   files      fully rendered file bodies (e.g. .env.example from the pruned env registry)   │
// │ plus the ManifestKeep sets interpreted by render-manifest.ts (MANIFEST CLOSURE: a stamped  │
// │ template.config.ts declares ONLY kept workspaces/env keys — the workspace-contract gate    │
// │ scripts/lib/repo-model.test.ts must pass INSIDE a stamp).                                  │
// │                                                                                            │
// │ Anything the model cannot classify (an unknown selection alias, a packageRoots key with no │
// │ declared owner) is a HARD ERROR — the model refuses to guess. Inevitable redeclarations    │
// │ (GENERATED_OUTPUT_DEPS mirrors path templates in template.config.ts) are GATED with        │
// │ negative fixtures in plan.test.ts.                                                        │
// └────────────────────────────────────────────────────────────────────────────────────────────┘
import { posix } from 'node:path'
import type { EnvDecl, Workspace } from '../../template.config'
import { renderEnvExample } from '../env/generate'

// ─── Model ──────────────────────────────────────────────────────────────────

/** The slice of REPO the planner consumes — structural, so tests can fabricate fixture repos. */
export interface RepoLike {
	workspaces: Record<string, Workspace>
	env: Record<string, EnvDecl>
	workspaceRoots: Record<string, string>
	packageRoots: Record<string, string>
}

export interface StampSelection {
	projectName: string
	/** Backend workspace ALIASES to keep — validated against the workspace table. */
	backends: readonly string[]
	/** Frontend workspace ALIASES to keep — validated against the workspace table. */
	frontends: readonly string[]
}

/** Ordered path rule for the recursive copy. First matching rule wins; no match = copy. */
export interface CopyRule {
	action: 'keep' | 'skip'
	/** Match when the absolute path CONTAINS this fragment. */
	contains?: string
	/** Match when the absolute path ENDS WITH this suffix. */
	endsWith?: string
	reason: string
}

export type JsonEdit =
	| { op: 'set'; path: readonly string[]; value: unknown }
	| { op: 'delete'; path: readonly string[] }
	/** Filter a string array: drop values equal to, or path-nested under, any of `roots`. */
	| { op: 'dropUnder'; path: readonly string[]; roots: readonly string[] }

export interface JsonPatch {
	/** Repo-relative file. Missing file = no-op (a pruned selection may have removed it). */
	file: string
	edits: readonly JsonEdit[]
}

export interface LineStrip {
	/** Repo-relative file. Missing file = no-op. */
	file: string
	/** Regex sources applied with the `m` flag — each match (a full line) is removed. */
	patterns: readonly string[]
}

export interface RenderedFile {
	path: string
	content: string
}

/** Keep-sets for the STAMP-MANAGED manifest blocks — interpreted by render-manifest.ts. */
export interface ManifestKeep {
	workspaces: readonly string[]
	workspaceRoots: readonly string[]
	packageRoots: readonly string[]
	env: readonly string[]
}

export interface StampPlan {
	projectName: string
	/** Workspace ids that ship — table order. */
	keptWorkspaces: readonly string[]
	copyRules: readonly CopyRule[]
	prune: readonly string[]
	jsonPatches: readonly JsonPatch[]
	lineStrips: readonly LineStrip[]
	files: readonly RenderedFile[]
	manifest: ManifestKeep
}

// ─── Declared relations (this repo's stamping decisions — data, not flow) ───

/** Root package.json script keys OWNED by a selectable workspace, by kind ({alias} interpolated).
 *  Dropping the workspace deletes exactly these keys. */
const ROOT_SCRIPT_OWNERSHIP: Record<'backend' | 'frontend' | 'shell', readonly string[]> = {
	backend: ['dev:api:{alias}', 'sdk:{alias}'],
	frontend: ['dev:app:{alias}'],
	shell: ['desktop:dev', 'desktop:sidecars', 'desktop:bundle', 'desktop:generate'],
}

/** Root scripts that only make sense while at least one workspace of the layer ships. */
const LAYER_SCRIPTS: readonly { layer: 'backend' | 'frontend'; scripts: readonly string[] }[] = [
	{ layer: 'backend', scripts: ['sdk', 'sdk:build', 'emit-openapi'] },
]

/** Shared workspaces that ship ONLY while a layer survives (client = the backends' SDK output). */
const SHIPS_WITH_LAYER: Record<string, 'backend' | 'frontend'> = { client: 'backend' }

// Aggregate-dev membership is DECLARED on the workspace (Workspace.devServer) — no local list.

/** contracts/package.json per-language wire codegen script — keyed by backend LANG ({lang}
 *  interpolated), because the codegen target dimension IS language, never an alias. */
const WIRE_SCRIPT = 'codegen:wire:{lang}'
const WIRE_AGGREGATE_EMPTY = 'echo "no codegen targets"'

/**
 * packageRoots entries that are per-language GENERATED OUTPUT paths (not workspaces): each maps to
 * the workspaces it depends on as `[hostWorkspace, backendWorkspace]` — the shared workspace whose
 * tree hosts the output, and the backend whose language the output is generated for. An entry
 * ships iff BOTH ship; when the backend is dropped its output dir is pruned from the stamp.
 * INEVITABLE REDECLARATION of the path templates in template.config.ts packageRoots — gated by
 * validateGeneratedOutputDeps (plan.test.ts, with negative fixtures).
 */
const GENERATED_OUTPUT_DEPS: Record<string, readonly [host: string, backend: string]> = {
	clientTsDist: ['client', 'apiTs'],
	clientGoDist: ['client', 'apiGo'],
	contractsGenTs: ['contracts', 'apiTs'],
	contractsGenGo: ['contracts', 'apiGo'],
}

/** Gate for the GENERATED_OUTPUT_DEPS redeclaration: presence parity (entry ⇔ all deps declared)
 *  and path agreement (hosted under deps[0].pkgRoot, suffixed by deps[1].lang). Returns drift
 *  messages — [] means the relation matches the manifest. */
export function validateGeneratedOutputDeps(repo: RepoLike): string[] {
	const drift: string[] = []
	for (const [key, [host, backend]] of Object.entries(GENERATED_OUTPUT_DEPS)) {
		const declared = repo.packageRoots[key]
		const hostWs = repo.workspaces[host]
		const backendWs = repo.workspaces[backend]
		if (declared === undefined) {
			if (hostWs && backendWs) drift.push(`${key}: absent from packageRoots though both deps (${host}, ${backend}) are declared`)
			continue
		}
		if (!hostWs || !backendWs) {
			drift.push(`${key}: declared in packageRoots but dep ${!hostWs ? host : backend} is not a workspace`)
			continue
		}
		if (!declared.startsWith(`${hostWs.pkgRoot}/`)) drift.push(`${key}: '${declared}' is not hosted under ${host} (${hostWs.pkgRoot})`)
		if (!declared.endsWith(`/${backendWs.lang}`)) drift.push(`${key}: '${declared}' is not the ${backendWs.lang} output of ${backend}`)
	}
	return drift
}

// ─── Selection universe ─────────────────────────────────────────────────────

const aliasesOf = (repo: RepoLike, kind: Workspace['kind']): string[] =>
	Object.values(repo.workspaces)
		.filter(w => w.kind === kind)
		.map(w => w.alias)

/** Backend selection tokens — workspace aliases (language is a workspace property, never a name). */
export const backendAliases = (repo: RepoLike): string[] => aliasesOf(repo, 'backend')
/** Frontend selection tokens — workspace aliases. */
export const frontendAliases = (repo: RepoLike): string[] => aliasesOf(repo, 'frontend')

function validateSelection(repo: RepoLike, selection: StampSelection): void {
	for (const [kind, picked] of [
		['backend', selection.backends],
		['frontend', selection.frontends],
	] as const) {
		const valid = new Set(aliasesOf(repo, kind))
		const unknown = picked.filter(a => !valid.has(a))
		if (unknown.length > 0) throw new Error(`unknown ${kind} selection token(s): ${unknown.join(', ')} (valid: ${[...valid].join(', ')})`)
	}
}

// ─── The planner ────────────────────────────────────────────────────────────

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function planStamp(repo: RepoLike, selection: StampSelection): StampPlan {
	validateSelection(repo, selection)
	const relationDrift = validateGeneratedOutputDeps(repo)
	if (relationDrift.length > 0)
		throw new Error(
			`GENERATED_OUTPUT_DEPS drifted from the manifest — fix the relation or template.config.ts:\n  ${relationDrift.join('\n  ')}`,
		)

	const entries = Object.entries(repo.workspaces)
	const selected = new Set([...selection.backends, ...selection.frontends])
	const layerAlive: Record<'backend' | 'frontend', boolean> = {
		backend: selection.backends.length > 0,
		frontend: selection.frontends.length > 0,
	}

	// Kept = selected backends/frontends + shared workspaces whose coupled layer (if any) survives
	// + shells iff every workspace they host (Workspace.requires) is kept.
	const isKept = ([id, w]: [string, Workspace]): boolean => {
		if (w.kind === 'shared') {
			const layer = SHIPS_WITH_LAYER[id]
			return layer === undefined || layerAlive[layer]
		}
		if (w.kind === 'shell') {
			const required = w.requires ?? []
			if (required.length === 0) throw new Error(`shell workspace '${id}' declares no requires — a shell must name the workspaces it hosts`)
			return required.every(rid => {
				const rw = repo.workspaces[rid]
				if (rw === undefined) throw new Error(`shell workspace '${id}' requires unknown workspace id '${rid}'`)
				return selected.has(rw.alias)
			})
		}
		return selected.has(w.alias)
	}
	const keptEntries = entries.filter(isKept)
	const droppedEntries = entries.filter(e => !isKept(e))
	const kept = keptEntries.map(([id]) => id)
	const keptSet = new Set(kept)

	// Refuse to guess: every workspaceRoots/packageRoots key must have a declared owner.
	for (const key of Object.keys(repo.workspaceRoots)) {
		if (!(key in repo.workspaces)) throw new Error(`workspaceRoots key '${key}' is not a workspace id — declare it in REPO.workspaces`)
	}
	for (const key of Object.keys(repo.packageRoots)) {
		if (!(key in repo.workspaces) && !(key in GENERATED_OUTPUT_DEPS))
			throw new Error(`packageRoots key '${key}' has no declared owner — add it to REPO.workspaces or GENERATED_OUTPUT_DEPS`)
	}

	// ── prune — dropped workspace trees, their generated outputs, and dead layer parents ──
	const prune: string[] = []
	for (const [, w] of droppedEntries) prune.push(w.pkgRoot)
	for (const [key, deps] of Object.entries(GENERATED_OUTPUT_DEPS)) {
		const declared = repo.packageRoots[key]
		if (declared !== undefined && deps.some(d => !keptSet.has(d))) prune.push(declared)
	}
	for (const layer of ['backend', 'frontend'] as const) {
		if (layerAlive[layer]) continue
		// Every workspace of the layer is gone — their parent dirs hold nothing live (this sweeps
		// non-workspace siblings like packages/app/styles, mirroring the historical behavior).
		for (const [, w] of entries) {
			if (w.kind === layer) prune.push(posix.dirname(w.pkgRoot))
		}
	}
	const prunedDirs = [...new Set(prune)]

	// ── copy rules — declared data over ONE matcher (apply.ts), derived values from REPO ──
	const clientRoot = repo.packageRoots.client
	const contractsRoot = repo.packageRoots.contracts
	const copyRules: CopyRule[] = [
		{ action: 'skip', contains: 'node_modules', reason: 'installed deps — never ship, even under whitelisted subtrees' },
		{ action: 'skip', contains: '/.git', reason: 'VCS state' },
		{
			action: 'skip',
			contains: '/.nx',
			reason:
				'nx state — workspace-data sqlite carries the SOURCE repo run db; inheriting it makes nx fail with a FOREIGN KEY ConstraintViolation in the stamp (P0 probe finding, 2026-07-21)',
		},
		{ action: 'skip', endsWith: '/coverage', reason: 'coverage output' },
		{ action: 'keep', endsWith: '/.env.example', reason: 'the one env file a stamp starts from' },
		{ action: 'skip', endsWith: '/.env', reason: "the maintainer's LIVE env never ships" },
		{ action: 'skip', contains: '/.env.', reason: 'env variants (.env.local, …) never ship' },
		{ action: 'skip', contains: '/.claude/worktrees', reason: 'in-flight worktrees of the source checkout' },
		...(clientRoot !== undefined
			? [{ action: 'keep', contains: `/${clientRoot}/dist`, reason: 'committed generated SDK workspaces — a stamp must install' } as const]
			: []),
		...(contractsRoot !== undefined
			? [{ action: 'keep', contains: `/${contractsRoot}/generated`, reason: 'committed contracts wire bindings' } as const]
			: []),
		{ action: 'skip', contains: '/dist/', reason: 'rebuildable output' },
		{ action: 'skip', endsWith: '/dist', reason: 'rebuildable output' },
	]

	// ── root package.json ──
	const rootEdits: JsonEdit[] = [
		{ op: 'set', path: ['name'], value: selection.projectName },
		{ op: 'dropUnder', path: ['workspaces'], roots: prunedDirs },
	]
	for (const [, w] of droppedEntries) {
		if (w.kind === 'shared') continue
		for (const tpl of ROOT_SCRIPT_OWNERSHIP[w.kind]) rootEdits.push({ op: 'delete', path: ['scripts', tpl.replace('{alias}', w.alias)] })
	}
	const nxProjectsOf = (from: readonly [string, Workspace][]): string[] =>
		from.flatMap(([, w]) => (w.nxProject === null ? [] : [w.nxProject]))
	const devProjects = nxProjectsOf(keptEntries.filter(([, w]) => w.devServer === 'aggregate'))
	rootEdits.push(
		devProjects.length > 0
			? { op: 'set', path: ['scripts', 'dev'], value: `nx run-many -t dev -p ${devProjects.join(',')} --parallel=${devProjects.length}` }
			: { op: 'delete', path: ['scripts', 'dev'] },
	)
	const apiProjects = nxProjectsOf(keptEntries.filter(([, w]) => w.kind === 'backend'))
	rootEdits.push(
		apiProjects.length > 0
			? {
					op: 'set',
					path: ['scripts', 'dev:api'],
					value: `nx run-many -t dev -p ${apiProjects.join(',')} --parallel=${apiProjects.length}`,
				}
			: { op: 'delete', path: ['scripts', 'dev:api'] },
	)
	for (const { layer, scripts } of LAYER_SCRIPTS) {
		if (!layerAlive[layer]) for (const s of scripts) rootEdits.push({ op: 'delete', path: ['scripts', s] })
	}

	// ── contracts package.json — wire codegen keyed by kept backend + SHELL langs ──
	// The Tauri shell (kind 'shell', lang 'rust') consumes the Rust wire crate, so its lang joins the
	// wire aggregate; a stamp that drops the shell (any hosted workspace gone) drops rust wire with it.
	const wireLangs = (from: readonly [string, Workspace][]): string[] => [
		...new Set(from.filter(([, w]) => w.kind === 'backend' || w.kind === 'shell').map(([, w]) => w.lang)),
	]
	const keptLangs = wireLangs(keptEntries)
	const droppedLangs = wireLangs(droppedEntries).filter(lang => !keptLangs.includes(lang))
	const contractsEdits: JsonEdit[] = [
		...droppedLangs.map((lang): JsonEdit => ({ op: 'delete', path: ['scripts', WIRE_SCRIPT.replace('{lang}', lang)] })),
		{
			op: 'set',
			path: ['scripts', 'codegen:wire'],
			value: keptLangs.map(lang => `bun run ${WIRE_SCRIPT.replace('{lang}', lang)}`).join(' && ') || WIRE_AGGREGATE_EMPTY,
		},
		{
			op: 'set',
			path: ['scripts', 'all'],
			value: 'bun run tsp:compile && bun run codegen:wire && bun run codegen:fixtures && bun run drizzle:generate',
		},
	]
	const jsonPatches: JsonPatch[] = [
		{ file: 'package.json', edits: rootEdits },
		...(contractsRoot !== undefined ? [{ file: `${contractsRoot}/package.json`, edits: contractsEdits }] : []),
	]

	// ── CLAUDE.md workspace-table rows of dropped workspaces ──
	const strippedRows = droppedEntries.filter(([, w]) => w.kind !== 'shared').map(([, w]) => w.pkgRoot)
	const lineStrips: LineStrip[] =
		strippedRows.length > 0 ? [{ file: 'CLAUDE.md', patterns: strippedRows.map(root => `^\\| \`${escapeRegex(root)}\`.*\\n`) }] : []

	// ── env registry — a key ships iff at least one kept consumer remains (pure set algebra),
	// OR it is declared `group: 'parked'` (EnvDecl's own contract: zero active consumers BY
	// DESIGN, ships in every stamp unconditionally — same posture as the literal 'compose'
	// consumer above, not a special case invented here) ──
	const keptConsumers = new Set<string>(['compose', ...kept])
	const keptEnvEntries = Object.entries(repo.env).filter(
		([, decl]) => decl.group === 'parked' || decl.consumers.some(c => keptConsumers.has(c)),
	)
	const keptEnv = keptEnvEntries.map(([key]) => key)
	const prunedEnv = Object.fromEntries(keptEnvEntries)

	// ── manifest closure keep-sets (render-manifest.ts) ──
	const manifest: ManifestKeep = {
		workspaces: kept,
		workspaceRoots: Object.keys(repo.workspaceRoots).filter(key => keptSet.has(key)),
		packageRoots: Object.keys(repo.packageRoots).filter(key =>
			key in GENERATED_OUTPUT_DEPS ? (GENERATED_OUTPUT_DEPS[key] as readonly string[]).every(d => keptSet.has(d)) : keptSet.has(key),
		),
		env: keptEnv,
	}

	return {
		projectName: selection.projectName,
		keptWorkspaces: kept,
		copyRules,
		prune: prunedDirs,
		jsonPatches,
		lineStrips,
		// .env.example is re-rendered from the pruned registry — the stamped `bun env:generate
		// --check` agrees because the stamped manifest's env block is pruned by the SAME predicate.
		files: [{ path: '.env.example', content: renderEnvExample(prunedEnv) }],
		manifest,
	}
}
