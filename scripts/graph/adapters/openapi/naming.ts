// Mirror Kubb's naming conventions exactly.
// See packages/client/scripts/shared/kubb.ts for source-of-truth config.
//
// Layout (TS SDK, as of the polyglot rebuild):
//   client/<operationIdCamel>.ts          — pluginClient output (replaces old `http/<Tag>/…`)
//   hooks/use<OperationId>.ts             — pluginReactQuery output (flat, no tag folder)
//   zod/<operationIdCamel>Schema.ts       — pluginZod output (flat)
//   types/<OperationId>.ts                — pluginTs output (flat, Pascal name)
//
// Go SDK is a single bundled `client.gen.go` per (sdkLang × backendLang) — see
// extract.ts which short-circuits per-op presence checks for non-TS sdkLang.

/**
 * The operation's "real" tag, used as the `context` field on graph nodes.
 * Returns `_default` for operations with only empty/internal/external tags —
 * Kubb still emits files for them (flat under `client/`, `hooks/`, …), so the
 * extractor must surface a node and let the resolver match. Previously this
 * returned `null` and dropped the operation entirely, leaving controllers
 * pointing at non-existent sdk-operation nodes (5 ops × 2 flavors = 10 audit
 * misses, e.g. `GetSession`, `MyStores`, `StoreMembers`).
 */
export function tagOf(operation: { tags?: string[] }): string {
	const tag = operation.tags?.find(t => t && t !== 'internal' && t !== 'external')
	return tag ?? '_default'
}

export function isInternalOperation(operation: { tags?: string[] }): boolean {
	return operation.tags?.includes('internal') ?? false
}

export function isExternalOperation(operation: { tags?: string[] }): boolean {
	return operation.tags?.includes('external') ?? false
}

export function operationIdToCamel(operationId: string): string {
	return operationId.charAt(0).toLowerCase() + operationId.slice(1)
}

export function hookName(operationId: string): string {
	return `use${operationId.charAt(0).toUpperCase()}${operationId.slice(1)}`
}

// Kubb output paths (relative to flavor root). The `tag` argument is preserved
// for callers and metadata (graph nodes are still tagged by operation tag) but
// the on-disk layout is flat — kubb's pluginClient/Zod/ReactQuery no longer
// group by tag folder.
export function httpFilePath(_tag: string, operationId: string): string {
	return `client/${operationIdToCamel(operationId)}.ts`
}

export function hookFilePath(_tag: string, operationId: string): string {
	return `hooks/${hookName(operationId)}.ts`
}

export function zodFilePath(_tag: string, operationId: string): string {
	return `zod/${operationIdToCamel(operationId)}Schema.ts`
}

export function typeFilePath(operationId: string): string {
	return `types/${operationId}.ts`
}

export function sharedTypeFilePath(typeName: string): string {
	return `types/${typeName}.ts`
}

export function sharedZodFilePath(schemaName: string): string {
	const camel = schemaName.charAt(0).toLowerCase() + schemaName.slice(1)
	return `zod/${camel}Schema.ts`
}

// ── Go SDK ──
// oapi-codegen emits one bundled file per backend; presence is verified once
// per flavor rather than per operation.
export function goBundleFilePath(): string {
	return 'client.gen.go'
}
