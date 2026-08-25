// Single-file backend extractor: walks every backend file once and emits all relevant nodes & edges.
// Splits responsibility by classified kind (from registry/classifier).

import { Node, SourceFile, type ClassDeclaration } from 'ts-morph'
import { addEdge, addNode, edgeId, nodeId, type Graph, type NodeKind } from '../../../core/graph'
import type { AuditCollector } from '../../../core/audit'
import { repoRelative } from '../../../core/paths'
import { classify } from '../../../registry/classifier'
import { getBackendProjects } from '../project'
import { DRIZZLE_SCHEMA_IMPORT_MARKER } from '../../../core/config'
import {
	buildSymbolContextMap,
	findEventInstantiations,
	findIntegrationEventPublishes,
	findRepoFieldAccesses,
	findThrownErrorCodes,
	getImports,
	getPropertyValue,
} from '../utils'

interface ExtractCtx {
	graph: Graph
	audit: AuditCollector
	file: SourceFile
	repoPath: string
	context?: string
}

export function runBackendExtraction(graph: Graph, audit: AuditCollector): { filesProcessed: number } {
	const projects = getBackendProjects()
	let filesProcessed = 0

	for (const { project } of projects) {
		for (const file of project.getSourceFiles()) {
			const repoPath = repoRelative(file.getFilePath())
			const cls = classify(repoPath)
			if (!cls) continue
			filesProcessed++
			const ctx: ExtractCtx = { graph, audit, file, repoPath, ...(cls.context !== undefined ? { context: cls.context } : {}) }

			switch (cls.kind) {
				case 'entity':
					extractEntity(ctx)
					break
				case 'value-object':
					extractValueObject(ctx)
					break
				case 'enum':
					extractEnum(ctx)
					break
				case 'error-code':
					extractErrors(ctx)
					break
				case 'usecase':
					extractUsecase(ctx)
					break
				case 'ui-query':
					extractUiQuery(ctx)
					break
				case 'event':
					extractEvent(ctx, false)
					break
				case 'integration-event':
					extractEvent(ctx, true)
					break
				case 'handler':
					extractHandler(ctx)
					break
				case 'controller':
					extractController(ctx)
					break
				case 'middleware':
					extractMiddleware(ctx)
					break
				case 'service-interface':
					extractServiceInterface(ctx)
					break
				case 'service-impl':
					extractServiceImpl(ctx)
					break
				case 'repository-interface':
					extractRepoInterface(ctx)
					break
				case 'repository-impl':
					extractRepoImpl(ctx)
					break
				case 'di-registry':
					extractDiRegistry(ctx)
					break
				case 'agent':
					extractAgent(ctx)
					break
				case 'agent-tool':
					extractAgentTool(ctx)
					break
				case 'job':
					extractJob(ctx)
					break
				default:
					break
			}
		}
	}

	return { filesProcessed }
}

// ── Helpers ──

function classNameFromFile(file: SourceFile): { cls: ClassDeclaration | null; name: string | null } {
	const cls = file.getClasses()[0]
	if (!cls) return { cls: null, name: null }
	const name = cls.getName() ?? null
	return { cls, name }
}

function fileBaseName(repoPath: string): string {
	const last = repoPath.split('/').pop() ?? repoPath
	return last.replace(/\.tsx?$/, '')
}

// ── Entity ──

function extractEntity(ctx: ExtractCtx) {
	const { cls, name } = classNameFromFile(ctx.file)
	if (!cls || !name) return
	const id = nodeId({ service: 'api', kind: 'entity', name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
	addNode(ctx.graph, {
		id,
		kind: 'entity',
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath, line: cls.getStartLineNumber() },
		metadata: {
			isAggregate: cls.getExtends()?.getText().includes('AggregateRoot') ?? false,
			methods: cls
				.getMethods()
				.filter(m => !m.hasModifier('private'))
				.map(m => m.getName()),
		},
	})

	// Composition: entities reference value-objects + enums via imports
	emitComposesEdges(ctx, id)

	// Detect entity-method-level event raises (rare in this codebase but we still scan)
	for (const ev of findEventInstantiations(ctx.file)) {
		const eventNodeId = nodeId({ service: 'api', kind: 'event', name: ev.eventName })
		addEdge(ctx.graph, {
			id: edgeId(id, 'raises-event', eventNodeId),
			from: id,
			to: eventNodeId,
			kind: 'raises-event',
			audit: 'INFERRED',
			location: { file: ctx.repoPath, line: ev.line },
		})
	}
}

// ── Value object ──

function extractValueObject(ctx: ExtractCtx) {
	const { cls, name } = classNameFromFile(ctx.file)
	if (!cls || !name) return
	const id = nodeId({ service: 'api', kind: 'value-object', name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
	addNode(ctx.graph, {
		id,
		kind: 'value-object',
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath, line: cls.getStartLineNumber() },
	})
	// VOs can compose other VOs and enums (e.g. Address contains a State enum)
	emitComposesEdges(ctx, id)
}

// Walk a file for exported `*InputSchema` / `*OutputSchema` Zod variable declarations
// and emit `zod-schema` nodes plus the requested edge kind from the source node.
function emitZodSchemaNodes(ctx: ExtractCtx, fromId: string, edgeKind: 'defines-schema' | 'uses-schema'): void {
	for (const decl of ctx.file.getVariableDeclarations()) {
		if (!decl.isExported()) continue
		const name = decl.getName()
		if (!/(InputSchema|OutputSchema|RequestSchema|ResponseSchema|Schema)$/.test(name)) continue
		// Filter out non-Zod variables (heuristic: initializer text contains z.)
		const init = decl.getInitializer()?.getText() ?? ''
		if (!/\bz\./.test(init) && !/\bZ\./.test(init)) continue

		const id = nodeId({ service: 'api', kind: 'zod-schema', name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
		addNode(ctx.graph, {
			id,
			kind: 'zod-schema',
			name,
			service: 'api',
			...(ctx.context !== undefined ? { context: ctx.context } : {}),
			location: { file: ctx.repoPath, line: decl.getStartLineNumber() },
			metadata: {
				owner: fromId,
			},
		})
		addEdge(ctx.graph, {
			id: edgeId(fromId, edgeKind, id),
			from: fromId,
			to: id,
			kind: edgeKind,
			audit: 'EXTRACTED',
		})
	}
}

// Walk imports of entity/value-object files. Anything imported from `*/objects/**`
// is a value-object reference; anything from `*/enums/**` is an enum reference.
function emitComposesEdges(ctx: ExtractCtx, fromId: string): void {
	for (const imp of getImports(ctx.file)) {
		const isVo = /(^|\/)objects(\/|$)/.test(imp.moduleSpecifier) || imp.moduleSpecifier.endsWith('/objects')
		const isEnum = /(^|\/)enums(\/|$)/.test(imp.moduleSpecifier) || imp.moduleSpecifier.endsWith('/enums')
		if (!isVo && !isEnum) continue
		const targetKind: 'value-object' | 'enum' = isVo ? 'value-object' : 'enum'
		for (const symbol of imp.namedImports) {
			// Skip type-only utility names like *Props
			if (symbol.endsWith('Props')) continue
			if (!/^[A-Z]/.test(symbol)) continue
			const targetId = nodeId({ service: 'api', kind: targetKind, name: symbol })
			addEdge(ctx.graph, {
				id: edgeId(fromId, 'composes', targetId),
				from: fromId,
				to: targetId,
				kind: 'composes',
				audit: 'INFERRED',
				metadata: { symbol, fromImport: imp.moduleSpecifier },
			})
		}
	}
}

// ── Enum ──

function extractEnum(ctx: ExtractCtx) {
	const enumDecl = ctx.file.getEnums()[0]
	if (!enumDecl) return
	const name = enumDecl.getName()
	const id = nodeId({ service: 'api', kind: 'enum', name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
	const members = enumDecl.getMembers().map(m => ({
		name: m.getName(),
		value: m.getValue() ?? m.getName(),
	}))
	addNode(ctx.graph, {
		id,
		kind: 'enum',
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath, line: enumDecl.getStartLineNumber() },
		metadata: { members: members.map(m => m.name) },
	})
	for (const m of members) {
		const memberId = `${id}::${m.name}`
		addNode(ctx.graph, {
			id: memberId,
			kind: 'enum-member',
			name: m.name,
			service: 'api',
			workspace: 'api-typescript',
			...(ctx.context !== undefined ? { context: ctx.context } : {}),
			metadata: { parentEnum: name, value: m.value },
		})
		addEdge(ctx.graph, {
			id: edgeId(id, 'has-member', memberId),
			from: id,
			to: memberId,
			kind: 'has-member',
			audit: 'EXTRACTED',
		})
	}
}

// ── Errors (string union types) ──

function extractErrors(ctx: ExtractCtx) {
	// Find type aliases like:
	//   export type AppointmentDomainErrors = 'INVALID_DATE_RANGE' | 'INVALID_STATUS_TRANSITION'
	for (const alias of ctx.file.getTypeAliases()) {
		const name = alias.getName()
		// Only handle the per-context error union types we care about
		if (!/Errors$/.test(name)) continue
		const typeNode = alias.getTypeNode()
		if (!typeNode) continue
		const text = typeNode.getText()
		// Pull out string literals
		const matches = [...text.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map(m => m[1]).filter(Boolean) as string[]
		for (const code of matches) {
			const id = nodeId({ service: 'api', kind: 'error-code', name: code, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
			addNode(ctx.graph, {
				id,
				kind: 'error-code',
				name: code,
				service: 'api',
				...(ctx.context !== undefined ? { context: ctx.context } : {}),
				location: { file: ctx.repoPath, line: alias.getStartLineNumber() },
				metadata: { union: name },
			})
		}
	}
}

// ── Usecase / UI query ──

function extractUsecase(ctx: ExtractCtx) {
	extractUseCaseLike(ctx, 'usecase')
}
function extractUiQuery(ctx: ExtractCtx) {
	extractUseCaseLike(ctx, 'ui-query')
}

function extractUseCaseLike(ctx: ExtractCtx, kind: 'usecase' | 'ui-query') {
	const { cls, name } = classNameFromFile(ctx.file)
	if (!cls || !name) return
	const id = nodeId({ service: 'api', kind, name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
	addNode(ctx.graph, {
		id,
		kind,
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath, line: cls.getStartLineNumber() },
		metadata: {
			ucName: getPropertyValue(cls, 'name'),
		},
	})

	// Zod schemas exported from this use case file — first-class nodes
	emitZodSchemaNodes(ctx, id, 'defines-schema')

	// Repository deps via constructor
	const ctor = cls.getConstructors()[0]
	if (ctor) {
		for (const param of ctor.getParameters()) {
			const typeName = param.getTypeNode()?.getText().split('<')[0]?.trim()
			if (!typeName) continue
			if (typeName.endsWith('Repository')) {
				const repoId = nodeId({ service: 'api', kind: 'repository-interface', name: typeName })
				addEdge(ctx.graph, {
					id: edgeId(id, 'depends-on-repo', repoId),
					from: id,
					to: repoId,
					kind: 'depends-on-repo',
					audit: 'INFERRED',
				})
			}
		}
	}

	// Field accesses for repos (alternate pattern)
	for (const repoField of findRepoFieldAccesses(ctx.file)) {
		const typeName = `${repoField.charAt(0).toUpperCase()}${repoField.slice(1)}`
		const repoId = nodeId({ service: 'api', kind: 'repository-interface', name: typeName })
		addEdge(ctx.graph, {
			id: edgeId(id, 'depends-on-repo', repoId),
			from: id,
			to: repoId,
			kind: 'depends-on-repo',
			audit: 'INFERRED',
		})
	}

	// Event raises (use cases construct domain events)
	for (const ev of findEventInstantiations(ctx.file)) {
		// Cross-package events live in shared/events; first try to resolve via imports
		const importedFrom = resolveImportedSymbol(ctx.file, ev.eventName)
		const isShared = importedFrom?.includes('/shared/events/') ?? false
		const eventId = isShared
			? nodeId({ service: 'api', kind: 'integration-event', context: 'shared', name: ev.eventName })
			: nodeId({ service: 'api', kind: 'event', name: ev.eventName, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
		addEdge(ctx.graph, {
			id: edgeId(id, 'raises-event', eventId),
			from: id,
			to: eventId,
			kind: 'raises-event',
			audit: 'EXTRACTED',
			location: { file: ctx.repoPath, line: ev.line },
		})
	}

	// Error throws
	for (const errCode of findThrownErrorCodes(ctx.file)) {
		const errId = nodeId({ service: 'api', kind: 'error-code', name: errCode.code })
		addEdge(ctx.graph, {
			id: edgeId(id, 'throws-error', errId),
			from: id,
			to: errId,
			kind: 'throws-error',
			audit: 'EXTRACTED',
			location: { file: ctx.repoPath, line: errCode.line },
		})
	}

	// Direct drizzle reads (UI queries do this; some use cases too)
	for (const imp of getImports(ctx.file)) {
		if (!imp.moduleSpecifier.includes(DRIZZLE_SCHEMA_IMPORT_MARKER)) continue
		const schemaMatch = imp.moduleSpecifier.match(/schema\/([^/]+)$/)
		const schema = schemaMatch?.[1] ?? 'shared'
		for (const tableSym of imp.namedImports) {
			const dbId = `db:${schema}:db-table:${tableSym}`
			addEdge(ctx.graph, {
				id: edgeId(id, 'reads-table', dbId),
				from: id,
				to: dbId,
				kind: 'reads-table',
				audit: 'EXTRACTED',
			})
		}
	}
}

function resolveImportedSymbol(file: SourceFile, symbol: string): string | null {
	for (const imp of file.getImportDeclarations()) {
		const named = imp.getNamedImports().map(ni => ni.getName())
		if (named.includes(symbol)) {
			const sf = imp.getModuleSpecifierSourceFile()
			return sf?.getFilePath() ?? imp.getModuleSpecifierValue()
		}
	}
	return null
}

// ── Event ──

function extractEvent(ctx: ExtractCtx, isIntegration: boolean) {
	const { cls, name } = classNameFromFile(ctx.file)
	if (!cls || !name) return
	const kind: NodeKind = isIntegration ? 'integration-event' : 'event'
	// Pull `static name = '...'`
	const eventName = getPropertyValue(cls, 'name')
	const id = nodeId({ service: 'api', kind, name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
	addNode(ctx.graph, {
		id,
		kind,
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath, line: cls.getStartLineNumber() },
		metadata: { eventName, isIntegration },
	})
}

// ── Handler ──

function extractHandler(ctx: ExtractCtx) {
	const { cls, name } = classNameFromFile(ctx.file)
	if (!cls || !name) return
	const id = nodeId({ service: 'api', kind: 'handler', name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })

	// Detect internal vs external by reading sibling barrels
	const isExternal = /[\\/]handlers[\\/]([^\\/]+\.ts)$/.test(ctx.repoPath) ? false : false /* fallback */
	addNode(ctx.graph, {
		id,
		kind: 'handler',
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath, line: cls.getStartLineNumber() },
		metadata: { isExternal },
	})

	// `readonly event = SomeEvent` → handles-event edge
	const eventProp = cls.getProperty('event')
	const eventInit = eventProp?.getInitializer()
	if (eventInit && Node.isIdentifier(eventInit)) {
		const eventName = eventInit.getText()
		const importedFrom = resolveImportedSymbol(ctx.file, eventName)
		const isShared = importedFrom?.includes('/shared/events/') ?? false
		const eventId = isShared
			? nodeId({ service: 'api', kind: 'integration-event', context: 'shared', name: eventName })
			: nodeId({ service: 'api', kind: 'event', name: eventName, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
		addEdge(ctx.graph, {
			id: edgeId(id, 'handles-event', eventId),
			from: id,
			to: eventId,
			kind: 'handles-event',
			audit: 'EXTRACTED',
		})
	}

	// publishes/dispatches integration events
	for (const pub of findIntegrationEventPublishes(ctx.file)) {
		const evId = nodeId({ service: 'api', kind: 'integration-event', context: 'shared', name: pub.eventName })
		addEdge(ctx.graph, {
			id: edgeId(id, 'publishes-integration-event', evId),
			from: id,
			to: evId,
			kind: 'publishes-integration-event',
			audit: 'EXTRACTED',
			location: { file: ctx.repoPath, line: pub.line },
		})
	}

	// Constructor injections — handlers depend on repos / services / agents to do their work
	const ctor = cls.getConstructors()[0]
	if (ctor) {
		for (const param of ctor.getParameters()) {
			const typeName = param.getTypeNode()?.getText().split('<')[0]?.trim()
			if (!typeName || !/^[A-Z]/.test(typeName)) continue
			let edgeKind: 'depends-on-repo' | 'orchestrates' = 'orchestrates'
			let targetKind: NodeKind = 'service-interface'
			if (/Repository$/.test(typeName)) {
				edgeKind = 'depends-on-repo'
				targetKind = 'repository-interface'
			} else if (/Mediator$|MailSender$|Driver$|Dispatcher$|Queue$|Registry$|Factory$|Runner$/.test(typeName)) {
				targetKind = 'service-interface'
			} else {
				// Could be an Agent class or a use case — try agent first; resolver will retarget if wrong
				targetKind = 'service-interface'
			}
			const targetId = nodeId({ service: 'api', kind: targetKind, name: typeName })
			addEdge(ctx.graph, {
				id: edgeId(id, edgeKind, targetId),
				from: id,
				to: targetId,
				kind: edgeKind,
				audit: 'INFERRED',
				metadata: { typeName },
			})
		}
	}

	// Domain events emitted from inside the handle() body — reuse use-case-style detection
	for (const ev of findEventInstantiations(ctx.file)) {
		const importedFrom = resolveImportedSymbol(ctx.file, ev.eventName)
		const isShared = importedFrom?.includes('/shared/events/') ?? false
		const targetId = isShared
			? nodeId({ service: 'api', kind: 'integration-event', context: 'shared', name: ev.eventName })
			: nodeId({ service: 'api', kind: 'event', name: ev.eventName })
		addEdge(ctx.graph, {
			id: edgeId(id, 'raises-event', targetId),
			from: id,
			to: targetId,
			kind: 'raises-event',
			audit: 'INFERRED',
			location: { file: ctx.repoPath, line: ev.line },
		})
	}
}

// ── Controller ──

function extractController(ctx: ExtractCtx) {
	const { cls, name } = classNameFromFile(ctx.file)
	if (!cls || !name) return
	if (!name.endsWith('Controller')) return
	const operationId = name.replace(/Controller$/, '')
	const id = nodeId({ service: 'api', kind: 'controller', name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
	addNode(ctx.graph, {
		id,
		kind: 'controller',
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath, line: cls.getStartLineNumber() },
		metadata: {
			operationId,
			path: getPropertyValue(cls, 'path'),
			method: getPropertyValue(cls, 'method'),
			description: getPropertyValue(cls, 'description'),
			inputSchema: getPropertyValue(cls, 'inputSchema'),
			outputSchema: getPropertyValue(cls, 'outputSchema'),
		},
	})

	// Constructor injection — usecase deps. Resolve target context from the
	// import that introduced the parameter type so we don't collide with
	// same-named use cases in other contexts (e.g., agent vs appointment).
	const symbolCtx = buildSymbolContextMap(ctx.file)
	const ctor = cls.getConstructors()[0]
	if (ctor) {
		for (const param of ctor.getParameters()) {
			const typeName = param.getTypeNode()?.getText().split('<')[0]?.trim()
			if (!typeName) continue
			// Heuristic: parameter type matches a usecase if it's PascalCase and not Repository/Service
			if (/Repository$|Service$|Mediator$/.test(typeName)) continue
			if (!/^[A-Z]/.test(typeName)) continue
			const targetCtx = symbolCtx.get(typeName) ?? ctx.context
			const ucId = nodeId({
				service: 'api',
				kind: 'usecase',
				name: typeName,
				...(targetCtx !== undefined ? { context: targetCtx } : {}),
			})
			addEdge(ctx.graph, {
				id: edgeId(id, 'wraps-usecase', ucId),
				from: id,
				to: ucId,
				kind: 'wraps-usecase',
				audit: targetCtx ? 'EXTRACTED' : 'INFERRED',
			})
		}
	}

	// Generates SDK operation — INFERRED until cross-stack resolver matches operationId
	for (const flavor of ['app', 'api'] as const) {
		const opId = `sdk:${flavor}:sdk-operation:${operationId}`
		addEdge(ctx.graph, {
			id: edgeId(id, 'generates-sdk', opId),
			from: id,
			to: opId,
			kind: 'generates-sdk',
			audit: 'INFERRED',
			metadata: { operationId, flavor },
		})
	}

	// Controllers also export their *ControllerInput / *ControllerOutput Zod schemas
	emitZodSchemaNodes(ctx, id, 'defines-schema')
}

// ── Middleware ──

function extractMiddleware(ctx: ExtractCtx) {
	const { cls, name } = classNameFromFile(ctx.file)
	if (!cls || !name) return
	addNode(ctx.graph, {
		id: nodeId({ service: 'api', kind: 'middleware', name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) }),
		kind: 'middleware',
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath, line: cls.getStartLineNumber() },
	})
}

// ── Service ──
// The classifier broadly assigns `service-interface` to files in services/ folders.
// We inspect each class to decide if it's actually an interface (abstract) or impl.
// Service files can declare multiple classes — emit one node per class.

function extractServiceInterface(ctx: ExtractCtx) {
	const classIds: string[] = []
	for (const cls of ctx.file.getClasses()) {
		const name = cls.getName()
		if (!name) continue
		const isInterface = cls.isAbstract()
		const kind = isInterface ? 'service-interface' : 'service-impl'
		const id = nodeId({ service: 'api', kind, name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
		classIds.push(id)
		addNode(ctx.graph, {
			id,
			kind,
			name,
			service: 'api',
			...(ctx.context !== undefined ? { context: ctx.context } : {}),
			location: { file: ctx.repoPath, line: cls.getStartLineNumber() },
		})

		const ext = cls.getExtends()
		if (ext) {
			const baseName = ext.getText().split('<')[0]?.trim()
			if (baseName && baseName !== name) {
				const baseId = nodeId({
					service: 'api',
					kind: 'service-interface',
					name: baseName,
					...(ctx.context !== undefined ? { context: ctx.context } : {}),
				})
				addEdge(ctx.graph, {
					id: edgeId(id, 'binds-token', baseId),
					from: id,
					to: baseId,
					kind: 'binds-token',
					audit: 'EXTRACTED',
				})
			}
		}

		// Constructor injections — services depend on repos and other services
		const ctor = cls.getConstructors()[0]
		if (ctor) {
			for (const param of ctor.getParameters()) {
				const typeName = param.getTypeNode()?.getText().split('<')[0]?.trim()
				if (!typeName || !/^[A-Z]/.test(typeName) || typeName === name) continue
				if (/Repository$/.test(typeName)) {
					const repoId = nodeId({ service: 'api', kind: 'repository-interface', name: typeName })
					addEdge(ctx.graph, {
						id: edgeId(id, 'depends-on-repo', repoId),
						from: id,
						to: repoId,
						kind: 'depends-on-repo',
						audit: 'INFERRED',
					})
				}
			}
		}
	}

	// Events raised from inside any class in this service file
	if (classIds.length > 0) {
		const fromId = classIds[0]!
		for (const ev of findEventInstantiations(ctx.file)) {
			const importedFrom = resolveImportedSymbol(ctx.file, ev.eventName)
			const isShared = importedFrom?.includes('/shared/events/') ?? false
			const targetId = isShared
				? nodeId({ service: 'api', kind: 'integration-event', context: 'shared', name: ev.eventName })
				: nodeId({ service: 'api', kind: 'event', name: ev.eventName })
			addEdge(ctx.graph, {
				id: edgeId(fromId, 'raises-event', targetId),
				from: fromId,
				to: targetId,
				kind: 'raises-event',
				audit: 'INFERRED',
				location: { file: ctx.repoPath, line: ev.line },
			})
		}
	}
}

function extractServiceImpl(ctx: ExtractCtx) {
	extractServiceInterface(ctx)
}

// ── Repository ──
// Classifier may put the file under repository-interface even when it's actually an impl
// (e.g. when registry pattern matches the flat layout). We use AST to decide.

function extractRepoInterface(ctx: ExtractCtx) {
	const cls = ctx.file.getClasses()[0]
	if (!cls) return
	const name = cls.getName()
	if (!name) return
	const isInterface = cls.isAbstract() || (!name.startsWith('Drizzle') && !name.startsWith('Mock'))
	const actualKind = isInterface ? 'repository-interface' : 'repository-impl'
	const id = nodeId({ service: 'api', kind: actualKind, name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
	addNode(ctx.graph, {
		id,
		kind: actualKind,
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath, line: cls.getStartLineNumber() },
	})
	// If this is actually an impl in disguise, run the impl branch's body
	if (!isInterface) {
		extractRepoImplBody(ctx, cls, id, name)
	}
}

function extractRepoImpl(ctx: ExtractCtx) {
	const cls = ctx.file.getClasses()[0]
	if (!cls) return
	const name = cls.getName()
	if (!name) return
	const id = nodeId({ service: 'api', kind: 'repository-impl', name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
	addNode(ctx.graph, {
		id,
		kind: 'repository-impl',
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath, line: cls.getStartLineNumber() },
	})
	extractRepoImplBody(ctx, cls, id, name)
}

function extractRepoImplBody(ctx: ExtractCtx, cls: ClassDeclaration, id: string, _name: string): void {
	// Implements which interface? ← extends clause
	const ext = cls.getExtends()
	if (ext) {
		const interfaceName = ext.getText().split('<')[0]?.trim()
		if (interfaceName) {
			const interfaceId = nodeId({
				service: 'api',
				kind: 'repository-interface',
				name: interfaceName,
				...(ctx.context !== undefined ? { context: ctx.context } : {}),
			})
			addEdge(ctx.graph, {
				id: edgeId(id, 'binds-token', interfaceId),
				from: id,
				to: interfaceId,
				kind: 'binds-token',
				audit: 'EXTRACTED',
			})
		}
	}

	// Tables imported from drizzle schema → reads-table / writes-table
	for (const imp of getImports(ctx.file)) {
		if (!imp.moduleSpecifier.includes(DRIZZLE_SCHEMA_IMPORT_MARKER)) continue
		for (const tableId of imp.namedImports) {
			const schemaMatch = imp.moduleSpecifier.match(/schema\/([^/]+)$/)
			const schema = schemaMatch?.[1] ?? 'shared'
			const dbId = `db:${schema}:db-table:${tableId}`
			addEdge(ctx.graph, {
				id: edgeId(id, 'reads-table', dbId),
				from: id,
				to: dbId,
				kind: 'reads-table',
				audit: 'EXTRACTED',
			})
			addEdge(ctx.graph, {
				id: edgeId(id, 'writes-table', dbId),
				from: id,
				to: dbId,
				kind: 'writes-table',
				audit: 'EXTRACTED',
			})
		}
	}
}

// ── DI Registry ──

function extractDiRegistry(ctx: ExtractCtx) {
	const id = nodeId({
		service: 'api',
		kind: 'di-registry',
		name: 'registry',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
	})
	addNode(ctx.graph, {
		id,
		kind: 'di-registry',
		name: 'registry',
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath, line: 1 },
	})

	// Find INSTANCE_REGISTRY object literal and extract { token, instance } pairs.
	// We look for `{ token: SomeToken, instance: SomeImpl }` shapes inside any object literal.
	ctx.file.forEachDescendant(n => {
		if (!Node.isObjectLiteralExpression(n)) return
		const props = n.getProperties()
		const tokenProp = props.find(p => Node.isPropertyAssignment(p) && p.getName() === 'token')
		const instanceProp = props.find(p => Node.isPropertyAssignment(p) && p.getName() === 'instance')
		if (!tokenProp || !instanceProp || !Node.isPropertyAssignment(tokenProp) || !Node.isPropertyAssignment(instanceProp)) return
		const tokenInit = tokenProp.getInitializer()
		const instanceInit = instanceProp.getInitializer()
		if (!tokenInit || !instanceInit) return
		const tokenName = tokenInit.getText()
		const instanceName = instanceInit.getText()
		// Tokens are usually repository-interface or service-interface
		const tokenKind: NodeKind = tokenName.endsWith('Repository') ? 'repository-interface' : 'service-interface'
		const implKind: NodeKind = tokenName.endsWith('Repository') ? 'repository-impl' : 'service-impl'
		const tokenId = nodeId({ service: 'api', kind: tokenKind, name: tokenName })
		const implId = nodeId({ service: 'api', kind: implKind, name: instanceName })
		addEdge(ctx.graph, {
			id: edgeId(id, 'binds-token', tokenId),
			from: id,
			to: tokenId,
			kind: 'binds-token',
			audit: 'EXTRACTED',
		})
		addEdge(ctx.graph, {
			id: edgeId(tokenId, 'binds-token', implId),
			from: tokenId,
			to: implId,
			kind: 'binds-token',
			audit: 'EXTRACTED',
		})
	})
}

// ── Agent / Agent-tool / Job ──

function extractAgent(ctx: ExtractCtx) {
	const name = fileBaseName(ctx.repoPath)
	const id = nodeId({ service: 'api', kind: 'agent', name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
	addNode(ctx.graph, {
		id,
		kind: 'agent',
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath },
	})

	// Agents wire up tools and use cases via imports — emit edges from imports.
	for (const imp of getImports(ctx.file)) {
		// Tools imported (typically `from './tools'` or `'../tools'`)
		if (imp.moduleSpecifier.includes('/tools') || imp.moduleSpecifier.endsWith('tools')) {
			for (const sym of imp.namedImports) {
				if (!sym.endsWith('Tool')) continue
				const toolId = nodeId({ service: 'api', kind: 'agent-tool', name: sym })
				addEdge(ctx.graph, {
					id: edgeId(id, 'has-tool', toolId),
					from: id,
					to: toolId,
					kind: 'has-tool',
					audit: 'INFERRED',
				})
			}
		}
		// Direct use case imports (`from '@agent/usecases'` etc)
		if (imp.moduleSpecifier.includes('/usecases')) {
			const targetCtx = importedContext(imp) ?? ctx.context
			for (const sym of imp.namedImports) {
				if (!/^[A-Z]/.test(sym)) continue
				const ucId = nodeId({
					service: 'api',
					kind: 'usecase',
					name: sym,
					...(targetCtx !== undefined ? { context: targetCtx } : {}),
				})
				addEdge(ctx.graph, {
					id: edgeId(id, 'wraps-usecase', ucId),
					from: id,
					to: ucId,
					kind: 'wraps-usecase',
					audit: targetCtx ? 'EXTRACTED' : 'INFERRED',
				})
			}
		}
	}
}

function extractAgentTool(ctx: ExtractCtx) {
	const name = fileBaseName(ctx.repoPath)
	const id = nodeId({ service: 'api', kind: 'agent-tool', name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) })
	addNode(ctx.graph, {
		id,
		kind: 'agent-tool',
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath },
	})

	// Tools wrap a use case — find the use case imported in this file
	for (const imp of getImports(ctx.file)) {
		if (!imp.moduleSpecifier.includes('/usecases')) continue
		const targetCtx = importedContext(imp) ?? ctx.context
		for (const sym of imp.namedImports) {
			if (!/^[A-Z]/.test(sym)) continue
			const ucId = nodeId({
				service: 'api',
				kind: 'usecase',
				name: sym,
				...(targetCtx !== undefined ? { context: targetCtx } : {}),
			})
			addEdge(ctx.graph, {
				id: edgeId(id, 'wraps-usecase', ucId),
				from: id,
				to: ucId,
				kind: 'wraps-usecase',
				audit: 'EXTRACTED',
				metadata: { symbol: sym, ...(targetCtx ? { targetContext: targetCtx } : {}) },
			})
		}
	}
}

// Derive the exporting context from a usecase import like '@appointment/usecases'
// or '@ui/usecases/agent/GetAgentChatConfig'. Returns null if not derivable.
function importedContext(imp: { moduleSpecifier: string; importedFrom: string }): string | null {
	const aliasMatch = imp.moduleSpecifier.match(/^@([a-z][a-z0-9-]*)\//i)
	if (aliasMatch?.[1]) return aliasMatch[1]
	const pathMatch = imp.importedFrom.match(/\/packages\/api\/src\/([a-z][a-z0-9-]*)\//i)
	return pathMatch?.[1] ?? null
}

function extractJob(ctx: ExtractCtx) {
	const name = fileBaseName(ctx.repoPath)
	addNode(ctx.graph, {
		id: nodeId({ service: 'api', kind: 'job', name, ...(ctx.context !== undefined ? { context: ctx.context } : {}) }),
		kind: 'job',
		name,
		service: 'api',
		...(ctx.context !== undefined ? { context: ctx.context } : {}),
		location: { file: ctx.repoPath },
	})
}
