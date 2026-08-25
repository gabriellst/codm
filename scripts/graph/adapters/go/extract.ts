// Go extractor — emits graph nodes / edges from facts produced by the Go AST
// helper in `./extractor/main.go`.
//
// The Go helper handles parsing (parser+go/ast), so this file is pure
// transformation: classify a file by folder, look up its FileFacts, and emit
// nodes / edges according to the classifier kind.

import { glob } from 'glob'
import { addEdge, addNode, contractId, edgeId, nodeId, type Graph } from '../../core/graph'
import type { AuditCollector } from '../../core/audit'
import { repoRelative, ROOT } from '../../core/paths'
import { goGlobs, IGNORE_GO } from '../../core/config'
import { classifyGo, goWorkspaceRoots, type GoClassificationResult } from './classify'
import { loadGoFacts, type CallRef, type FieldDecl, type FileFacts } from './facts'

export interface GoExtractionStats {
	filesProcessed: number
	nodesAdded: number
	edgesAdded: number
}

export async function runGoExtraction(graph: Graph, audit: AuditCollector): Promise<GoExtractionStats> {
	const goRoots = goWorkspaceRoots()
	if (goRoots.length === 0) return { filesProcessed: 0, nodesAdded: 0, edgesAdded: 0 }

	const files = await glob(goGlobs(), {
		cwd: ROOT,
		ignore: IGNORE_GO,
		absolute: true,
	})

	const facts = loadGoFacts(goRoots)

	let filesProcessed = 0
	let nodesAdded = 0
	let edgesAdded = 0

	// Two-pass extraction so referencing nodes (usecases / handlers) can resolve
	// targets that depend on definitions (error codes, enums, events).
	const PASS_ORDER: Record<string, number> = {
		'error-code': 0,
		enum: 0,
		event: 1,
		'integration-event': 1,
		entity: 1,
		'value-object': 1,
		'repository-interface': 1,
		'service-interface': 1,
	}
	const items: { rel: string; f: FileFacts; cls: GoClassificationResult }[] = []
	for (const absPath of files) {
		const rel = repoRelative(absPath as string)
		const cls = classifyGo(rel)
		if (!cls) continue
		const f = facts.get(rel)
		if (!f) continue
		items.push({ rel, f, cls })
	}
	items.sort((a, b) => (PASS_ORDER[a.cls.kind] ?? 9) - (PASS_ORDER[b.cls.kind] ?? 9))

	for (const item of items) {
		filesProcessed++
		const before = { n: graph.nodes.size, e: graph.edges.length }
		extractGoFile(graph, audit, item.rel, item.f, item.cls)
		nodesAdded += graph.nodes.size - before.n
		edgesAdded += graph.edges.length - before.e
	}

	return { filesProcessed, nodesAdded, edgesAdded }
}

function extractGoFile(graph: Graph, _audit: AuditCollector, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	switch (cls.kind) {
		case 'event':
		case 'integration-event':
			extractGoEvent(graph, rel, facts, cls)
			break
		case 'handler':
			extractGoHandler(graph, rel, facts, cls)
			break
		case 'usecase':
			extractGoUsecase(graph, rel, facts, cls)
			break
		case 'controller':
			extractGoController(graph, rel, facts, cls)
			break
		case 'entity':
			extractGoEntity(graph, rel, facts, cls)
			break
		case 'value-object':
			extractGoValueObject(graph, rel, facts, cls)
			break
		case 'enum':
			extractGoEnum(graph, rel, facts, cls)
			break
		case 'error-code':
			extractGoErrors(graph, rel, facts, cls)
			break
		case 'service-interface':
			extractGoService(graph, rel, facts, cls)
			break
		case 'repository-interface':
		case 'repository-impl':
			extractGoRepository(graph, rel, facts, cls)
			break
		case 'middleware':
			extractGoMiddleware(graph, rel, facts, cls)
			break
		case 'job':
			extractGoJob(graph, rel, facts, cls)
			break
		default:
			break
	}
}

// ── Helpers ──

function makeChannelId(parts: { kind: string; context: string; name: string }): string {
	return `channel:${parts.context}:${parts.kind}:${parts.name}`
}

/** Strip a leading package qualifier (e.g. "ctxevents.FooPayload" → "FooPayload"). */
function stripPkg(name: string): string {
	const dot = name.lastIndexOf('.')
	return dot >= 0 ? name.slice(dot + 1) : name
}

/**
 * Edge a Go handler to the polyglot `contract-event` node. The codegen output
 * (`contracts-generated-go:generated-go:<EventClass>`) carries the wire name in
 * its metadata; we read it to build the canonical contract id. No-op when
 * either node is missing — the local `handles-event` / `publishes-integration-event`
 * edges still cover the channel-internal shape.
 */
function emitContractEventEdge(
	graph: Graph,
	fromId: string,
	eventClass: string,
	kind: 'handles-event' | 'publishes-integration-event',
): void {
	const goGen = graph.nodes.get(`contracts-generated-go:generated-go:${eventClass}`)
	const wireName = goGen?.metadata?.wireName as string | undefined
	if (!wireName) return
	const targetId = contractId('contract-event', wireName)
	if (!graph.nodes.has(targetId)) return
	addEdge(graph, {
		id: edgeId(fromId, kind, targetId),
		from: fromId,
		to: targetId,
		kind,
		audit: 'INFERRED',
	})
}

function findStruct(facts: FileFacts, predicate: (name: string) => boolean) {
	return facts.types.find(t => t.kind === 'struct' && predicate(t.name))
}

function findInterfaces(facts: FileFacts): typeof facts.types {
	return facts.types.filter(t => t.kind === 'interface')
}

function findStructs(facts: FileFacts): typeof facts.types {
	return facts.types.filter(t => t.kind === 'struct')
}

// ── Events ──

function extractGoEvent(graph: Graph, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	// Pattern: `const <X>EventName = "<wire>"` — captured as a string constant.
	for (const sc of facts.stringConsts) {
		const m = /^(\w+)EventName$/.exec(sc.name)
		if (!m) continue
		const className = m[1]!
		const eventNodeId = makeChannelId({ kind: cls.kind, context: cls.context, name: `${className}Event` })
		addNode(graph, {
			id: eventNodeId,
			kind: cls.kind,
			name: `${className}Event`,
			service: 'channel',
			context: cls.context,
			location: { file: rel, line: sc.line },
			metadata: { eventName: sc.value, source: 'go' },
		})
	}
}

// ── Handlers ──

function extractGoHandler(graph: Graph, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	// One file can declare multiple handler-shaped structs (typical for projector
	// files where each event has its own *Projector struct).
	const handlerStructs = facts.types.filter(t => t.kind === 'struct' && /(Handler|Projector)$/.test(t.name))
	if (handlerStructs.length === 0) return

	for (const handlerType of handlerStructs) {
		const id = makeChannelId({ kind: 'handler', context: cls.context, name: handlerType.name })
		addNode(graph, {
			id,
			kind: 'handler',
			name: handlerType.name,
			service: 'channel',
			context: cls.context,
			location: { file: rel, line: handlerType.line },
			metadata: { source: 'go', isProjector: /Projector$/.test(handlerType.name) },
		})

		// Scope calls to this struct's methods only (via receiver type).
		const ownCalls = facts.calls.filter(c => c.recvType === handlerType.name)

		// handles-event: UnmarshalDomainEvent[<X>Payload] inside this struct's methods
		const unmarshalCalls = ownCalls.filter(c => c.fn === 'UnmarshalDomainEvent')
		for (const c of unmarshalCalls) {
			for (const ta of c.typeArgs ?? []) {
				const payload = stripPkg(ta)
				const m = /^(.+)Payload$/.exec(payload)
				if (!m) continue
				const eventClass = `${m[1]}Event`
				const localEvent = makeChannelId({ kind: 'event', context: cls.context, name: eventClass })
				const sharedIntEvent = makeChannelId({ kind: 'integration-event', context: 'shared', name: eventClass })
				const tsIntEvent = nodeId({ service: 'api', kind: 'integration-event', context: 'shared', name: eventClass })
				const target = graph.nodes.has(localEvent)
					? localEvent
					: graph.nodes.has(sharedIntEvent)
						? sharedIntEvent
						: graph.nodes.has(tsIntEvent)
							? tsIntEvent
							: localEvent
				addEdge(graph, {
					id: edgeId(id, 'handles-event', target),
					from: id,
					to: target,
					kind: 'handles-event',
					audit: 'EXTRACTED',
				})
				// Polyglot source-of-truth contract-event linkage.
				emitContractEventEdge(graph, id, eventClass, 'handles-event')
			}
		}

		// Projectors expose `EventName() string { return <pkg>.<X>EventName }`. Resolve
		// the constant back to its event class so projectors that don't unmarshal still
		// declare the subscription edge.
		const eventNameMethod = facts.methods.find(m => m.recvType === handlerType.name && m.name === 'EventName')
		if (eventNameMethod?.returnRef) {
			const ref = eventNameMethod.returnRef.split('.').pop() ?? ''
			const m = /^(.+)EventName$/.exec(ref)
			if (m?.[1]) {
				const eventClass = `${m[1]}Event`
				const localEvent = makeChannelId({ kind: 'event', context: cls.context, name: eventClass })
				const sharedIntEvent = makeChannelId({ kind: 'integration-event', context: 'shared', name: eventClass })
				const target = graph.nodes.has(localEvent) ? localEvent : sharedIntEvent
				addEdge(graph, {
					id: edgeId(id, 'handles-event', target),
					from: id,
					to: target,
					kind: 'handles-event',
					audit: 'EXTRACTED',
					metadata: { via: 'EventName()' },
				})
				emitContractEventEdge(graph, id, eventClass, 'handles-event')
			}
		}

		// Real polyglot handler convention scoped to this struct's body:
		// `func (h *X) EventName() string { return wire.<Y>Name }` → handler consumes wire `<Y>`.
		const wireEventClasses = new Set<string>()
		for (const ref of facts.pascalRefs) {
			if (ref.pkg !== 'wire') continue
			const m = /^([A-Z][A-Za-z0-9_]*Event)Name$/.exec(ref.symbol)
			if (!m) continue
			// Without a per-pascalRef recvType we keep the file-level dedup; this
			// matches pre-existing behaviour for polyglot wire references.
			wireEventClasses.add(m[1]!)
		}
		for (const eventClass of wireEventClasses) {
			emitContractEventEdge(graph, id, eventClass, 'handles-event')
		}

		// publishes-integration-event: <recv>.externalMediator.Publish(ctx, New<X>Event(...))
		const publishCalls = ownCalls.filter(c => c.fn === 'Publish' && c.callee.includes('externalMediator.Publish'))
		const publishSeen = new Set<string>()
		for (const c of publishCalls) {
			if (!c.firstArgCall) continue
			const m = /^New(\w+)Event$/.exec(stripPkg(c.firstArgCall))
			if (!m) continue
			const eventClass = `${m[1]}Event`
			if (publishSeen.has(eventClass)) continue
			publishSeen.add(eventClass)
			const target = makeChannelId({ kind: 'integration-event', context: 'shared', name: eventClass })
			addEdge(graph, {
				id: edgeId(id, 'publishes-integration-event', target),
				from: id,
				to: target,
				kind: 'publishes-integration-event',
				audit: 'INFERRED',
			})
			emitContractEventEdge(graph, id, eventClass, 'publishes-integration-event')
		}

		// Constructor injection (struct-specific `NewXxx` factory)
		emitConstructorDeps(graph, id, facts, handlerType.name, cls.context)

		// Domain events raised inside this struct's methods only
		emitRaisedEventsScoped(graph, id, facts, cls.context, handlerType.name)
	}
}

// ── Use cases ──

function extractGoUsecase(graph: Graph, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	const ucStruct = findStruct(facts, n => n.endsWith('Handler'))
	if (!ucStruct) return
	const ucName = ucStruct.name.replace(/Handler$/, '')
	const id = makeChannelId({ kind: 'usecase', context: cls.context, name: ucName })
	addNode(graph, {
		id,
		kind: 'usecase',
		name: ucName,
		service: 'channel',
		context: cls.context,
		location: { file: rel, line: ucStruct.line },
		metadata: { source: 'go' },
	})

	const inputStruct = findStruct(facts, n => /Input$/.test(n))
	if (inputStruct) {
		const schemaId = makeChannelId({ kind: 'zod-schema', context: cls.context, name: inputStruct.name })
		addNode(graph, {
			id: schemaId,
			kind: 'zod-schema',
			name: inputStruct.name,
			service: 'channel',
			context: cls.context,
			location: { file: rel, line: inputStruct.line },
			metadata: { source: 'go-struct' },
		})
		addEdge(graph, { id: edgeId(id, 'defines-schema', schemaId), from: id, to: schemaId, kind: 'defines-schema', audit: 'EXTRACTED' })
	}
	const outputStruct = findStruct(facts, n => /Output$/.test(n))
	if (outputStruct) {
		const schemaId = makeChannelId({ kind: 'zod-schema', context: cls.context, name: outputStruct.name })
		addNode(graph, {
			id: schemaId,
			kind: 'zod-schema',
			name: outputStruct.name,
			service: 'channel',
			context: cls.context,
			location: { file: rel, line: outputStruct.line },
			metadata: { source: 'go-struct' },
		})
		addEdge(graph, { id: edgeId(id, 'defines-schema', schemaId), from: id, to: schemaId, kind: 'defines-schema', audit: 'EXTRACTED' })
	}

	emitConstructorDeps(graph, id, facts, ucStruct.name, cls.context)
	emitRaisedEvents(graph, id, facts, cls.context)
	emitErrorCodeRefs(graph, id, facts, cls.context)
}

// ── Controllers ──

function extractGoController(graph: Graph, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	const ctrlStruct = findStruct(facts, n => n.endsWith('Controller'))
	if (!ctrlStruct) return
	const operationId = ctrlStruct.name.replace(/Controller$/, '')
	const id = makeChannelId({ kind: 'controller', context: cls.context, name: ctrlStruct.name })
	const meta = facts.controllerMeta
	addNode(graph, {
		id,
		kind: 'controller',
		name: ctrlStruct.name,
		service: 'channel',
		context: cls.context,
		location: { file: rel, line: ctrlStruct.line },
		metadata: {
			operationId,
			path: meta?.path,
			method: meta?.method,
			description: meta?.description,
			declaredContext: meta?.context,
			source: 'go',
		},
	})

	// Wrapped use case: a struct field `handler *?usecases.<X>Handler`
	const usecaseField = ctrlStruct.fields?.find(f => f.pkg === 'usecases' && /Handler$/.test(f.type))
	if (usecaseField) {
		const ucName = usecaseField.type.replace(/Handler$/, '')
		const ucId = makeChannelId({ kind: 'usecase', context: cls.context, name: ucName })
		addEdge(graph, {
			id: edgeId(id, 'wraps-usecase', ucId),
			from: id,
			to: ucId,
			kind: 'wraps-usecase',
			audit: 'EXTRACTED',
		})
	}

	for (const flavor of ['channel-app', 'channel-api'] as const) {
		const opId = `sdk:${flavor}:sdk-operation:${operationId}`
		addEdge(graph, {
			id: edgeId(id, 'generates-sdk', opId),
			from: id,
			to: opId,
			kind: 'generates-sdk',
			audit: 'INFERRED',
			metadata: { operationId, flavor },
		})
	}

	// meta.errorCodes carries the identifier stem (e.g. "ChannelNotFound" from
	// "CodeChannelNotFound"); the channel node is keyed by the wire string
	// ("INTEGRATION_NOT_FOUND"). Bridge via the identifier→wire index built from
	// nodes already emitted in pass 1 of the two-pass walk.
	const identifierIndex = getChannelErrorIdentifierIndex(graph)
	for (const code of meta?.errorCodes ?? []) {
		const ix = identifierIndex.get(code)
		const channelTarget = ix ? makeChannelId({ kind: 'error-code', context: ix.context, name: ix.wire }) : null
		const docsId = `docs:error-code:${code}`
		const target =
			(channelTarget && graph.nodes.has(channelTarget) ? channelTarget : null) ??
			(graph.nodes.has(docsId) ? docsId : channelTarget) ??
			docsId
		addEdge(graph, {
			id: edgeId(id, 'throws-error', target),
			from: id,
			to: target,
			kind: 'throws-error',
			audit: ix ? 'EXTRACTED' : 'INFERRED',
		})
	}
}

// ── Entity ──

function extractGoEntity(graph: Graph, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	const struct = facts.types.find(t => t.kind === 'struct')
	if (!struct) return
	const id = makeChannelId({ kind: 'entity', context: cls.context, name: struct.name })
	addNode(graph, {
		id,
		kind: 'entity',
		name: struct.name,
		service: 'channel',
		context: cls.context,
		location: { file: rel, line: struct.line },
		metadata: { source: 'go' },
	})
	emitGoComposesEdges(graph, id, facts)
}

// ── Value object ──

function extractGoValueObject(graph: Graph, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	// First struct or alias counts as the VO definition
	const t = facts.types.find(x => x.kind === 'struct' || (x.kind === 'alias' && /^(string|int|int32|int64|\[\])/.test(x.underlying ?? '')))
	if (!t) return
	addNode(graph, {
		id: makeChannelId({ kind: 'value-object', context: cls.context, name: t.name }),
		kind: 'value-object',
		name: t.name,
		service: 'channel',
		context: cls.context,
		location: { file: rel, line: t.line },
		metadata: { source: 'go' },
	})
}

// ── Enum ──

function extractGoEnum(graph: Graph, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	// Go enums = `type X string` + `const ( XActive X = "ACTIVE"; ... )`
	const t = facts.types.find(t => t.kind === 'alias' && /^(string|int|int32|int64)$/.test(t.underlying ?? ''))
	if (!t) return
	const id = makeChannelId({ kind: 'enum', context: cls.context, name: t.name })
	const block = facts.constBlocks.find(b => b.typed === t.name)
	const members = (block?.members ?? []).map(m => m.value ?? '').filter(Boolean)
	addNode(graph, {
		id,
		kind: 'enum',
		name: t.name,
		service: 'channel',
		context: cls.context,
		location: { file: rel, line: t.line },
		metadata: { members, source: 'go' },
	})
	for (const value of members) {
		const memberId = `${id}::${value}`
		addNode(graph, {
			id: memberId,
			kind: 'enum-member',
			name: value,
			service: 'channel',
			workspace: 'api-go',
			context: cls.context,
			metadata: { parentEnum: t.name, value },
		})
		addEdge(graph, { id: edgeId(id, 'has-member', memberId), from: id, to: memberId, kind: 'has-member', audit: 'EXTRACTED' })
	}
}

// ── Errors (Go const codes) ──

function extractGoErrors(graph: Graph, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	for (const e of facts.errorCodes) {
		addNode(graph, {
			id: makeChannelId({ kind: 'error-code', context: cls.context, name: e.wire }),
			kind: 'error-code',
			name: e.wire,
			service: 'channel',
			context: cls.context,
			location: { file: rel, line: e.line },
			metadata: { source: 'go', identifier: e.name },
		})
	}
}

// ── Service ──

function extractGoService(graph: Graph, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	for (const iface of findInterfaces(facts)) {
		addNode(graph, {
			id: makeChannelId({ kind: 'service-interface', context: cls.context, name: iface.name }),
			kind: 'service-interface',
			name: iface.name,
			service: 'channel',
			context: cls.context,
			location: { file: rel, line: iface.line },
			metadata: { source: 'go' },
		})
	}
	// A struct counts as a service-impl only if it has methods (behaviour). Otherwise it's
	// a plain data carrier (DTO / snapshot / config) — emitting those as service-impl
	// floods the graph with orphans because nothing binds them as a service token.
	const structsWithMethods = new Set(facts.methods.map(m => m.recvType))
	for (const struct of findStructs(facts)) {
		const ifaceId = makeChannelId({ kind: 'service-interface', context: cls.context, name: struct.name })
		if (graph.nodes.has(ifaceId)) continue
		if (!structsWithMethods.has(struct.name)) continue
		addNode(graph, {
			id: makeChannelId({ kind: 'service-impl', context: cls.context, name: struct.name }),
			kind: 'service-impl',
			name: struct.name,
			service: 'channel',
			context: cls.context,
			location: { file: rel, line: struct.line },
			metadata: { source: 'go' },
		})
	}
}

// ── Repositories ──

function extractGoRepository(graph: Graph, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	const iface = facts.types.find(t => t.kind === 'interface' && /(Repository|Storage)$/.test(t.name))
	const struct = facts.types.find(t => t.kind === 'struct' && /(Repository|Repo|Storage)$/.test(t.name))

	if (cls.kind === 'repository-interface' && iface) {
		addNode(graph, {
			id: makeChannelId({ kind: 'repository-interface', context: cls.context, name: iface.name }),
			kind: 'repository-interface',
			name: iface.name,
			service: 'channel',
			context: cls.context,
			location: { file: rel, line: iface.line },
			metadata: { source: 'go' },
		})
	}
	if (struct && cls.kind === 'repository-impl') {
		const id = makeChannelId({ kind: 'repository-impl', context: cls.context, name: struct.name })
		addNode(graph, {
			id,
			kind: 'repository-impl',
			name: struct.name,
			service: 'channel',
			context: cls.context,
			location: { file: rel, line: struct.line },
			metadata: { source: 'go' },
		})
		// Heuristic: strip leading Pgx|Pg|Mock|Default prefix to find the interface name.
		const ifaceName = struct.name.replace(/^(Pgx|Pg|Mock|Default)/, '')
		const ifaceId = makeChannelId({ kind: 'repository-interface', context: cls.context, name: ifaceName })
		addEdge(graph, {
			id: edgeId(id, 'binds-token', ifaceId),
			from: id,
			to: ifaceId,
			kind: 'binds-token',
			audit: 'INFERRED',
		})

		// Canonical Go repos in `sync/storage/*_pg.go` publish wire events directly
		// (e.g. `wire.OrderUpdatedEventName` referenced on the upsert path). Surface
		// those as `publishes-integration-event` edges to the contract.
		const publishedEvents = new Set<string>()
		for (const ref of facts.pascalRefs) {
			if (ref.pkg !== 'wire') continue
			const m = /^([A-Z][A-Za-z0-9_]*Event)Name$/.exec(ref.symbol)
			if (!m) continue
			publishedEvents.add(m[1]!)
		}
		for (const eventClass of publishedEvents) {
			emitContractEventEdge(graph, id, eventClass, 'publishes-integration-event')
		}
	}
}

// ── Middleware / Job ──

function extractGoMiddleware(graph: Graph, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	const t = facts.types[0]
	if (!t) return
	addNode(graph, {
		id: makeChannelId({ kind: 'middleware', context: cls.context, name: t.name }),
		kind: 'middleware',
		name: t.name,
		service: 'channel',
		context: cls.context,
		location: { file: rel, line: t.line },
		metadata: { source: 'go' },
	})
}

function extractGoJob(graph: Graph, rel: string, facts: FileFacts, cls: GoClassificationResult): void {
	const t = facts.types[0]
	if (!t) return
	addNode(graph, {
		id: makeChannelId({ kind: 'job', context: cls.context, name: t.name }),
		kind: 'job',
		name: t.name,
		service: 'channel',
		context: cls.context,
		location: { file: rel, line: t.line },
		metadata: { source: 'go' },
	})
}

// ── Shared emitters ──

function emitRaisedEvents(graph: Graph, fromId: string, facts: FileFacts, ctx: string): void {
	emitRaisedEventsScoped(graph, fromId, facts, ctx, null)
}

function emitRaisedEventsScoped(graph: Graph, fromId: string, facts: FileFacts, ctx: string, recvType: string | null): void {
	const seen = new Set<string>()
	for (const c of facts.calls) {
		if (recvType !== null && c.recvType !== recvType) continue
		const m = /^New(\w+)Event$/.exec(c.fn)
		if (!m) continue
		const eventClass = `${m[1]}Event`
		if (seen.has(eventClass)) continue
		seen.add(eventClass)
		const target = makeChannelId({ kind: 'event', context: ctx, name: eventClass })
		const sharedTarget = makeChannelId({ kind: 'integration-event', context: 'shared', name: eventClass })
		const finalTarget = graph.nodes.has(target) ? target : sharedTarget
		addEdge(graph, {
			id: edgeId(fromId, 'raises-event', finalTarget),
			from: fromId,
			to: finalTarget,
			kind: 'raises-event',
			audit: 'INFERRED',
		})
	}
}

function emitErrorCodeRefs(graph: Graph, fromId: string, facts: FileFacts, ctx: string): void {
	const seen = new Set<string>()
	const identifierIndex = getChannelErrorIdentifierIndex(graph)
	const collect = (sym: string) => {
		const m = /^Code([A-Z][A-Za-z0-9]+)$/.exec(sym)
		if (!m) return
		const ident = m[1]!
		if (seen.has(ident)) return
		seen.add(ident)
		// The identifier (e.g. "ChannelNotFound") is mapped to its wire string by the
		// error declaration block. Without that mapping (it differs from the identifier
		// in non-obvious ways — `CodeChannelNotFound = "INTEGRATION_NOT_FOUND"`), the
		// throws-error edge cannot point at the real node.
		const ix = identifierIndex.get(ident)
		const channelTarget = ix ? makeChannelId({ kind: 'error-code', context: ix.context, name: ix.wire }) : null
		const docsId = `docs:error-code:${ident}`
		const docsByWire = ix ? `docs:error-code:${ix.wire}` : null
		const target =
			(channelTarget && graph.nodes.has(channelTarget) ? channelTarget : null) ??
			(docsByWire && graph.nodes.has(docsByWire) ? docsByWire : null) ??
			(graph.nodes.has(docsId) ? docsId : channelTarget) ??
			makeChannelId({ kind: 'error-code', context: ctx, name: ident })
		addEdge(graph, {
			id: edgeId(fromId, 'throws-error', target),
			from: fromId,
			to: target,
			kind: 'throws-error',
			audit: ix ? 'EXTRACTED' : 'INFERRED',
		})
	}
	for (const r of facts.pascalRefs) collect(r.symbol)
}

// Rebuilds identifier → wire mapping on each call. The graph is mutated during
// extraction, so caching would race with error files processed after usecases.
function getChannelErrorIdentifierIndex(graph: Graph): Map<string, { wire: string; context: string }> {
	const m = new Map<string, { wire: string; context: string }>()
	for (const n of graph.nodes.values()) {
		if (n.kind !== 'error-code' || n.service !== 'channel') continue
		const ident = n.metadata?.identifier
		if (typeof ident === 'string' && n.context) m.set(ident, { wire: n.name, context: n.context })
	}
	return m
}

function emitConstructorDeps(graph: Graph, fromId: string, facts: FileFacts, structName: string, ctx: string): void {
	const ctor = facts.funcs.find(f => f.name === `New${structName}`) ?? facts.funcs.find(f => /^New/.test(f.name))
	if (!ctor) return
	const seen = new Set<string>()
	for (const p of ctor.params) {
		const typeName = p.type
		if (!typeName || !/^[A-Z]/.test(typeName) || seen.has(typeName)) continue
		seen.add(typeName)
		if (['T', 'I', 'String', 'Int', 'Bool', 'Error'].includes(typeName)) continue

		if (/Repository$/.test(typeName)) {
			const repoId = makeChannelId({ kind: 'repository-interface', context: ctx, name: typeName })
			addEdge(graph, {
				id: edgeId(fromId, 'depends-on-repo', repoId),
				from: fromId,
				to: repoId,
				kind: 'depends-on-repo',
				audit: 'INFERRED',
			})
		} else if (/(Service|Mediator|Registry|Factory|Driver|Dispatcher|Queue|Runner|UnitOfWork|Handler|Provider)$/.test(typeName)) {
			const svcId = makeChannelId({ kind: 'service-interface', context: ctx, name: typeName })
			addEdge(graph, {
				id: edgeId(fromId, 'orchestrates', svcId),
				from: fromId,
				to: svcId,
				kind: 'orchestrates',
				audit: 'INFERRED',
			})
		}
	}
}

function emitGoComposesEdges(graph: Graph, fromId: string, facts: FileFacts): void {
	// Use imports to identify VO/enum packages, then take pascal refs against those package aliases.
	const voPkgs = new Map<string, string>() // alias → context
	const enumPkgs = new Map<string, string>()
	for (const imp of facts.imports) {
		const path = imp.path
		const isVo = /\/objects(\/|$)/.test(path)
		const isEnum = /\/enums(\/|$)/.test(path)
		if (!isVo && !isEnum) continue
		const segs = path.split('/')
		const idx = segs.findIndex(s => s === 'objects' || s === 'enums')
		const importedCtx = segs[idx - 1] ?? 'shared'
		const alias = imp.alias ?? segs[segs.length - 1] ?? ''
		if (isVo) voPkgs.set(alias, importedCtx)
		if (isEnum) enumPkgs.set(alias, importedCtx)
	}
	const seen = new Set<string>()
	for (const ref of facts.pascalRefs) {
		const sym = ref.symbol
		if (seen.has(sym)) continue
		if (sym.endsWith('Props') || sym.length < 2) continue
		const voCtx = voPkgs.get(ref.pkg)
		const enumCtx = enumPkgs.get(ref.pkg)
		if (!voCtx && !enumCtx) continue
		seen.add(sym)
		const targetKind = voCtx ? 'value-object' : 'enum'
		const targetCtx = (voCtx ?? enumCtx)!
		const targetId = makeChannelId({ kind: targetKind, context: targetCtx, name: sym })
		addEdge(graph, {
			id: edgeId(fromId, 'composes', targetId),
			from: fromId,
			to: targetId,
			kind: 'composes',
			audit: 'INFERRED',
		})
	}
}

// Re-export for backwards compatibility with consumers.
export type { CallRef, FieldDecl, FileFacts }
