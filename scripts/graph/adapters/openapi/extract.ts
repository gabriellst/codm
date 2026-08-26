import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addEdge, addNode, edgeId, nodeId, sdkId, type Graph, type Node } from '../../core/graph'
import type { AuditCollector } from '../../core/audit'
import { repoRelative } from '../../core/paths'
import {
	goBundleFilePath,
	hookFilePath,
	hookName,
	httpFilePath,
	operationIdToCamel,
	sharedTypeFilePath,
	sharedZodFilePath,
	tagOf,
	typeFilePath,
	zodFilePath,
} from './naming'
import type { FlavorPaths, OpenApiOperation, OpenApiSpec, SdkFlavor } from './types'

export interface SpecLoadResult {
	flavor: SdkFlavor
	spec: OpenApiSpec | null
	error?: string
}

export function loadSpec(flavor: FlavorPaths): SpecLoadResult {
	if (!existsSync(flavor.specPath)) {
		return { flavor: flavor.flavor, spec: null, error: `OpenAPI spec missing: ${flavor.specPath}` }
	}
	try {
		const raw = readFileSync(flavor.specPath, 'utf8')
		return { flavor: flavor.flavor, spec: JSON.parse(raw) as OpenApiSpec }
	} catch (e) {
		return { flavor: flavor.flavor, spec: null, error: `Failed to parse OpenAPI: ${(e as Error).message}` }
	}
}

interface ExtractContext {
	graph: Graph
	audit: AuditCollector
	flavor: FlavorPaths
	spec: OpenApiSpec
}

function checkPresence(ctx: ExtractContext, relPath: string): { present: boolean; resolvedAt?: string } {
	for (const root of [ctx.flavor.srcRoot, ctx.flavor.distRoot]) {
		const abs = join(root, relPath)
		if (existsSync(abs)) {
			return { present: true, resolvedAt: repoRelative(abs) }
		}
	}
	return { present: false }
}

export function extractFromSpec(
	graph: Graph,
	audit: AuditCollector,
	flavor: FlavorPaths,
): { operationsExtracted: number; missingArtifacts: number } {
	const result = loadSpec(flavor)
	if (!result.spec) {
		audit.add({
			file: repoRelative(flavor.specPath),
			severity: 'error',
			code: 'MISSING_SDK_ARTIFACT',
			message: result.error ?? 'spec missing',
			hint: 'Run `bun emit-openapi` or check that the api/channel emit step ran',
		})
		return { operationsExtracted: 0, missingArtifacts: 1 }
	}

	const ctx: ExtractContext = { graph, audit, flavor, spec: result.spec }
	let operationsExtracted = 0
	let missingArtifacts = 0

	// ── Go SDK bundle existence (oapi-codegen emits one `client.gen.go` per flavor) ──
	if (flavor.sdkLang === 'go') {
		const bundleRel = goBundleFilePath()
		const bundlePresence = checkPresence(ctx, bundleRel)
		if (!bundlePresence.present) {
			audit.missingSdkArtifact(flavor.flavor, 'go SDK bundle', `${flavor.srcRoot}/${bundleRel}`)
			missingArtifacts++
		}
	}

	// ── Operations ──
	for (const [path, pathItem] of Object.entries(result.spec.paths)) {
		for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'] as const) {
			const op = pathItem[method]
			if (!op?.operationId) continue
			const counts = extractOperation(ctx, path, method, op)
			operationsExtracted += counts.opsAdded
			missingArtifacts += counts.missing
		}
	}

	// ── Shared schemas (enums + types in components.schemas) ──
	const schemas = result.spec.components?.schemas ?? {}
	for (const [name, schema] of Object.entries(schemas)) {
		extractSharedSchema(ctx, name, schema)
	}

	return { operationsExtracted, missingArtifacts }
}

function extractOperation(ctx: ExtractContext, path: string, method: string, op: OpenApiOperation): { opsAdded: number; missing: number } {
	const tag = tagOf(op)
	const operationId = op.operationId
	let missing = 0

	// Go SDKs (oapi-codegen) bundle every operation into one `client.gen.go` —
	// per-operation presence checks would fire `MISSING_SDK_ARTIFACT` for every
	// op even though the file exists. The bundle is verified once per flavor in
	// `extractFromSpec`; here we just skip the per-op file probes.
	const isGoSdk = ctx.flavor.sdkLang === 'go'

	// 1. sdk-operation node — the conceptual operation (one per operationId)
	const operationNodeId = sdkId({ flavor: ctx.flavor.flavor, kind: 'sdk-operation', name: operationId })
	const operationNode: Node = {
		id: operationNodeId,
		kind: 'sdk-operation',
		name: operationId,
		service: 'sdk',
		workspace: ctx.flavor.clientWorkspace,
		context: tag,
		metadata: {
			flavor: ctx.flavor.flavor,
			httpMethod: method.toUpperCase(),
			httpPath: path,
			tag,
			internal: op.tags?.includes('internal') ?? false,
			external: op.tags?.includes('external') ?? false,
		},
	}
	addNode(ctx.graph, operationNode)

	// 2. sdk-http (kubb pluginClient output) — present for all flavors.
	// Skip per-op presence check for Go SDKs (one bundled `client.gen.go`).
	const httpRel = httpFilePath(tag, operationId)
	const httpPresence = isGoSdk ? { present: true as const } : checkPresence(ctx, httpRel)
	if (!isGoSdk && !httpPresence.present) {
		missing++
		ctx.audit.missingSdkArtifact(operationId, 'http client', `${ctx.flavor.srcRoot}/${httpRel}`)
	}
	const httpNodeId = sdkId({ flavor: ctx.flavor.flavor, kind: 'sdk-http', name: operationIdToCamel(operationId) })
	addNode(ctx.graph, {
		id: httpNodeId,
		kind: 'sdk-http',
		name: operationIdToCamel(operationId),
		service: 'sdk',
		workspace: ctx.flavor.clientWorkspace,
		context: tag,
		...(httpPresence.resolvedAt ? { location: { file: httpPresence.resolvedAt } } : {}),
		metadata: { flavor: ctx.flavor.flavor, generated: httpPresence.present },
	})
	addEdge(ctx.graph, {
		id: edgeId(operationNodeId, 'generates-sdk', httpNodeId),
		from: operationNodeId,
		to: httpNodeId,
		kind: 'generates-sdk',
		audit: 'EXTRACTED',
	})

	// 3. sdk-type — present for all flavors via pluginTs
	const typeRel = typeFilePath(operationId)
	const typePresence = checkPresence(ctx, typeRel)
	const typeNodeId = sdkId({ flavor: ctx.flavor.flavor, kind: 'sdk-type', name: operationId })
	addNode(ctx.graph, {
		id: typeNodeId,
		kind: 'sdk-type',
		name: operationId,
		service: 'sdk',
		workspace: ctx.flavor.clientWorkspace,
		context: tag,
		...(typePresence.resolvedAt ? { location: { file: typePresence.resolvedAt } } : {}),
		metadata: { flavor: ctx.flavor.flavor, generated: typePresence.present },
	})
	addEdge(ctx.graph, {
		id: edgeId(operationNodeId, 'generates-sdk-type', typeNodeId),
		from: operationNodeId,
		to: typeNodeId,
		kind: 'generates-sdk-type',
		audit: 'EXTRACTED',
	})

	// 4. sdk-zod — only TS SDKs emit Zod runtime validators (other langs use
	// their own type systems).
	const includesZod = ctx.flavor.sdkLang === 'typescript'
	if (includesZod) {
		const zodRel = zodFilePath(tag, operationId)
		const zodPresence = checkPresence(ctx, zodRel)
		const zodNodeId = sdkId({
			flavor: ctx.flavor.flavor,
			kind: 'sdk-zod',
			name: `${operationIdToCamel(operationId)}Schema`,
		})
		addNode(ctx.graph, {
			id: zodNodeId,
			kind: 'sdk-zod',
			name: `${operationIdToCamel(operationId)}Schema`,
			service: 'sdk',
			workspace: ctx.flavor.clientWorkspace,
			context: tag,
			...(zodPresence.resolvedAt ? { location: { file: zodPresence.resolvedAt } } : {}),
			metadata: { flavor: ctx.flavor.flavor, generated: zodPresence.present },
		})
		addEdge(ctx.graph, {
			id: edgeId(operationNodeId, 'generates-sdk-zod', zodNodeId),
			from: operationNodeId,
			to: zodNodeId,
			kind: 'generates-sdk-zod',
			audit: 'EXTRACTED',
		})
	}

	// 5. sdk-hook — TS SDKs emit React Query hooks (pluginReactQuery).
	const includesHooks = ctx.flavor.sdkLang === 'typescript'
	if (includesHooks && !(op.tags?.includes('internal') ?? false)) {
		const hookRel = hookFilePath(tag, operationId)
		const hookPresence = checkPresence(ctx, hookRel)
		if (!hookPresence.present) {
			missing++
			ctx.audit.missingSdkArtifact(operationId, 'react-query hook', `${ctx.flavor.srcRoot}/${hookRel}`)
		}
		const hookNodeId = sdkId({ flavor: ctx.flavor.flavor, kind: 'sdk-hook', name: hookName(operationId) })
		addNode(ctx.graph, {
			id: hookNodeId,
			kind: 'sdk-hook',
			name: hookName(operationId),
			service: 'sdk',
			workspace: ctx.flavor.clientWorkspace,
			context: tag,
			...(hookPresence.resolvedAt ? { location: { file: hookPresence.resolvedAt } } : {}),
			metadata: {
				flavor: ctx.flavor.flavor,
				generated: hookPresence.present,
				hookFlavor: method === 'get' || method === 'head' ? 'query' : 'mutation',
			},
		})
		addEdge(ctx.graph, {
			id: edgeId(operationNodeId, 'generates-sdk-hook', hookNodeId),
			from: operationNodeId,
			to: hookNodeId,
			kind: 'generates-sdk-hook',
			audit: 'EXTRACTED',
		})
	}

	return { opsAdded: 1, missing }
}

function extractSharedSchema(ctx: ExtractContext, name: string, schema: { enum?: unknown[]; type?: unknown }) {
	// Skip path-param extracted body schemas — they're operation-attached, not shared.
	const typeRel = sharedTypeFilePath(name)
	const typePresence = checkPresence(ctx, typeRel)

	// Decide whether this is an enum or a regular type
	const isEnum = Array.isArray(schema.enum) && schema.enum.length > 0
	const isErrorEnum = name === 'ApiErrors'

	if (isErrorEnum) {
		const errorEnumNodeId = sdkId({ flavor: ctx.flavor.flavor, kind: 'sdk-error-enum', name })
		addNode(ctx.graph, {
			id: errorEnumNodeId,
			kind: 'sdk-error-enum',
			name,
			service: 'sdk',
			workspace: ctx.flavor.clientWorkspace,
			...(typePresence.resolvedAt ? { location: { file: typePresence.resolvedAt } } : {}),
			metadata: {
				flavor: ctx.flavor.flavor,
				generated: typePresence.present,
				codes: (schema.enum ?? []).filter((v): v is string => typeof v === 'string'),
			},
		})
		// Each error code becomes a graph node so frontend handlers + backend errors can both link.
		// These are cross-flavor (one ApiErrors enum shared by all SDKs), so they live in `contracts`.
		for (const code of schema.enum ?? []) {
			if (typeof code !== 'string') continue
			const errorCodeNodeId = nodeId({ service: 'docs', kind: 'error-code', name: code })
			addNode(ctx.graph, {
				id: errorCodeNodeId,
				kind: 'error-code',
				name: code,
				service: 'docs',
				workspace: 'contracts',
				metadata: { source: 'openapi' },
			})
			addEdge(ctx.graph, {
				id: edgeId(errorEnumNodeId, 'has-member', errorCodeNodeId),
				from: errorEnumNodeId,
				to: errorCodeNodeId,
				kind: 'has-member',
				audit: 'EXTRACTED',
			})
		}
		return
	}

	if (isEnum) {
		const enumNodeId = sdkId({ flavor: ctx.flavor.flavor, kind: 'sdk-enum', name })
		addNode(ctx.graph, {
			id: enumNodeId,
			kind: 'sdk-enum',
			name,
			service: 'sdk',
			workspace: ctx.flavor.clientWorkspace,
			...(typePresence.resolvedAt ? { location: { file: typePresence.resolvedAt } } : {}),
			metadata: {
				flavor: ctx.flavor.flavor,
				generated: typePresence.present,
				values: (schema.enum ?? []).filter((v): v is string | number => typeof v === 'string' || typeof v === 'number'),
			},
		})
		for (const value of schema.enum ?? []) {
			if (typeof value !== 'string') continue
			const memberNodeId = `${enumNodeId}::${value}`
			addNode(ctx.graph, {
				id: memberNodeId,
				kind: 'enum-member',
				name: value,
				service: 'sdk',
				workspace: ctx.flavor.clientWorkspace,
				metadata: { parentEnum: name, flavor: ctx.flavor.flavor },
			})
			addEdge(ctx.graph, {
				id: edgeId(enumNodeId, 'has-member', memberNodeId),
				from: enumNodeId,
				to: memberNodeId,
				kind: 'has-member',
				audit: 'EXTRACTED',
			})
		}
		return
	}

	// Plain type — one sdk-type node
	const sharedTypeNodeId = sdkId({ flavor: ctx.flavor.flavor, kind: 'sdk-type', name })
	addNode(ctx.graph, {
		id: sharedTypeNodeId,
		kind: 'sdk-type',
		name,
		service: 'sdk',
		workspace: ctx.flavor.clientWorkspace,
		...(typePresence.resolvedAt ? { location: { file: typePresence.resolvedAt } } : {}),
		metadata: { flavor: ctx.flavor.flavor, generated: typePresence.present, shared: true },
	})

	// Shared zod for this type (kubb emits one if includesZod)
	const includesZod = ctx.flavor.flavor === 'app' || ctx.flavor.flavor === 'channel-app' || ctx.flavor.flavor === 'channel-api'
	if (includesZod) {
		const zodRel = sharedZodFilePath(name)
		const zodPresence = checkPresence(ctx, zodRel)
		const zodNodeId = sdkId({
			flavor: ctx.flavor.flavor,
			kind: 'sdk-zod',
			name: `${name.charAt(0).toLowerCase()}${name.slice(1)}Schema`,
		})
		addNode(ctx.graph, {
			id: zodNodeId,
			kind: 'sdk-zod',
			name: `${name.charAt(0).toLowerCase()}${name.slice(1)}Schema`,
			service: 'sdk',
			workspace: ctx.flavor.clientWorkspace,
			...(zodPresence.resolvedAt ? { location: { file: zodPresence.resolvedAt } } : {}),
			metadata: { flavor: ctx.flavor.flavor, generated: zodPresence.present, shared: true },
		})
	}
}
