import { existsSync, readFileSync } from 'node:fs'
import { workspaceForFile } from './config'

// `service` is a coarse classifier kept for backward-compatible output. The
// polyglot graph uses `workspace` (workspace matrix id) for filtering; legacy
// queries that only care about "is this backend/frontend/sdk/etc." still work.
// `channel` is retained as a legacy alias of `api` until the Go adapter is
// relocated (Phase 3).
export type Service = 'api' | 'app' | 'sdk' | 'db' | 'docs' | 'contracts' | 'channel'

export type AuditTag = 'EXTRACTED' | 'INFERRED' | 'UNRESOLVED' | 'GENERATED'

export type NodeKind =
	// ── Backend domain layer ──
	| 'entity'
	| 'value-object'
	| 'enum'
	| 'enum-member'
	| 'error-code'
	// ── Backend application layer ──
	| 'usecase'
	| 'ui-query'
	| 'event'
	| 'integration-event'
	| 'handler'
	| 'service-interface'
	| 'service-impl'
	| 'agent'
	| 'agent-tool'
	| 'job'
	// ── Backend interface layer ──
	| 'controller'
	| 'middleware'
	| 'schema'
	| 'zod-schema'
	// ── Backend infrastructure ──
	| 'repository-interface'
	| 'repository-impl'
	| 'di-registry'
	| 'db-table'
	| 'db-relation'
	// ── Contracts (polyglot source of truth) ──
	| 'contract-enum'
	| 'contract-event'
	| 'contract-union' // cross-category discriminated union of contract-enum variants (e.g. Platform)
	| 'contract-table'
	// ── SDK ──
	| 'sdk-operation'
	| 'sdk-hook'
	| 'sdk-type'
	| 'sdk-zod'
	| 'sdk-http'
	| 'sdk-enum'
	| 'sdk-error-enum'
	// ── Generated code (leaf nodes for `dist/` and `contracts/generated/`) ──
	| 'generated-typescript'
	| 'generated-go'
	// ── Frontend ──
	| 'frontend-route'
	| 'frontend-route-search'
	| 'frontend-section'
	| 'frontend-component'
	| 'frontend-dialog'
	| 'frontend-ui-primitive'
	| 'frontend-store'
	| 'frontend-hook'
	| 'frontend-form'
	| 'frontend-label-map'
	| 'frontend-error-handler'
	| 'frontend-sdk-import'
	// ── i18n ──
	| 'locale-key'

export type EdgeKind =
	// ── Backend internal ──
	| 'orchestrates' // usecase → entity / value-object / service
	| 'composes' // entity → value-object/enum (property type composition)
	| 'depends-on-repo' // usecase → repository-interface
	| 'uses-schema' // controller → schema OR usecase → schema
	| 'defines-schema' // usecase → zod-schema (the input/output schemas exported from the usecase file)
	| 'wraps-usecase' // controller → usecase | agent-tool → usecase
	| 'raises-event' // entity-method | usecase → event
	| 'handles-event' // handler → event
	| 'publishes-integration-event' // handler → integration-event
	| 'binds-token' // di-registry → repo-interface ↔ repo-impl
	| 'reads-table' // ui-query | repository-impl → db-table
	| 'writes-table' // repository-impl → db-table
	| 'fk-references' // db-relation → db-table
	| 'belongs-to-context' // any → context (logical grouping)
	| 'throws-error' // usecase | entity → error-code
	| 'has-member' // enum → enum-member
	| 'has-variant' // contract-union → contract-enum (variant of the discriminated union)
	| 'has-tool' // agent → agent-tool
	| 'protects' // middleware → controller (applies in HTTP pipeline)
	| 'consumes-integration-event' // frontend → integration-event (SSE stream)
	// ── Contracts ──
	| 'implements-contract' // backend enum/event/entity → contract-* (inferred by name)
	| 'generated-from' // generated-* | sdk-* → source spec node (audit: GENERATED)
	// ── Cross-stack: backend → SDK ──
	| 'generates-sdk' // controller → sdk-operation
	| 'generates-sdk-zod' // schema | controller → sdk-zod
	| 'generates-sdk-type' // schema | controller → sdk-type
	| 'generates-sdk-enum' // enum → sdk-enum
	| 'generates-sdk-error' // error-code → sdk-error-enum
	| 'generates-sdk-hook' // sdk-operation → sdk-hook
	// ── Cross-stack: SDK → Frontend ──
	| 'consumes-sdk-hook' // section | dialog | form → sdk-hook
	| 'consumes-sdk-type' // section | component | form → sdk-type
	| 'consumes-sdk-zod' // form | route-search → sdk-zod
	| 'consumes-sdk-enum' // section | component | label-map → sdk-enum
	// ── Frontend internal ──
	| 'renders' // route → section, section → component, component → ui-primitive
	| 'opens-dialog' // section | component → dialog
	| 'reads-store' // section | component → store
	| 'uses-hook' // section | component → frontend-hook
	| 'mapped-in' // sdk-enum → label-map
	| 'references-label-map' // section | component → label-map
	| 'translates-via' // error-handler → locale-key
	| 'handles-error' // error-handler → sdk-error-enum
	| 'references-locale-key' // section | component | route → locale-key
	| 'validates-search-with' // route → route-search
	| 'composes-with' // route-search → sdk-zod
	| 'submits-via' // form → sdk-hook
	| 'validates-with' // form → sdk-zod
	// ── Cross-language concept link (opt-in via --cross-lang-concepts) ──
	| 'shares-concept' // api-typescript:sales:entity:Order ↔ api-go:sales:entity:Order

export interface Location {
	file: string // repo-relative
	line?: number
	column?: number
}

export interface NodeMetadata {
	[key: string]: unknown
}

export interface Node {
	id: string
	kind: NodeKind
	name: string
	/** Coarse classifier for legacy queries — derived from workspace.role. */
	service: Service
	/**
	 * Workspace matrix id (e.g. `api-typescript`, `app-react`, `contracts`).
	 * Optional during the rebuild — adapters fill it in their phase. Made
	 * required in Phase 9.
	 */
	workspace?: string
	context?: string
	location?: Location
	metadata?: NodeMetadata
}

export interface Edge {
	id: string
	from: string
	to: string
	kind: EdgeKind
	audit: AuditTag
	location?: Location
	metadata?: NodeMetadata
}

export interface Graph {
	version: string
	generatedAt: string
	nodes: Map<string, Node>
	edges: Edge[]
	stats: {
		nodesByKind: Record<string, number>
		edgesByKind: Record<string, number>
		nodesByWorkspace: Record<string, number>
	}
}

export interface AuditEntry {
	file: string
	line?: number
	severity: 'info' | 'warning' | 'error'
	code: 'UNRESOLVED_IMPORT' | 'UNRESOLVED_NODE' | 'MISSING_SDK_ARTIFACT' | 'ORPHAN' | 'DRIFT'
	message: string
	hint?: string
}

export interface AuditReport {
	version: string
	generatedAt: string
	entries: AuditEntry[]
	stats: {
		extracted: number
		inferred: number
		unresolved: number
	}
}

// ── ID builders (centralized so we never drift) ──

export function nodeId(parts: {
	/** Workspace matrix id (preferred). Falls back to `service` if absent. */
	workspace?: string
	service?: Service
	kind: NodeKind
	context?: string
	name: string
}): string {
	const head = parts.workspace ?? parts.service
	if (!head) throw new Error(`nodeId requires either workspace or service: ${JSON.stringify(parts)}`)
	const segments: string[] = [head]
	if (parts.context) segments.push(parts.context)
	segments.push(parts.kind, parts.name)
	return segments.join(':')
}

export function edgeId(from: string, kind: EdgeKind, to: string): string {
	return `${from}—[${kind}]→${to}`
}

export function localeKeyId(lang: string, dottedKey: string): string {
	return `docs:locale:${lang}:${dottedKey}`
}

/**
 * SDK node IDs. `flavor` is the SDK flavor (legacy: `app` | `api` |
 * `channel-app` | `channel-api`; polyglot: `client-typescript`
 * | `client-go`). Phase 6 swaps consumers to workspace ids; both forms are
 * accepted today.
 */
export function sdkId(parts: {
	flavor: string
	kind: 'sdk-operation' | 'sdk-hook' | 'sdk-type' | 'sdk-zod' | 'sdk-http' | 'sdk-enum' | 'sdk-error-enum'
	name: string
}): string {
	// Legacy IDs always lived under `sdk:<flavor>:...`; polyglot IDs use
	// `<client-workspace>:...`. Distinguish by whether the flavor starts with
	// the new client workspace prefix.
	if (parts.flavor.startsWith('client-')) {
		return `${parts.flavor}:${parts.kind}:${parts.name}`
	}
	return `sdk:${parts.flavor}:${parts.kind}:${parts.name}`
}

export function dbTableId(schema: string, table: string): string {
	return `db:${schema}:db-table:${table}`
}

export function contractId(kind: 'contract-enum' | 'contract-event' | 'contract-union' | 'contract-table', name: string): string {
	return `contracts:${kind}:${name}`
}

/**
 * Frontend route IDs. The polyglot rebuild scopes routes to a workspace, but
 * the original signature took only the repo-relative path (implicitly
 * `app-react`). Both forms work; pass the workspace id when emitting from a
 * non-react frontend.
 */
export function frontendRouteId(workspaceOrPath: string, repoRelativePath?: string): string {
	if (repoRelativePath === undefined) {
		// Legacy: single-arg call, defaults to the `app` namespace (matches
		// existing `app:frontend-route:...` IDs in the wild).
		const stripped = workspaceOrPath.replace(/\.(tsx?|astro)$/, '')
		return `app:frontend-route:${stripped}`
	}
	const stripped = repoRelativePath.replace(/\.(tsx?|astro)$/, '')
	return `${workspaceOrPath}:frontend-route:${stripped}`
}

// ── Graph mutation helpers ──

export function newGraph(): Graph {
	return {
		version: '2',
		generatedAt: new Date().toISOString(),
		nodes: new Map(),
		edges: [],
		stats: { nodesByKind: {}, edgesByKind: {}, nodesByWorkspace: {} },
	}
}

export function addNode(graph: Graph, node: Node): void {
	// Auto-derive workspace from location.file when the adapter didn't set one.
	// Lets legacy extractors keep working while the polyglot rebuild rolls out.
	if (!node.workspace && node.location?.file) {
		const ws = workspaceForFile(node.location.file)
		if (ws) node.workspace = ws.id
	}

	const existing = graph.nodes.get(node.id)
	if (existing) {
		// Merge metadata; later sources can enrich earlier nodes
		graph.nodes.set(node.id, {
			...existing,
			...node,
			metadata: { ...existing.metadata, ...node.metadata },
		})
		return
	}
	graph.nodes.set(node.id, node)
	graph.stats.nodesByKind[node.kind] = (graph.stats.nodesByKind[node.kind] ?? 0) + 1
	const ws = node.workspace ?? '(unknown)'
	graph.stats.nodesByWorkspace[ws] = (graph.stats.nodesByWorkspace[ws] ?? 0) + 1
}

export function addEdge(graph: Graph, edge: Edge): void {
	graph.edges.push(edge)
	graph.stats.edgesByKind[edge.kind] = (graph.stats.edgesByKind[edge.kind] ?? 0) + 1
}

export function hasNode(graph: Graph, id: string): boolean {
	return graph.nodes.has(id)
}

// ── JSON serialization ──

export interface SerializedGraph {
	version: string
	generatedAt: string
	stats: Graph['stats']
	nodes: Node[]
	edges: Edge[]
}

export function serializeGraph(graph: Graph): SerializedGraph {
	return {
		version: graph.version,
		generatedAt: graph.generatedAt,
		stats: graph.stats,
		nodes: Array.from(graph.nodes.values()).sort((a, b) => a.id.localeCompare(b.id)),
		edges: [...graph.edges].sort((a, b) => a.id.localeCompare(b.id)),
	}
}

export function deserializeGraph(json: SerializedGraph): Graph {
	const graph: Graph = {
		version: json.version,
		generatedAt: json.generatedAt,
		nodes: new Map(json.nodes.map(n => [n.id, n])),
		edges: json.edges,
		stats: {
			nodesByKind: json.stats.nodesByKind ?? {},
			edgesByKind: json.stats.edgesByKind ?? {},
			nodesByWorkspace: json.stats.nodesByWorkspace ?? {},
		},
	}
	return graph
}

export function loadGraphFromDisk(path: string): Graph | null {
	if (!existsSync(path)) return null
	const raw = readFileSync(path, 'utf8')
	return deserializeGraph(JSON.parse(raw) as SerializedGraph)
}
