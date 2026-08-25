// Second pass: resolve INFERRED edges by name lookup, fix dangling targets,
// and emit derived cross-stack edges (entity↔table by context, controller→sdk-operation by operationId).

import type { AuditCollector } from '../core/audit'
import { addEdge, edgeId, type Edge, type Graph } from '../core/graph'

export interface ResolveStats {
	upgraded: number // INFERRED → EXTRACTED after we found the target
	pruned: number // edges dropped because target node truly doesn't exist
	derived: number // new edges added by inference
	rewired: number // edges retargeted to a better-matching node
}

interface NameIndex {
	byNameAndKind: Map<string, string[]> // key: `<kind>::<name>`, value: nodeIds
	byNameAcrossKinds: Map<string, string[]> // key: name, value: nodeIds
}

function buildNameIndex(graph: Graph): NameIndex {
	const byNameAndKind = new Map<string, string[]>()
	const byNameAcrossKinds = new Map<string, string[]>()
	for (const node of graph.nodes.values()) {
		const k1 = `${node.kind}::${node.name}`
		const k2 = node.name
		const arr1 = byNameAndKind.get(k1) ?? []
		arr1.push(node.id)
		byNameAndKind.set(k1, arr1)
		const arr2 = byNameAcrossKinds.get(k2) ?? []
		arr2.push(node.id)
		byNameAcrossKinds.set(k2, arr2)
	}
	return { byNameAndKind, byNameAcrossKinds }
}

export function resolve(graph: Graph, audit: AuditCollector): ResolveStats {
	const stats: ResolveStats = { upgraded: 0, pruned: 0, derived: 0, rewired: 0 }
	const index = buildNameIndex(graph)

	// PASS 0 — Expand placeholders to real targets BEFORE the prune sweep, so the
	// expanded edges survive. Placeholder edges themselves get pruned afterwards
	// (their target is a synthetic id that never exists as a node).
	expandLocalePrefixPlaceholders(graph, stats)
	expandSsePlaceholders(graph, stats)

	const nextEdges: Edge[] = []
	for (const edge of graph.edges) {
		let fromId = edge.from
		let toId = edge.to

		// Retarget source if missing
		if (!graph.nodes.has(fromId)) {
			const inferredFrom = inferTarget(fromId, index, graph)
			if (inferredFrom) {
				fromId = inferredFrom
				stats.rewired++
			} else {
				audit.add({
					file: edge.location?.file ?? '',
					line: edge.location?.line ?? 0,
					severity: 'warning',
					code: 'UNRESOLVED_NODE',
					message: `Edge source not found: ${edge.from}`,
				})
				stats.pruned++
				continue
			}
		}

		// Retarget destination if missing. Pass the source's context as a hint so
		// we disambiguate among same-named candidates (e.g. CancelFoo exists in
		// both agent/ and appointment/ contexts).
		if (!graph.nodes.has(toId)) {
			const fromContext = graph.nodes.get(fromId)?.context
			const inferredTo = inferTarget(toId, index, graph, fromContext)
			if (inferredTo) {
				if (inferredTo !== toId) stats.rewired++
				else stats.upgraded++
				toId = inferredTo
			} else {
				audit.add({
					file: edge.location?.file ?? '',
					line: edge.location?.line ?? 0,
					severity: 'info',
					code: 'UNRESOLVED_NODE',
					message: `Edge target not found: ${edge.to} (from ${edge.from} via ${edge.kind})`,
				})
				stats.pruned++
				continue
			}
		}

		// Both endpoints exist — keep the edge (with rewired ids if applicable)
		if (fromId !== edge.from || toId !== edge.to) {
			nextEdges.push({ ...edge, from: fromId, to: toId, id: edgeId(fromId, edge.kind, toId) })
		} else {
			nextEdges.push(edge)
		}
	}

	graph.edges = nextEdges

	// ── Derived edges: controller (api) ↔ sdk-operation (sdk) by operationId ──
	// Already added INFERRED in extractor; here we just upgrade to EXTRACTED if both nodes exist.
	for (const edge of graph.edges) {
		if (edge.kind === 'generates-sdk' && edge.audit === 'INFERRED' && graph.nodes.has(edge.to)) {
			edge.audit = 'EXTRACTED'
			stats.upgraded++
		}
	}

	// ── Derived: entity → db-table (same context, name match) ──
	for (const node of graph.nodes.values()) {
		if (node.kind !== 'entity') continue
		const ctx = node.context
		if (!ctx) continue
		// Find a db-table whose name matches the entity name (camelCased) within the same context schema
		const candidates = index.byNameAcrossKinds.get(node.name) ?? []
		const tableCandidates = candidates.filter(id => graph.nodes.get(id)?.kind === 'db-table')
		// Also try lowercase-first (e.g. Appointment → appointments)
		const lowerName = node.name.charAt(0).toLowerCase() + node.name.slice(1)
		const lowerCandidates = (index.byNameAcrossKinds.get(`${lowerName}s`) ?? []).filter(id => graph.nodes.get(id)?.kind === 'db-table')
		const all = [...tableCandidates, ...lowerCandidates]
		if (all.length === 0) continue
		for (const tableId of all) {
			const tableNode = graph.nodes.get(tableId)
			if (!tableNode) continue
			// Prefer same-schema match; otherwise still link with a hint
			addEdge(graph, {
				id: edgeId(node.id, 'belongs-to-context', tableId),
				from: node.id,
				to: tableId,
				kind: 'belongs-to-context',
				audit: 'INFERRED',
				metadata: { reason: 'entity-table name match' },
			})
			stats.derived++
		}
	}

	// ── Derived: backend error-code (api) ↔ docs error-code (from openapi ApiErrors) ──
	for (const node of graph.nodes.values()) {
		if (node.kind !== 'error-code' || node.service !== 'api') continue
		const docsId = `docs:error-code:${node.name}`
		if (graph.nodes.has(docsId)) {
			addEdge(graph, {
				id: edgeId(node.id, 'generates-sdk-error', docsId),
				from: node.id,
				to: docsId,
				kind: 'generates-sdk-error',
				audit: 'EXTRACTED',
			})
			stats.derived++
		}
	}

	// ── Derived: backend enum (api) ↔ sdk-enum (across flavors) by name ──
	for (const node of graph.nodes.values()) {
		if (node.kind !== 'enum' || node.service !== 'api') continue
		for (const flavor of ['app', 'api', 'channel-app', 'channel-api']) {
			const sdkEnumId = `sdk:${flavor}:sdk-enum:${node.name}`
			if (graph.nodes.has(sdkEnumId)) {
				addEdge(graph, {
					id: edgeId(node.id, 'generates-sdk-enum', sdkEnumId),
					from: node.id,
					to: sdkEnumId,
					kind: 'generates-sdk-enum',
					audit: 'EXTRACTED',
				})
				stats.derived++
			}
		}
	}

	// ── Derived: backend zod-schema ↔ sdk-zod by name match ──
	// Backend exports `bookAppointmentInputSchema`; Kubb generates similarly-named
	// sdk-zod nodes. Match by case-insensitive prefix overlap.
	const sdkZodByLcName = new Map<string, string[]>()
	for (const node of graph.nodes.values()) {
		if (node.kind !== 'sdk-zod') continue
		const lc = node.name.toLowerCase()
		const arr = sdkZodByLcName.get(lc) ?? []
		arr.push(node.id)
		sdkZodByLcName.set(lc, arr)
	}
	for (const node of graph.nodes.values()) {
		if (node.kind !== 'zod-schema') continue
		const lc = node.name.toLowerCase()
		const candidates = [...(sdkZodByLcName.get(lc) ?? [])]
		if (candidates.length === 0) {
			// Strip common Input/Output/Request/Response suffixes and look for prefix match
			const base = node.name
				.replace(/(InputSchema|OutputSchema|RequestSchema|ResponseSchema|ControllerInput|ControllerOutput)$/, '')
				.toLowerCase()
			for (const [key, ids] of sdkZodByLcName) {
				if (key.startsWith(base) && key.endsWith('schema')) candidates.push(...ids)
			}
		}
		for (const sdkZodId of candidates) {
			addEdge(graph, {
				id: edgeId(node.id, 'generates-sdk-zod', sdkZodId),
				from: node.id,
				to: sdkZodId,
				kind: 'generates-sdk-zod',
				audit: 'INFERRED',
			})
			stats.derived++
		}
	}

	// ── Derived: docs:error-code:CODE ↔ docs:locale:{pt,en}:errors.CODE ──
	// Every error code translates via locale keys named errors.<CODE>
	for (const node of graph.nodes.values()) {
		if (node.kind !== 'error-code' || node.service !== 'docs') continue
		for (const lang of ['pt', 'en']) {
			const localeId = `docs:${lang}:locale-key:errors.${node.name}`
			// Locale IDs follow the localeKeyId() shape: docs:locale:<lang>:<key>
			const altId = `docs:locale:${lang}:errors.${node.name}`
			const target = graph.nodes.has(altId) ? altId : graph.nodes.has(localeId) ? localeId : null
			if (!target) continue
			addEdge(graph, {
				id: edgeId(node.id, 'translates-via', target),
				from: node.id,
				to: target,
				kind: 'translates-via',
				audit: 'EXTRACTED',
			})
			stats.derived++
		}
	}

	// Placeholder expansion now happens in PASS 0 above, before pruning.

	// ── Derived: bridge Go ↔ TS shared abstractions by name match ──
	// Same name, different service for service-interfaces and value-objects that
	// represent the same logical concept (ExternalMediator, UnitOfWork, CPF, etc.)
	const sharedKinds = new Set(['service-interface', 'value-object', 'repository-interface'])
	const sharedByName = new Map<string, string[]>()
	for (const node of graph.nodes.values()) {
		if (!sharedKinds.has(node.kind)) continue
		const key = `${node.kind}::${node.name}`
		const arr = sharedByName.get(key) ?? []
		arr.push(node.id)
		sharedByName.set(key, arr)
	}
	for (const [, ids] of sharedByName) {
		if (ids.length < 2) continue
		// Bridge with `binds-token` edges: each cross-service node points to the others
		for (let i = 0; i < ids.length; i++) {
			for (let j = i + 1; j < ids.length; j++) {
				const a = ids[i]
				const b = ids[j]
				if (!a || !b) continue
				if (a.split(':')[0] === b.split(':')[0]) continue // same service — no bridge needed
				addEdge(graph, {
					id: edgeId(a, 'binds-token', b),
					from: a,
					to: b,
					kind: 'binds-token',
					audit: 'INFERRED',
					metadata: { reason: 'cross-service shared abstraction' },
				})
				stats.derived++
			}
		}
	}

	// ── Derived: bridge Go ↔ TS integration events by class-name match ──
	// channel:shared:integration-event:ChannelMessageReceivedEvent (Go-emitted)
	//   should be the same logical event as
	// api:shared:integration-event:ChannelMessageReceivedEvent (TS-consumed).
	// We add a `binds-token`-like equivalence edge so the impact graph crosses the boundary.
	const goIntEvents = new Map<string, string>() // name → channel id
	const tsIntEvents = new Map<string, string>() // name → api id
	for (const node of graph.nodes.values()) {
		if (node.kind !== 'integration-event') continue
		if (node.service === 'channel') goIntEvents.set(node.name, node.id)
		if (node.service === 'api') tsIntEvents.set(node.name, node.id)
	}
	for (const [name, goId] of goIntEvents) {
		const tsId = tsIntEvents.get(name)
		if (!tsId) continue
		// Bidirectional bridge — Go publishes, TS consumes (typical) AND vice versa.
		addEdge(graph, {
			id: edgeId(goId, 'publishes-integration-event', tsId),
			from: goId,
			to: tsId,
			kind: 'publishes-integration-event',
			audit: 'INFERRED',
			metadata: { reason: 'cross-service event identity', source: 'resolver' },
		})
		stats.derived++
	}

	// ── Derived: TS handler that reads channel event → also link channel publishers ──
	// If a TS handler `handles-event` an api integration event, and a Go handler
	// `publishes-integration-event` the matching channel integration event,
	// we already have the bridge above; this just upgrades audit if both sides exist.

	// ── Derived: middlewares protect controllers in the same context ──
	// BoundedContext.create({ middlewares }) applies them to every controller in the
	// context unless the controller lists `skipMiddlewares = [...]`.
	const middlewaresByContext = new Map<string, string[]>()
	const controllersByContext = new Map<string, string[]>()
	for (const node of graph.nodes.values()) {
		if (node.kind === 'middleware' && node.context) {
			const arr = middlewaresByContext.get(node.context) ?? []
			arr.push(node.id)
			middlewaresByContext.set(node.context, arr)
		}
		if (node.kind === 'controller' && node.context) {
			const arr = controllersByContext.get(node.context) ?? []
			arr.push(node.id)
			controllersByContext.set(node.context, arr)
		}
	}
	for (const [ctx, middlewares] of middlewaresByContext) {
		const controllers = controllersByContext.get(ctx) ?? []
		for (const mw of middlewares) {
			for (const controller of controllers) {
				addEdge(graph, {
					id: edgeId(mw, 'protects', controller),
					from: mw,
					to: controller,
					kind: 'protects',
					audit: 'INFERRED',
					metadata: { reason: 'context-wide registration' },
				})
				stats.derived++
			}
		}
	}

	return stats
}

// Some kinds are interchangeable for graph purposes — the same logical artifact
// can be classified differently depending on its location in the codebase.
const KIND_FALLBACKS: Record<string, string[]> = {
	usecase: ['ui-query', 'agent', 'agent-tool'],
	'ui-query': ['usecase'],
	'service-interface': ['service-impl'],
	'service-impl': ['service-interface'],
	'repository-interface': ['repository-impl'],
	'repository-impl': ['repository-interface'],
	agent: ['service-interface', 'service-impl'],
	'frontend-component': ['frontend-section', 'frontend-dialog', 'frontend-ui-primitive', 'frontend-form'],
	'frontend-section': ['frontend-component'],
	'frontend-ui-primitive': ['frontend-component'],
}

function inferTarget(targetId: string, index: NameIndex, graph: Graph, fromContext?: string): string | null {
	if (graph.nodes.has(targetId)) return targetId

	// Parse target id parts: <service>:<...>:<kind>:<name>
	const parts = targetId.split(':')
	if (parts.length < 3) return null
	const intendedService = parts[0]
	const intendedContext = parts.length >= 4 ? parts[1] : undefined
	const kind = parts[parts.length - 2]
	const name = parts[parts.length - 1]
	if (!kind || !name) return null

	// Preference order:
	//   1. exact service AND exact context the target ID encoded
	//   2. exact service AND the source-edge context (so cross-context same-name picks the caller's neighborhood)
	//   3. exact service (any context)
	//   4. anything
	const pick = (ids: string[]): string | null => {
		if (ids.length === 0) return null
		if (!intendedService) return ids[0] ?? null
		const byService = ids.filter(id => id.startsWith(`${intendedService}:`))
		const pool = byService.length > 0 ? byService : ids
		if (intendedContext) {
			const exact = pool.find(id => graph.nodes.get(id)?.context === intendedContext)
			if (exact) return exact
		}
		if (fromContext) {
			const sameCtx = pool.find(id => graph.nodes.get(id)?.context === fromContext)
			if (sameCtx) return sameCtx
		}
		return pool[0] ?? null
	}

	// Build a pool from primary kind + fallback kinds first, so context
	// preference can pick across kinds (e.g. usecase ↔ ui-query) and not be
	// stuck on a wrong-context primary match when the right-context fallback
	// candidate exists.
	const primaryCandidates = index.byNameAndKind.get(`${kind}::${name}`) ?? []
	const fallbackCandidates: string[] = []
	for (const fallbackKind of KIND_FALLBACKS[kind] ?? []) {
		const arr = index.byNameAndKind.get(`${fallbackKind}::${name}`)
		if (arr) fallbackCandidates.push(...arr)
	}

	// Pass 1: primary candidates only — but only return if they satisfy a context
	// preference (intended or source). Otherwise widen to include fallback kinds.
	if (primaryCandidates.length > 0) {
		const ctxAware = pickWithStrictContext(primaryCandidates, intendedService, intendedContext, fromContext, graph)
		if (ctxAware) return ctxAware
	}

	// Pass 2: primary + fallback candidates with context preference
	const pool = [...primaryCandidates, ...fallbackCandidates]
	if (pool.length > 0) {
		const picked = pick(pool)
		if (picked) return picked
	}

	// Last resort: any kind, same name (rendered components → dialog/primitive)
	const last = index.byNameAcrossKinds.get(name)
	if (last && last.length > 0) return pick(last)

	return null
}

// Strict variant: only returns when a context-matching candidate exists.
// Used to avoid locking onto a wrong-context primary match when a fallback kind
// with the right context is available.
function pickWithStrictContext(
	ids: string[],
	intendedService: string | undefined,
	intendedContext: string | undefined,
	fromContext: string | undefined,
	graph: Graph,
): string | null {
	if (ids.length === 0) return null
	const sameService = intendedService ? ids.filter(id => id.startsWith(`${intendedService}:`)) : ids
	const pool = sameService.length > 0 ? sameService : ids
	if (intendedContext) {
		const m = pool.find(id => graph.nodes.get(id)?.context === intendedContext)
		if (m) return m
		// Caller will retry across fallback kinds where a context match may exist.
		return null
	}
	if (fromContext) {
		const m = pool.find(id => graph.nodes.get(id)?.context === fromContext)
		if (m) return m
	}
	// No intended context: accept single candidate or fall through for ambiguity.
	if (pool.length === 1) return pool[0] ?? null
	return null
}

// Fan a placeholder edge to every locale-key whose name starts with the prefix.
function expandLocalePrefixPlaceholders(graph: Graph, stats: ResolveStats): void {
	const localesByLang = new Map<string, string[]>()
	for (const node of graph.nodes.values()) {
		if (node.kind !== 'locale-key' || !node.context) continue
		const arr = localesByLang.get(node.context) ?? []
		arr.push(node.id)
		localesByLang.set(node.context, arr)
	}
	const placeholderEdges = graph.edges.filter(e => e.to.startsWith('__locale-prefix:'))
	for (const edge of placeholderEdges) {
		const m = edge.to.match(/^__locale-prefix:([a-z-]+):(.*)$/)
		if (!m) continue
		const [, lang, prefix] = m
		if (!lang || prefix === undefined) continue
		const candidates = (localesByLang.get(lang) ?? []).filter(id => {
			const node = graph.nodes.get(id)
			return node?.name.startsWith(prefix)
		})
		for (const target of candidates) {
			addEdge(graph, {
				id: edgeId(edge.from, edge.kind, target),
				from: edge.from,
				to: target,
				kind: edge.kind,
				audit: 'INFERRED',
				...(edge.location ? { location: edge.location } : {}),
				metadata: { ...edge.metadata, expandedFrom: edge.to },
			})
			stats.derived++
		}
	}
}

// Resolve frontend SSE consumer references (string literals) to real integration-event nodes.
function expandSsePlaceholders(graph: Graph, stats: ResolveStats): void {
	const intEventByName = new Map<string, string>()
	const intEventByEnumValue = new Map<string, string>()
	for (const node of graph.nodes.values()) {
		if (node.kind !== 'integration-event') continue
		intEventByName.set(node.name, node.id)
		const evName = node.metadata?.eventName
		if (typeof evName === 'string') {
			intEventByName.set(evName, node.id)
			const m = evName.match(/Integration([A-Z][A-Za-z0-9]+)$/)
			if (m?.[1]) intEventByEnumValue.set(m[1], node.id)
			const parts = evName.split('.')
			if (parts.length > 1) {
				const last = parts[parts.length - 1]
				if (last) intEventByEnumValue.set(`${last.charAt(0).toUpperCase() + last.slice(1)}Event`, node.id)
			}
		}
	}
	const placeholderEdges = graph.edges.filter(e => e.to.startsWith('__sse:'))
	for (const edge of placeholderEdges) {
		const literal = edge.to.slice('__sse:'.length)
		const target = intEventByName.get(literal) ?? intEventByEnumValue.get(literal) ?? null
		if (!target) continue
		edge.to = target
		edge.id = edgeId(edge.from, edge.kind, target)
		edge.audit = 'EXTRACTED'
		stats.upgraded++
	}
}
