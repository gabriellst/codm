/**
 * plan-cmd.ts — Engine behind `bun cli graph plan <spec>` (Option A payload).
 *
 * Produces a JSON snapshot consumed by /plan Phase 0. The spec is parsed for
 * context only; the payload is derived entirely from the graph + skill
 * registries. No "Components Affected" parsing is needed — /plan Phase 1
 * (Domain Mapping) derives artifacts from User Stories + Decisions + AC.
 *
 * Payload shape (Option A):
 *   graphStats       — node/edge counts, kind histogram, context list
 *   registries       — pre-parsed skill registries (avoids re-parsing YAML in /plan)
 *   existingArtifacts — full graph snapshot, one entry per non-infra node
 *   contextHints     — per-context kind histogram for symmetry/asymmetry detection
 *   inconsistencies  — anomalies that may bias planning
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { deserializeGraph, type Graph, type SerializedGraph } from '../core/graph'
import { GRAPH_JSON, ROOT } from '../core/paths'
import { loadSkillRegistry } from '../core/review-query'
import { parseSpec } from './spec-parser'

// ── Option A payload type ──

export type PlanPayload = {
	graphStats: {
		nodeCount: number
		edgeCount: number
		byKind: Record<string, number>
		contexts: string[]
	}
	registries: Record<string, unknown>
	existingArtifacts: Array<{
		id: string
		kind: string
		context: string
		location: { file: string; line?: number }
		skill: string
	}>
	contextHints: Record<string, Record<string, number>>
	inconsistencies: Array<{
		kind: 'broken-edge' | 'orphan' | 'classification-mismatch' | string
		message: string
	}>
}

// ── Node kinds that map to skills (mirrors COMPONENT_TO_SKILL in review-query) ──

const KIND_TO_SKILL: Record<string, string> = {
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
	'di-registry': 'bounded-context',
	job: 'usecase',
	'sdk-operation': 'sdk',
	'sdk-hook': 'sdk',
	'sdk-type': 'sdk',
	'sdk-zod': 'sdk',
	'sdk-http': 'sdk',
	'sdk-enum': 'sdk',
	'sdk-error-enum': 'sdk',
}

// ── Skill registry loader (all skills) ──

function loadAllSkillRegistries(): Record<string, unknown> {
	const skillsDir = join(ROOT, '.claude/skills')
	if (!existsSync(skillsDir)) return {}
	const registries: Record<string, unknown> = {}
	try {
		const entries = readdirSync(skillsDir, { withFileTypes: true })
		for (const entry of entries) {
			if (!entry.isDirectory()) continue
			const skillName = entry.name
			const registryPath = join(skillsDir, skillName, 'registry.yaml')
			if (!existsSync(registryPath)) continue
			const loaded = loadSkillRegistry(skillName)
			if (loaded) {
				registries[skillName] = loaded
			} else {
				// Try raw YAML parse as fallback
				try {
					const raw = readFileSync(registryPath, 'utf8')
					registries[skillName] = parseYaml(raw)
				} catch {
					// Skip unparseable registries
				}
			}
		}
	} catch {
		// Skip if skills dir unreadable
	}
	return registries
}

// ── Graph loader ──

function loadGraph(): Graph {
	if (!existsSync(GRAPH_JSON)) {
		throw new Error(`graph.json not found at ${GRAPH_JSON}. Run \`bun cli graph build\` first.`)
	}
	const raw = readFileSync(GRAPH_JSON, 'utf8')
	return deserializeGraph(JSON.parse(raw) as SerializedGraph)
}

// ── Inconsistency detection ──

type Inconsistency = PlanPayload['inconsistencies'][number]

function detectInconsistencies(graph: Graph): Inconsistency[] {
	const out: Inconsistency[] = []
	const nodeIds = new Set(graph.nodes.keys())

	// Detect broken edges — edges pointing to non-existent nodes
	for (const edge of graph.edges) {
		if (!nodeIds.has(edge.from)) {
			out.push({
				kind: 'broken-edge',
				message: `Edge ${edge.id}: source node '${edge.from}' not found in graph`,
			})
		}
		if (!nodeIds.has(edge.to)) {
			out.push({
				kind: 'broken-edge',
				message: `Edge ${edge.id}: target node '${edge.to}' not found in graph`,
			})
		}
	}

	// Detect orphan nodes — nodes with no edges (neither incoming nor outgoing)
	const connected = new Set<string>()
	for (const edge of graph.edges) {
		connected.add(edge.from)
		connected.add(edge.to)
	}
	for (const [id, node] of graph.nodes) {
		// Only flag non-sdk, non-locale orphans (generated/infra nodes are orphans by design)
		if (!connected.has(id) && !id.startsWith('sdk:') && !id.startsWith('docs:')) {
			out.push({
				kind: 'orphan',
				message: `Node '${id}' (${node.kind}) has no edges — possible orphan`,
			})
		}
	}

	return out
}

// ── Context extraction ──

function extractContexts(graph: Graph): string[] {
	const contexts = new Set<string>()
	for (const node of graph.nodes.values()) {
		if (node.context) contexts.add(node.context)
	}
	return Array.from(contexts).sort()
}

// ── Context hints (per-context kind histogram) ──

function buildContextHints(graph: Graph): Record<string, Record<string, number>> {
	const hints: Record<string, Record<string, number>> = {}
	for (const node of graph.nodes.values()) {
		if (!node.context) continue
		const ctx = node.context
		if (!hints[ctx]) hints[ctx] = {}
		hints[ctx]![node.kind] = (hints[ctx]![node.kind] ?? 0) + 1
	}
	return hints
}

// ── Existing artifacts (full graph snapshot) ──

function buildExistingArtifacts(graph: Graph): PlanPayload['existingArtifacts'] {
	const artifacts: PlanPayload['existingArtifacts'] = []
	for (const node of graph.nodes.values()) {
		// Include all nodes that have a location (source-mapped to real files)
		if (!node.location) continue
		const skill = KIND_TO_SKILL[node.kind] ?? node.kind
		artifacts.push({
			id: node.id,
			kind: node.kind,
			context: node.context ?? '',
			location: {
				file: node.location.file,
				...(node.location.line !== undefined ? { line: node.location.line } : {}),
			},
			skill,
		})
	}
	// Sort by id for deterministic output
	return artifacts.sort((a, b) => a.id.localeCompare(b.id))
}

// ── Main function ──

export async function buildPlanPayload(specPath: string): Promise<PlanPayload> {
	// Read spec for context (not for component parsing — Option A drops that)
	const absSpecPath = specPath.startsWith('/') ? specPath : join(ROOT, specPath)
	if (existsSync(absSpecPath)) {
		const raw = readFileSync(absSpecPath, 'utf8')
		// Parse spec for context; result is available for future extension
		parseSpec(raw)
	}

	// Load graph
	const graph = loadGraph()

	// Build graphStats
	const contexts = extractContexts(graph)
	const graphStats: PlanPayload['graphStats'] = {
		nodeCount: graph.nodes.size,
		edgeCount: graph.edges.length,
		byKind: { ...graph.stats.nodesByKind },
		contexts,
	}

	// Load all skill registries
	const registries = loadAllSkillRegistries()

	// Build existingArtifacts
	const existingArtifacts = buildExistingArtifacts(graph)

	// Build contextHints
	const contextHints = buildContextHints(graph)

	// Detect inconsistencies
	const inconsistencies = detectInconsistencies(graph)

	return {
		graphStats,
		registries,
		existingArtifacts,
		contextHints,
		inconsistencies,
	}
}
