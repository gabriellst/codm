// Review-focused queries. Designed to be consumed by automated review pipelines:
// given changed files, return a structured payload with classification, deps,
// and skill registry context — eliminating the need for an agent to manually
// trace dependencies.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { ROOT } from './paths'
import { deserializeGraph, type Edge, type Location, type Node, type NodeKind, type SerializedGraph } from './graph'
import { loadIndex, neighborsOf, traverse, type FastQueryContext } from './index-cache'
import { classify } from '../registry/classifier'
import { GRAPH_JSON } from './paths'
import { workspaceForFile } from './config'

// Default cap for transitiveDownstream node lists. Routes / shared schemas
// routinely exceed this; capping replaces the long tail with `byKind` totals
// and a contract-first sample so the reviewer keeps the structural signal
// without paying for hundreds of leaf-consumer IDs.
export const DEFAULT_MAX_DOWNSTREAM = 50

// Edge target kinds whose changes propagate as breaking-contract signals.
// When transitiveDownstream is truncated, these IDs are sampled first so the
// reviewer always sees contract consumers before leaf components.
const CONTRACT_KINDS: ReadonlySet<NodeKind> = new Set<NodeKind>([
	'sdk-hook',
	'sdk-type',
	'sdk-operation',
	'sdk-zod',
	'zod-schema',
	'controller',
	'usecase',
	'frontend-form',
	'repository-interface',
	'service-interface',
	'integration-event',
	'event',
])

// ── Skill registry loader ──

export interface SkillRegistry {
	skill: string
	lang?: string
	dependsOn?: string[]
	dependedBy?: string[]
	contextReads?: string[]
	badPractices?: { id: string; name: string; severity?: string }[]
	patterns?: { name: string; when?: string; right?: string; wrong?: string }[]
	canonicalSnippet?: string
}

const COMPONENT_TO_SKILL: Record<string, string> = {
	entity: 'entity',
	'value-object': 'value-object',
	enum: 'enum',
	'error-code': 'errors',
	usecase: 'usecase',
	'ui-query': 'query',
	event: 'event',
	'integration-event': 'event',
	handler: 'handler',
	controller: 'controller',
	middleware: 'controller',
	schema: 'schema',
	'zod-schema': 'schema',
	'repository-interface': 'repository',
	'repository-impl': 'repository',
	'service-interface': 'service',
	'service-impl': 'service',
	'db-table': 'db-modelling',
	'frontend-route': 'route',
	'frontend-section': 'component',
	'frontend-component': 'component',
	'frontend-dialog': 'component',
	'frontend-form': 'form',
	'frontend-ui-primitive': 'primitive',
	'frontend-store': 'store',
	'frontend-hook': 'component',
	agent: 'usecase',
	'agent-tool': 'usecase',
}

const skillRegistryCache = new Map<string, SkillRegistry | null>()

/**
 * Load a skill registry. Prefers the per-language variant
 * (`<skill>/<lang>/registry.yaml`) when `lang` is supplied; falls back to the
 * flat `<skill>/registry.yaml`. Mirrors the dispatch model in scripts/review.ts.
 */
export function loadSkillRegistry(skillName: string, lang?: string): SkillRegistry | null {
	const cacheKey = lang ? `${skillName}@${lang}` : skillName
	if (skillRegistryCache.has(cacheKey)) return skillRegistryCache.get(cacheKey) ?? null
	const result = loadSkillRegistryFromDisk(skillName, lang)
	skillRegistryCache.set(cacheKey, result)
	return result
}

export function pickCanonicalSnippet(root: Record<string, unknown>): string | undefined {
	const snippet = root.snippet as { exemplar?: unknown } | undefined
	if (snippet && typeof snippet.exemplar === 'string') return snippet.exemplar
	if (typeof root.canonical_snippet === 'string') return root.canonical_snippet
	return undefined
}

function loadSkillRegistryFromDisk(skillName: string, lang?: string): SkillRegistry | null {
	const variantPath = lang ? join(ROOT, '.claude/skills', skillName, lang, 'registry.yaml') : null
	const flatPath = join(ROOT, '.claude/skills', skillName, 'registry.yaml')
	const path = variantPath && existsSync(variantPath) ? variantPath : flatPath
	if (!existsSync(path)) return null
	try {
		const raw = readFileSync(path, 'utf8')
		const doc = parseYaml(raw) as Record<string, unknown>
		// Skills may put data at the top level OR under a `registry:` wrapper
		const root = doc.registry && typeof doc.registry === 'object' ? (doc.registry as Record<string, unknown>) : doc
		return {
			skill: skillName,
			...(lang ? { lang } : {}),
			...(Array.isArray(root.depends_on) ? { dependsOn: root.depends_on as string[] } : {}),
			...(Array.isArray(root.depended_by) ? { dependedBy: root.depended_by as string[] } : {}),
			...(Array.isArray(root.context_reads) ? { contextReads: root.context_reads as string[] } : {}),
			...(Array.isArray(root.bad_practices)
				? {
						badPractices: (root.bad_practices as Record<string, unknown>[]).map(bp => ({
							id: String(bp.id ?? ''),
							name: String(bp.name ?? bp.title ?? ''),
							...(bp.severity ? { severity: String(bp.severity) } : {}),
						})),
					}
				: {}),
			...(Array.isArray(root.patterns)
				? {
						patterns: (root.patterns as Record<string, unknown>[]).map(p => ({
							name: String(p.name ?? p.id ?? ''),
							...(p.when ? { when: String(p.when) } : {}),
							...(p.right ? { right: String(p.right) } : {}),
							...(p.wrong ? { wrong: String(p.wrong) } : {}),
						})),
					}
				: {}),
			...(s => (s !== undefined ? { canonicalSnippet: s } : {}))(pickCanonicalSnippet(root)),
		}
	} catch {
		return null
	}
}

// ── Query context ──

let cachedContext: FastQueryContext | null = null

export function loadQueryContext(): FastQueryContext {
	if (cachedContext) return cachedContext
	if (!existsSync(GRAPH_JSON)) {
		throw new Error(`graph.json not found at ${GRAPH_JSON}. Run \`bun cli graph build\` first.`)
	}
	const graph = deserializeGraph(JSON.parse(readFileSync(GRAPH_JSON, 'utf8')) as SerializedGraph)
	const index = loadIndex()
	if (!index) {
		throw new Error(`index.json missing. Run \`bun cli graph build\` to generate it.`)
	}
	cachedContext = { graph, index }
	return cachedContext
}

// ── Per-file review payload ──

// Slim peer projection — only the fields the reviewer needs to navigate
// to the upstream/downstream node ("which file is this, what kind of
// artifact is it"). Drops `name` (derivable from id), `service`
// (derivable from id prefix), and `metadata` (extractor internals).
export interface SlimPeer {
	id: string
	kind: NodeKind
	context?: string
	location?: Location
}

// Capped/summarized downstream impact. When `nodes.length` would have
// exceeded the cap, `truncated` is true, `nodes`/`edges` hold a
// contract-first sample, `count` is the real total, and `byKind` gives a
// full kind histogram so the reviewer keeps the structural picture.
export interface DownstreamSummary {
	nodes: string[]
	edges: string[]
	count: number
	truncated: boolean
	byKind?: Record<string, number>
}

export interface ReviewFileResult {
	file: string
	nodes: Array<{
		node: Node
		skill: string | null
		/** Per-language skill registry to load (e.g. `typescript`, `go`). */
		skillLang?: string
		incoming: Edge[]
		outgoing: Edge[]
		incomingResolved: Array<{ edge: Edge; peer: SlimPeer | null }>
		outgoingResolved: Array<{ edge: Edge; peer: SlimPeer | null }>
		transitiveDownstream: DownstreamSummary
		transitiveUpstream: { nodes: string[]; edges: string[] }
	}>
}

function toSlimPeer(node: Node | null | undefined): SlimPeer | null {
	if (!node) return null
	return {
		id: node.id,
		kind: node.kind,
		...(node.context ? { context: node.context } : {}),
		...(node.location ? { location: node.location } : {}),
	}
}

function summarizeDownstream(ctx: FastQueryContext, traversal: { nodes: string[]; edges: string[] }, cap: number): DownstreamSummary {
	const total = traversal.nodes.length
	if (total <= cap) {
		return { nodes: traversal.nodes, edges: traversal.edges, count: total, truncated: false }
	}
	const byKind: Record<string, number> = {}
	const contractIds: string[] = []
	const otherIds: string[] = []
	for (const id of traversal.nodes) {
		const peer = ctx.graph.nodes.get(id)
		const kind = peer?.kind ?? 'unknown'
		byKind[kind] = (byKind[kind] ?? 0) + 1
		if (peer && CONTRACT_KINDS.has(peer.kind)) {
			contractIds.push(id)
		} else {
			otherIds.push(id)
		}
	}
	const sampledNodes = [...contractIds, ...otherIds].slice(0, cap)
	const keep = new Set(sampledNodes)
	// Edges that originate from kept nodes — preserved so the reviewer can still
	// trace why each sampled node is in the downstream set.
	const sampledEdges = traversal.edges.filter(eid => {
		const fromId = eid.split('--')[0] ?? ''
		return keep.has(fromId)
	})
	return {
		nodes: sampledNodes,
		edges: sampledEdges,
		count: total,
		truncated: true,
		byKind,
	}
}

export interface ReviewFileOptions {
	depth?: number
	maxDownstream?: number
}

export function reviewFile(ctx: FastQueryContext, file: string, depthOrOptions: number | ReviewFileOptions = 3): ReviewFileResult {
	const opts: Required<ReviewFileOptions> =
		typeof depthOrOptions === 'number'
			? { depth: depthOrOptions, maxDownstream: DEFAULT_MAX_DOWNSTREAM }
			: { depth: depthOrOptions.depth ?? 3, maxDownstream: depthOrOptions.maxDownstream ?? DEFAULT_MAX_DOWNSTREAM }

	const normalized = file.startsWith('/') ? file.replace(`${ROOT}/`, '') : file
	const ids = ctx.index.byFile[normalized] ?? []
	const nodes: ReviewFileResult['nodes'] = []
	const fileLang = workspaceForFile(normalized)?.lang
	for (const id of ids) {
		const node = ctx.graph.nodes.get(id)
		if (!node) continue
		// Prefer the classifier (path-based) but fall back to the node's kind so
		// non-TS workspaces (go) still get a skill name.
		const cls = classify(normalized)
		const skillName = (cls && COMPONENT_TO_SKILL[cls.kind]) ?? COMPONENT_TO_SKILL[node.kind] ?? null
		const { incoming, outgoing } = neighborsOf(ctx, id)
		nodes.push({
			node,
			skill: skillName,
			...(fileLang ? { skillLang: fileLang } : {}),
			incoming,
			outgoing,
			incomingResolved: incoming.map(edge => ({ edge, peer: toSlimPeer(ctx.graph.nodes.get(edge.from)) })),
			outgoingResolved: outgoing.map(edge => ({ edge, peer: toSlimPeer(ctx.graph.nodes.get(edge.to)) })),
			transitiveDownstream: summarizeDownstream(ctx, traverse(ctx, id, 'downstream', opts.depth), opts.maxDownstream),
			transitiveUpstream: traverse(ctx, id, 'upstream', opts.depth),
		})
	}
	return { file: normalized, nodes }
}

// ── Diff-driven review ──

export function changedFilesFromDiff(ref: string): string[] {
	// Use git via Bun.spawn — synchronous-ish via spawnSync would be cleaner but
	// we already have access to Bun.spawn at runtime; the CLI command will pass
	// pre-resolved files, so this helper is a fallback.
	const proc = Bun.spawnSync(['git', 'diff', '--name-only', `${ref}..HEAD`], { cwd: ROOT })
	if (proc.exitCode !== 0) return []
	const text = proc.stdout.toString().trim()
	return text
		? text
				.split('\n')
				.map(s => s.trim())
				.filter(Boolean)
		: []
}

export function changedFilesUnstaged(): string[] {
	const proc = Bun.spawnSync(['git', 'diff', '--name-only', 'HEAD'], { cwd: ROOT })
	if (proc.exitCode !== 0) return []
	const text = proc.stdout.toString().trim()
	return text
		? text
				.split('\n')
				.map(s => s.trim())
				.filter(Boolean)
		: []
}

export interface ReviewBatchResult {
	rootDir: string
	generatedAt: string
	// Skill registries used by any file in this batch, keyed by skill name.
	// Each `files[i].nodes[j].skill` references into this map — registries
	// are emitted once instead of being inlined per file.
	registries: Record<string, SkillRegistry>
	files: ReviewFileResult[]
	summary: {
		totalFiles: number
		filesWithGraphNodes: number
		nodesTouched: number
		blastRadius: number // unique downstream nodes (real total, not capped sample)
	}
}

export interface ReviewBatchOptions {
	depth?: number
	maxDownstream?: number
}

export function reviewBatch(ctx: FastQueryContext, files: string[], depthOrOptions: number | ReviewBatchOptions = 3): ReviewBatchResult {
	const opts: Required<ReviewBatchOptions> =
		typeof depthOrOptions === 'number'
			? { depth: depthOrOptions, maxDownstream: DEFAULT_MAX_DOWNSTREAM }
			: { depth: depthOrOptions.depth ?? 3, maxDownstream: depthOrOptions.maxDownstream ?? DEFAULT_MAX_DOWNSTREAM }

	const results: ReviewFileResult[] = []
	const blast = new Set<string>()
	const registries: Record<string, SkillRegistry> = {}
	let nodesTouched = 0
	let withGraphNodes = 0

	for (const file of files) {
		const result = reviewFile(ctx, file, opts)
		results.push(result)
		if (result.nodes.length > 0) {
			withGraphNodes++
			nodesTouched += result.nodes.length
			for (const n of result.nodes) {
				if (n.skill) {
					const key = n.skillLang ? `${n.skill}@${n.skillLang}` : n.skill
					if (!registries[key]) {
						const reg = loadSkillRegistry(n.skill, n.skillLang)
						if (reg) registries[key] = reg
					}
				}
				// blastRadius reports the real downstream total even when sampled.
				blast.add(n.node.id)
				for (const downstream of n.transitiveDownstream.nodes) blast.add(downstream)
			}
		}
	}
	return {
		rootDir: ROOT,
		generatedAt: new Date().toISOString(),
		registries,
		files: results,
		summary: {
			totalFiles: files.length,
			filesWithGraphNodes: withGraphNodes,
			nodesTouched,
			blastRadius: blast.size,
		},
	}
}

// ── Payload measurement ──

export interface ReviewBatchMeasurement {
	totalBytes: number
	totalTokensApprox: number
	sections: Array<{
		name: string
		bytes: number
		pct: number
		tokensApprox: number
		note?: string
	}>
	registries: {
		bytes: number
		uniqueSkills: string[]
	}
	truncatedNodes: Array<{ id: string; kept: number; total: number; bytesSaved: number }>
	largestFiles: Array<{ file: string; bytes: number }>
	hotNodes: Array<{ id: string; kind: string; transitiveDownstreamCount: number; transitiveUpstreamCount: number }>
}

const TOKEN_RATIO = 4 // rough JSON chars-per-token heuristic

function jsonBytes(value: unknown): number {
	return Buffer.byteLength(JSON.stringify(value) ?? 'null', 'utf8')
}

export function measureReviewBatch(batch: ReviewBatchResult): ReviewBatchMeasurement {
	const sectionTotals: Record<string, number> = {
		registries: jsonBytes(batch.registries),
		node: 0,
		skill: 0,
		incoming: 0,
		outgoing: 0,
		incomingResolved: 0,
		outgoingResolved: 0,
		transitiveDownstream: 0,
		transitiveUpstream: 0,
	}

	const fileSizes: Array<{ file: string; bytes: number }> = []
	const hotNodes: ReviewBatchMeasurement['hotNodes'] = []
	const truncatedNodes: ReviewBatchMeasurement['truncatedNodes'] = []

	for (const file of batch.files) {
		let fileBytes = 0
		for (const n of file.nodes) {
			const nodeBytes = jsonBytes(n.node)
			const skillBytes = jsonBytes(n.skill)
			const incomingBytes = jsonBytes(n.incoming)
			const outgoingBytes = jsonBytes(n.outgoing)
			const incomingResolvedBytes = jsonBytes(n.incomingResolved)
			const outgoingResolvedBytes = jsonBytes(n.outgoingResolved)
			const downstreamBytes = jsonBytes(n.transitiveDownstream)
			const upstreamBytes = jsonBytes(n.transitiveUpstream)

			sectionTotals.node += nodeBytes
			sectionTotals.skill += skillBytes
			sectionTotals.incoming += incomingBytes
			sectionTotals.outgoing += outgoingBytes
			sectionTotals.incomingResolved += incomingResolvedBytes
			sectionTotals.outgoingResolved += outgoingResolvedBytes
			sectionTotals.transitiveDownstream += downstreamBytes
			sectionTotals.transitiveUpstream += upstreamBytes

			hotNodes.push({
				id: n.node.id,
				kind: n.node.kind,
				transitiveDownstreamCount: n.transitiveDownstream.count,
				transitiveUpstreamCount: n.transitiveUpstream.nodes.length,
			})

			if (n.transitiveDownstream.truncated) {
				// Estimate bytes saved: assume each elided ID averages the same length as kept IDs.
				const kept = n.transitiveDownstream.nodes.length
				const total = n.transitiveDownstream.count
				const avgIdBytes = kept > 0 ? n.transitiveDownstream.nodes.reduce((s, id) => s + id.length + 3, 0) / kept : 0
				const elided = Math.max(0, total - kept)
				truncatedNodes.push({ id: n.node.id, kept, total, bytesSaved: Math.round(elided * avgIdBytes) })
			}

			fileBytes +=
				nodeBytes +
				skillBytes +
				incomingBytes +
				outgoingBytes +
				incomingResolvedBytes +
				outgoingResolvedBytes +
				downstreamBytes +
				upstreamBytes
		}
		fileSizes.push({ file: file.file, bytes: fileBytes })
	}

	const totalBytes = jsonBytes(batch)
	const sections = Object.entries(sectionTotals)
		.map(([name, bytes]) => ({
			name,
			bytes,
			pct: totalBytes > 0 ? (bytes / totalBytes) * 100 : 0,
			tokensApprox: Math.round(bytes / TOKEN_RATIO),
		}))
		.sort((a, b) => b.bytes - a.bytes)

	return {
		totalBytes,
		totalTokensApprox: Math.round(totalBytes / TOKEN_RATIO),
		sections,
		registries: {
			bytes: sectionTotals.registries ?? 0,
			uniqueSkills: Object.keys(batch.registries).sort(),
		},
		truncatedNodes: truncatedNodes.sort((a, b) => b.bytesSaved - a.bytesSaved).slice(0, 10),
		largestFiles: fileSizes.sort((a, b) => b.bytes - a.bytes).slice(0, 10),
		hotNodes: hotNodes.sort((a, b) => b.transitiveDownstreamCount - a.transitiveDownstreamCount).slice(0, 10),
	}
}

export function formatMeasurement(m: ReviewBatchMeasurement): string {
	const lines: string[] = []
	const fmtBytes = (n: number) => `${(n / 1024).toFixed(1)} KB`
	const fmtTokens = (n: number) => `~${n.toLocaleString()} tok`

	lines.push(`# Review Payload Measurement`)
	lines.push(`Total: ${fmtBytes(m.totalBytes)}  ·  ${fmtTokens(m.totalTokensApprox)} (approx, JSON @ ~4 chars/tok)`)
	lines.push('')
	lines.push(`## By Section`)
	lines.push(`field                       bytes        %       tokens`)
	for (const s of m.sections) {
		lines.push(
			`  ${s.name.padEnd(26)} ${fmtBytes(s.bytes).padStart(10)}  ${s.pct.toFixed(1).padStart(5)}%  ${fmtTokens(s.tokensApprox).padStart(12)}`,
		)
	}
	lines.push('')
	lines.push(`## Top-level registries (deduped)`)
	lines.push(
		`  ${fmtBytes(m.registries.bytes)} for ${m.registries.uniqueSkills.length} skill(s): ${m.registries.uniqueSkills.join(', ') || '(none)'}`,
	)
	lines.push('')
	if (m.truncatedNodes.length > 0) {
		lines.push(`## Truncated downstream samples`)
		lines.push(`  kept/total   est. bytes saved   node`)
		for (const t of m.truncatedNodes) {
			lines.push(`  ${(`${t.kept}/${t.total}`).padStart(10)}    ${fmtBytes(t.bytesSaved).padStart(10)}      ${t.id}`)
		}
		lines.push('')
	}
	lines.push(`## Largest Files`)
	for (const f of m.largestFiles) {
		lines.push(`  ${fmtBytes(f.bytes).padStart(10)}  ${f.file}`)
	}
	lines.push('')
	lines.push(`## Hottest Nodes (by transitive downstream count)`)
	lines.push(`  ↓down  ↑up    node`)
	for (const h of m.hotNodes) {
		lines.push(`  ${String(h.transitiveDownstreamCount).padStart(5)}  ${String(h.transitiveUpstreamCount).padStart(5)}   ${h.id}`)
	}
	return `${lines.join('\n')}\n`
}

// ── Pretty text formatter for human consumption ──

export function formatReviewBatch(batch: ReviewBatchResult): string {
	const lines: string[] = []
	lines.push(`# Graph Review Context`)
	lines.push(`Generated: ${batch.generatedAt}`)
	lines.push(`Files: ${batch.summary.totalFiles} (${batch.summary.filesWithGraphNodes} mapped to graph nodes)`)
	lines.push(`Nodes touched: ${batch.summary.nodesTouched} · Blast radius: ${batch.summary.blastRadius} downstream nodes`)
	lines.push('')

	for (const file of batch.files) {
		lines.push(`## ${file.file}`)
		if (file.nodes.length === 0) {
			lines.push(`  (no graph nodes — likely a non-source file or unclassified)`)
			lines.push('')
			continue
		}
		for (const n of file.nodes) {
			lines.push(`### ${n.node.id}`)
			lines.push(`  kind: ${n.node.kind}${n.node.context ? ` · context: ${n.node.context}` : ''}`)
			if (n.skill) lines.push(`  skill: ${n.skill}`)
			const registry = n.skill ? batch.registries[n.skill] : undefined
			if (registry?.badPractices?.length) {
				lines.push(`  bad practices to check (${registry.badPractices.length}):`)
				for (const bp of registry.badPractices.slice(0, 8)) {
					lines.push(`    · ${bp.id}${bp.severity ? ` [${bp.severity}]` : ''}: ${bp.name}`)
				}
			}
			if (n.incoming.length > 0) {
				lines.push(`  ↑ ${n.incoming.length} dependents (upstream)`)
				for (const r of n.incomingResolved.slice(0, 6)) {
					lines.push(`    ← [${r.edge.kind}] ${r.edge.from}`)
				}
				if (n.incoming.length > 6) lines.push(`    … and ${n.incoming.length - 6} more`)
			}
			if (n.outgoing.length > 0) {
				lines.push(`  ↓ ${n.outgoing.length} dependencies (downstream direct)`)
				for (const r of n.outgoingResolved.slice(0, 6)) {
					lines.push(`    → [${r.edge.kind}] ${r.edge.to}`)
				}
				if (n.outgoing.length > 6) lines.push(`    … and ${n.outgoing.length - 6} more`)
			}
			const td = n.transitiveDownstream
			const downstreamLabel = td.truncated
				? `${td.count} downstream (sample of ${td.nodes.length} shown, contract-first)`
				: `${td.count} downstream`
			lines.push(`  transitive impact (3 hops): ${downstreamLabel}, ${n.transitiveUpstream.nodes.length} upstream`)
			if (td.truncated && td.byKind) {
				const kindSummary = Object.entries(td.byKind)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 6)
					.map(([k, v]) => `${k}: ${v}`)
					.join(', ')
				lines.push(`    by kind: ${kindSummary}`)
			}
			lines.push('')
		}
	}
	return lines.join('\n')
}
