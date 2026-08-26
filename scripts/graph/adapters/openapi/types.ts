// Minimal OpenAPI 3.1 shape we actually consume — enough for our extraction.
export interface OpenApiSpec {
	openapi: string
	info: { title: string; version: string }
	paths: Record<string, OpenApiPathItem>
	components?: {
		schemas?: Record<string, OpenApiSchema>
	}
}

export interface OpenApiPathItem {
	get?: OpenApiOperation
	post?: OpenApiOperation
	put?: OpenApiOperation
	patch?: OpenApiOperation
	delete?: OpenApiOperation
	head?: OpenApiOperation
	options?: OpenApiOperation
	trace?: OpenApiOperation
}

export type HttpMethod = keyof OpenApiPathItem

export interface OpenApiOperation {
	operationId: string
	tags?: string[]
	description?: string
	summary?: string
	parameters?: OpenApiParameter[]
	requestBody?: { content?: Record<string, { schema?: OpenApiSchema }> }
	responses?: Record<string, { content?: Record<string, { schema?: OpenApiSchema }> }>
}

export interface OpenApiParameter {
	name: string
	in: 'query' | 'path' | 'header' | 'cookie'
	schema?: OpenApiSchema
	required?: boolean
}

export interface OpenApiSchema {
	type?: string | string[]
	enum?: unknown[]
	properties?: Record<string, OpenApiSchema>
	items?: OpenApiSchema
	$ref?: string
	[key: string]: unknown
}

/**
 * SDK flavor — encodes (sdk-language × backend-source). Polyglot template
 * emits 3 SDK languages × 3 backend languages = up to 9 flavors. The string
 * form `<sdk-lang>:<backend-lang>` is used as both an ID segment and a
 * filter key.
 *
 * Legacy single-segment flavors (`app`, `api`, `channel-app`, `channel-api`)
 * are kept for backward-compat in `sdkId()`; new emissions use the polyglot
 * tuple form below.
 */
export type SdkLanguage = 'typescript' | 'go'
export type BackendLanguage = 'typescript' | 'go'

export type SdkFlavor = `${SdkLanguage}:${BackendLanguage}` | 'app' | 'api' | 'channel-app' | 'channel-api'

export interface FlavorPaths {
	flavor: SdkFlavor
	sdkLang: SdkLanguage
	backendLang: BackendLanguage
	clientWorkspace: string // e.g. `client-typescript`
	apiWorkspace: string // e.g. `api-go`
	specPath: string
	srcRoot: string // e.g. packages/client/dist/typescript/src/go
	distRoot: string // same as srcRoot for the polyglot layout
}
