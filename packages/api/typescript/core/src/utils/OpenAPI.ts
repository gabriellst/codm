import { Config } from './Config'
import { Controller } from '../types/Controller'
import { HttpStatusCode, MimeTypes } from '../types/Http'
import { Router } from '../types/Router'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z, type ZodType } from 'zod'
import { OpenAPIV3 } from 'openapi-types'
import { AllErrors, GlobalErrorMapper } from './GlobalErrorMapper'
import { McpExposure, operationIdOf } from './McpExposure'
import { API_PUBLIC } from './paths'

const SPECIFICATION_OUTPUT_DIR = join(API_PUBLIC, 'docs')

// Type for Zod schema with meta method (Zod v4)
interface SchemaWithMeta {
	meta?: () => { examples?: unknown[] } | undefined
}

// Type for refinement metadata
interface RefinementMetadata {
	function: string
	error?: string
	path?: (string | number)[]
}

// Type for Zod v4 internal check structure
interface ZodCheck {
	_zod?: {
		def?: {
			// Refinement function
			fn?: (...args: unknown[]) => unknown
			// Path for error targeting
			path?: (string | number)[]
			// Error message function
			error?: () => string
		}
	}
}

// Type for Zod schema internal definition
interface ZodDef {
	type?: string
	checks?: ZodCheck[]
	shape?: Record<string, ZodType> | (() => Record<string, ZodType>)
}

// Helper to extract examples from Zod schema meta (Zod v4 uses .meta() method)
const extractExamples = (schema: ZodType): unknown[] => {
	const schemaWithMeta = schema as SchemaWithMeta
	const meta = schemaWithMeta.meta?.()
	return meta?.examples ?? []
}

/**
 * Extracts refinement functions and metadata from Zod v4 schemas (shallow - current level only)
 *
 * Refinements in Zod v4 are stored as custom checks in the schema's internal structure.
 * This function extracts refinements ONLY at the current schema level, not recursively.
 * - The refinement function source code
 * - Optional error message for validation errors
 * - Optional path for targeting specific fields
 *
 * @param schema - The Zod schema to extract refinements from
 * @returns Array of refinement metadata objects at this level only
 *
 * @example
 * const schema = z.object({ name: z.string() }).refine(
 *   data => data.name !== 'admin',
 *   { error: 'Name cannot be admin', path: ['name'] }
 * )
 * extractRefinementsShallow(schema)
 * // Returns: [{
 * //   function: "(data) => data.name !== 'admin'",
 * //   error: "Name cannot be admin",
 * //   path: ["name"]
 * // }]
 */
const extractRefinementsShallow = (schema: ZodType): RefinementMetadata[] => {
	const refinements: RefinementMetadata[] = []
	const def = (schema as { _def?: ZodDef })._def

	if (!def) return refinements

	// Zod v4: Refinements are stored in _def.checks as custom checks
	// The actual refinement function is located at check._zod.def.fn
	// Optional message is at check._zod.def.error() (function that returns string)
	// Optional path is at check._zod.def.path (array)
	if (Array.isArray(def.checks)) {
		for (const check of def.checks) {
			if (check._zod?.def?.fn && typeof check._zod.def.fn === 'function') {
				const fnString = check._zod.def.fn.toString()
				const zodDef = check._zod.def

				const refinement: RefinementMetadata = {
					function: fnString,
				}

				// Extract error message if present
				if (typeof zodDef.error === 'function') {
					try {
						const errorMessage = zodDef.error()
						if (errorMessage && typeof errorMessage === 'string') {
							refinement.error = errorMessage
						}
					} catch {
						// Ignore errors from calling error function
					}
				}

				// Extract path if present
				if (zodDef.path && Array.isArray(zodDef.path)) {
					refinement.path = zodDef.path
				}

				refinements.push(refinement)
			}
		}
	}

	// NOTE: No recursive extraction - refinements stay at their schema level
	return refinements
}

/**
 * Recursively adds x-tpl-zod-refinements to JSON schema at each level where the
 * corresponding Zod schema has refinements.
 *
 * This ensures nested schemas (like AddressSchema inside CreateUnitInputSchema)
 * have their refinements placed at the correct level in the OpenAPI spec.
 *
 * NOTE: This is the legacy inline placement. `OpenAPI.processRefinementPlacement`
 * runs AFTER this to extract any inline refinement block into a named component.
 *
 * Nodes that are pure `$ref` objects are intentionally skipped: registered schemas
 * have their refinements placed directly on the component definition by
 * `liftDefinitions`, so annotating a `$ref` node would violate
 * `validateRefinementPlacement` (refinements must live at component roots only).
 *
 * @param jsonSchema - The JSON schema object to augment
 * @param zodSchema - The corresponding Zod schema
 */
const addRefinementsRecursively = (jsonSchema: Record<string, unknown>, zodSchema: ZodType): void => {
	// Skip pure $ref nodes — the target component carries refinements directly.
	if ('$ref' in jsonSchema && Object.keys(jsonSchema).length === 1) return

	// Extract refinements only at this level (non-recursive)
	const refinements = extractRefinementsShallow(zodSchema)
	if (refinements.length > 0) {
		jsonSchema['x-tpl-zod-refinements'] = refinements
	}

	const def = (zodSchema as { _def?: ZodDef & { options?: ZodType[] } })._def
	if (!def) return

	// Recurse into properties if this is an object schema
	if (def.type === 'object' && def.shape && jsonSchema.properties) {
		const shape = typeof def.shape === 'function' ? def.shape() : def.shape
		const properties = jsonSchema.properties as Record<string, Record<string, unknown>>

		for (const key in shape) {
			let propertyZodSchema = shape[key]
			const propertyJsonSchema = properties[key]

			if (propertyZodSchema && propertyJsonSchema) {
				// Unwrap optional schemas to get the inner type
				const propDef = (propertyZodSchema as { _def?: { type?: string; innerType?: ZodType } })._def
				if (propDef?.type === 'optional' && propDef.innerType) {
					propertyZodSchema = propDef.innerType
				}

				addRefinementsRecursively(propertyJsonSchema, propertyZodSchema)
			}
		}
	}

	// Recurse into union variants (discriminatedUnion / union → oneOf/anyOf in JSON Schema)
	if (def.type === 'union' && Array.isArray(def.options)) {
		const jsonVariants = (jsonSchema.oneOf ?? jsonSchema.anyOf) as Record<string, unknown>[] | undefined
		if (jsonVariants && jsonVariants.length === def.options.length) {
			for (let i = 0; i < def.options.length; i++) {
				addRefinementsRecursively(jsonVariants[i]!, def.options[i]!)
			}
		}
	}
}

// Convert a string to PascalCase (e.g., 'clinic_onboarding' → 'ClinicOnboarding', 'a' → 'A')
const toPascalCase = (value: string): string => {
	return value
		.split(/[^a-zA-Z0-9]+/)
		.filter(Boolean)
		.map(part => part.charAt(0).toUpperCase() + part.slice(1))
		.join('')
}

// Helper to check if a Zod schema is a Date type
const isDateSchema = (schema: unknown): boolean => {
	const def = (schema as { _def?: { type?: string } })._def
	return def?.type === 'date'
}

// Helper to convert Zod schema to JSON Schema using Zod v4's toJSONSchema.
// Returns a plain JSON object that may contain non-OpenAPI extension keys
// (`x-tpl-*`, `definitions`) — caller is responsible for post-processing.
const zodToJsonSchema = (schema: ZodType, io: 'input' | 'output' = 'input'): Record<string, unknown> => {
	try {
		const jsonSchema = z.toJSONSchema(schema, {
			target: 'openapi-3.0', // OAS 3.0: nullable types emit `{ ..., nullable: true }` instead of `anyOf: [..., { type: "null" }]`
			io, // 'input' for request schemas (before transforms), 'output' for response schemas
			unrepresentable: 'any', // Convert unrepresentable types to {}
			override: ctx => {
				// Detect z.unknown() (vs z.any()) and mark explicitly so the SDK generator
				// can emit TS `unknown` / Zod z.unknown() instead of the default `any`.
				const ctxDef = (ctx.zodSchema as { _def?: { type?: string } })._def
				if (ctxDef?.type === 'unknown') {
					Object.assign(ctx.jsonSchema, { 'x-tpl-unknown': true })
					return ctx.jsonSchema
				}

				// Convert Date types to string with date-time format
				if (isDateSchema(ctx.zodSchema)) {
					Object.assign(ctx.jsonSchema, { type: 'string', format: 'date-time' })
					return ctx.jsonSchema
				}
				// A string→boolean pipe (z.stringToBoolean()/z.stringbool(), with or without
				// .default()) is a coerced boolean query param. Its input-mode JSON schema says
				// `string` (the wire literal), but the contract type is boolean — emit boolean
				// so the SDK takes `boolean` and serializes it itself, instead of leaking a
				// loose `string` DTO to every consumer.
				const pipeDef = ctxDef as { type?: string; out?: { _def?: { type?: string } } } | undefined
				if (
					pipeDef?.type === 'pipe' &&
					pipeDef.out?._def?.type === 'boolean' &&
					(ctx.jsonSchema as Record<string, unknown>).type === 'string'
				) {
					Object.assign(ctx.jsonSchema, { type: 'boolean' })
					return ctx.jsonSchema
				}
				// A string schema carrying a boolean default is a coerced boolean used as a
				// query param (z.stringToBoolean()/z.stringbool().default(...)). Emit it as a
				// boolean so the generated SDK produces a valid `z.boolean().default(false)`
				// instead of the invalid `z.string().default(false)`.
				const boolDefaultJs = ctx.jsonSchema as Record<string, unknown>
				if (boolDefaultJs.type === 'string' && typeof boolDefaultJs.default === 'boolean') {
					boolDefaultJs.type = 'boolean'
					return ctx.jsonSchema
				}
				// When output mode produces {} (unrepresentable, e.g. .transform().refine()),
				// fall back to input representation to preserve type info
				if (io === 'output' && Object.keys(ctx.jsonSchema).length === 0) {
					try {
						const { $schema, ...inputSchema } = z.toJSONSchema(ctx.zodSchema, {
							target: 'openapi-3.0',
							io: 'input',
							unrepresentable: 'any',
						}) as Record<string, unknown>
						if (Object.keys(inputSchema).length > 0) {
							Object.assign(ctx.jsonSchema, inputSchema)
							return ctx.jsonSchema
						}
					} catch {
						// Fall through to default
					}
				}
				// OAS 3.0 canonicalization: collapse nullable forms to `{ ...X, nullable: true }`.
				// Forms handled:
				//   - `anyOf: [<schema>, { type: "null" }]`
				//   - `type: ["X", "null"]`
				// The openapi-3.0 target handles z.nullable() natively. This post-pass catches
				// any residual 3.1 shapes that slip through (e.g. from inner fallback schemas).
				const js = ctx.jsonSchema as Record<string, unknown>
				let rewritten = false
				if (Array.isArray(js.type)) {
					const types = js.type as string[]
					const nonNull = types.filter(t => t !== 'null')
					if (nonNull.length < types.length) {
						js.nullable = true
						if (nonNull.length === 1) js.type = nonNull[0]
						else if (nonNull.length > 1) js.type = nonNull
						else delete js.type
						rewritten = true
					}
				}
				if (Array.isArray(js.anyOf)) {
					const anyOf = js.anyOf as Record<string, unknown>[]
					const nonNull = anyOf.filter(s => s.type !== 'null')
					if (nonNull.length < anyOf.length) {
						js.nullable = true
						if (nonNull.length === 1) Object.assign(js, nonNull[0])
						else if (nonNull.length > 1) js.anyOf = nonNull
						else delete js.anyOf
						rewritten = true
					}
				}
				if (rewritten) return ctx.jsonSchema
				// Return undefined to use default processing
				return undefined
			},
		})

		// Remove $schema property as OpenAPI doesn't need it
		const { $schema, ...rest } = jsonSchema as Record<string, unknown>

		// Add refinements at each level recursively (Option B: schema-level placement)
		// This ensures nested schemas have their refinements at the correct level
		addRefinementsRecursively(rest, schema)

		return rest
	} catch {
		// Fallback for schemas that can't be converted
		return { type: 'object' }
	}
}

// Helper to get the shape properties from a Zod object schema
const getSchemaProperties = (schema: ZodType): Record<string, ZodType> | null => {
	if ('shape' in schema && typeof schema.shape === 'object') {
		return schema.shape as Record<string, ZodType>
	}
	return null
}

export class OpenAPI {
	private readonly spec: OpenAPIV3.Document = {
		openapi: '3.0.3',
		info: {
			version: Config.version,
			title: Config.name,
		},
		paths: {},
		components: {
			schemas: {},
		},
	}

	private readonly reusableSchemas = new Map<string, OpenAPIV3.SchemaObject>()

	// Map from sorted enum values → enum name (e.g., '["ALL","RECENT"]' → 'PatientListTab')
	private readonly enumNameMap = new Map<string, string>()

	// Map from component id → original ZodType for registered schemas (populated by
	// registerSchemas). Used by liftDefinitions to attach x-tpl-zod-refinements on the
	// component definition rather than on $ref nodes at use-sites.
	private readonly registeredZodSchemas = new Map<string, ZodType>()

	/**
	 * The MCP exposure of THIS emission — built from the routers handed to `generateSpecification` and
	 * discarded with it. Its predecessor was a module-level `Map` in `utils/McpScopeRegistry.ts`,
	 * populated by a side-effect import from the api package; the `static mcpScopes` on the controller
	 * removes the crossing entirely, so there is nothing to register and nothing to order at boot.
	 */
	private mcpExposure = McpExposure.fromClasses([])

	/**
	 * Register enums from all contexts so OpenAPI can name them correctly.
	 * Uses the same barrel export pattern as controllers/middlewares/use cases.
	 *
	 * @example
	 * import * as sharedEnums from '../enums'
	 * import * as clinicEnums from '@clinic/enums'
	 * openapi.registerEnums({ ...sharedEnums, ...clinicEnums })
	 */
	registerEnums(enums: Record<string, unknown>): void {
		for (const [name, enumObj] of Object.entries(enums)) {
			if (typeof enumObj === 'object' && enumObj !== null) {
				const values = Object.values(enumObj)
					.filter(v => typeof v === 'string')
					.sort()
				if (values.length > 0) {
					const key = JSON.stringify(values)
					this.enumNameMap.set(key, name)
				}
			}
		}
	}

	/**
	 * Register named Zod object schemas so they appear as reusable `$ref` components
	 * in the OpenAPI spec. The component name is derived from the export key by
	 * stripping a trailing `Schema` suffix (e.g. `MoneySchema` → `Money`).
	 *
	 * Mirrors `registerEnums`. Call once at startup after `registerEnums`.
	 *
	 * SECURITY — register ONLY value objects (`objects/`) + contract DTO schemas (shapes already on the
	 * wire). NEVER register entity (write-model) schemas: a registered schema's `.refine()` source is
	 * emitted verbatim into the PUBLIC `openapi.json` + the client SDK (see `extractRefinementsShallow`,
	 * which calls `fn.toString()`), and its full internal field set would be exposed. Anything inside a
	 * registered schema's `.refine()` is public by design — keep sensitive/domain invariants in the
	 * entity + use-case (server-only), never in a wire schema.
	 *
	 * @example
	 * import { MoneySchema, SignedMoneySchema } from '@shared/objects/Money'
	 * openapi.registerSchemas({ MoneySchema, SignedMoneySchema })
	 */
	registerSchemas(schemas: Record<string, unknown>): void {
		for (const [name, schema] of Object.entries(schemas)) {
			// Accept only Zod schema instances (duck-type via _zod or ~standard).
			// ZodType is a type-only import so instanceof is not available; both
			// internal flags are reliable Zod v4 presence markers.
			if (!schema || typeof schema !== 'object') continue
			if (!('_zod' in schema) && !('~standard' in schema)) continue

			const zodSchema = schema as ZodType

			// Skip if this instance is already registered (avoid double-register)
			if (z.globalRegistry.get(zodSchema) !== undefined) continue

			const id = name.replace(/Schema$/, '')
			z.globalRegistry.add(zodSchema, { id })
			// Also store the Zod schema keyed by id so liftDefinitions can reach it
			// and apply addRefinementsRecursively on the component definition.
			this.registeredZodSchemas.set(id, zodSchema)
		}
	}

	/**
	 * Lifts `definitions.<id>` entries produced by `z.toJSONSchema` (when schemas are
	 * registered in `z.globalRegistry`) into `components.schemas.<id>`, and rewrites
	 * all `#/definitions/<id>` refs to `#/components/schemas/<id>` throughout the
	 * given JSON schema object (mutated in place).
	 *
	 * Each lifted definition is stored in `reusableSchemas` for dedup; its cosmetic
	 * `id` field (written by Zod) is stripped. The definitions key is removed from
	 * the output. The inner content of each lifted schema still flows through the
	 * normal `processSchemaForEnums` pass so nested enum fields resolve to $refs.
	 */
	private liftDefinitions(jsonSchema: Record<string, unknown>, _parentName: string): void {
		const definitions = jsonSchema.definitions as Record<string, unknown> | undefined
		if (!definitions || Object.keys(definitions).length === 0) return

		// First pass: store each definition in reusableSchemas (if not already present)
		// so that cross-refs between definitions resolve correctly.
		for (const [id, defSchemaRaw] of Object.entries(definitions)) {
			if (this.reusableSchemas.has(id)) continue
			if (typeof defSchemaRaw !== 'object' || defSchemaRaw === null) continue

			// Strip the cosmetic `id` field Zod writes inside the definition
			const { id: _id, ...defSchema } = defSchemaRaw as Record<string, unknown>

			// If the original Zod schema was registered (has top-level or nested refinements),
			// apply those refinements directly onto the component body now — BEFORE enum
			// promotion — so that x-tpl-zod-refinements ends up on the component root
			// rather than on any $ref node at use-sites (which would fail
			// validateRefinementPlacement).
			const zodSchema = this.registeredZodSchemas.get(id)
			if (zodSchema) {
				addRefinementsRecursively(defSchema, zodSchema)
			}

			// Run enum promotion so inner enum fields (e.g. MoneySchema.currency) resolve to $refs
			const promoted = this.processSchemaForEnums(defSchema, id) as OpenAPIV3.SchemaObject

			// Rewrite any #/definitions/<id> refs *inside* this lifted body to #/components/schemas/<id>.
			// A registered schema that references another registered schema (e.g. MoneyMetric → SignedMoney,
			// Tally → NumberMetric/MoneyMetric) emits #/definitions refs here; the second-pass rewrite below
			// only touches the parent jsonSchema, not the bodies stored in reusableSchemas, so do it now.
			this.rewriteDefinitionRefs(promoted)
			this.reusableSchemas.set(id, promoted)
		}

		// Second pass: rewrite all #/definitions/<id> refs to #/components/schemas/<id>
		// throughout the output schema (which has already had definitions stripped below)
		this.rewriteDefinitionRefs(jsonSchema)

		// Remove the definitions key from the output so it doesn't appear in the spec
		delete jsonSchema.definitions
	}

	/**
	 * Recursively rewrites `{ "$ref": "#/definitions/<id>" }` to
	 * `{ "$ref": "#/components/schemas/<id>" }` throughout a JSON schema object.
	 */
	private rewriteDefinitionRefs(node: unknown): void {
		if (!node || typeof node !== 'object') return
		if (Array.isArray(node)) {
			for (const item of node) this.rewriteDefinitionRefs(item)
			return
		}
		const obj = node as Record<string, unknown>
		if (typeof obj.$ref === 'string' && obj.$ref.startsWith('#/definitions/')) {
			obj.$ref = obj.$ref.replace('#/definitions/', '#/components/schemas/')
		}
		for (const value of Object.values(obj)) {
			if (value && typeof value === 'object') this.rewriteDefinitionRefs(value)
		}
	}

	async generateSpecification(routers: Router[]): Promise<void> {
		this.registerErrorSchemas()
		// BEFORE the walk: `buildOperation` reads it per operation.
		this.mcpExposure = McpExposure.fromRouters(routers)

		for (const router of routers) {
			for (const controller of router.controllers ?? []) {
				this.buildPath(controller, router)
			}
		}

		this.addReusableSchemasToSpec()
		this.validateSpec()
		this.validateRefinementPlacement()

		// The FULL registered error-code vocabulary (core seed + every context's
		// registerErrorCodes, loaded by the router imports above). The SDK renders this into a
		// typed union so app locale catalogues can be compile-checked against it — a missing
		// translation is a tsc error, not a runtime raw-key render.
		;(this.spec as OpenAPIV3.Document & { 'x-error-codes'?: string[] })['x-error-codes'] = Object.keys(GlobalErrorMapper).sort()

		// THE MANIFEST ITSELF, published at the ROOT — `scope → the operationIds declared under it`.
		//
		// NOT a convenience index over the per-operation `x-mcp-scope` stamps: it is the OTHER SIDE of
		// them, and it exists so the SDK generator's tool-count assertion has something to compare
		// AGAINST. Deriving the expected surface by reading those same stamps would make the assertion
		// tautological — the artifact that can break verifying itself — and a scope whose tag filter
		// matched nothing would then emit zero tools with a green build, silently degrading the agent
		// onto the INFERRED path that AC-6.4/AC-6.7 exist to distinguish from the declared one.
		//
		// Emitted only when something declared, so a service with no MCP surface stays byte-identical.
		const manifest = this.mcpExposure.manifest()
		if (Object.keys(manifest).length > 0) {
			;(this.spec as OpenAPIV3.Document & { 'x-mcp-scopes'?: Record<string, string[]> })['x-mcp-scopes'] = manifest
		}

		if (process.env.EMIT_OPENAPI === 'true') {
			const filePath = `${SPECIFICATION_OUTPUT_DIR}/openapi.json`
			await writeFile(filePath, JSON.stringify(this.spec, null, 2))
		}
	}

	/**
	 * Processes a Zod discriminated union into the OpenAPI 3.1 form:
	 * `{ oneOf: [ { ...variant }, ... ], discriminator: { propertyName } }`.
	 *
	 * Variants are emitted **inline** in `oneOf` rather than hoisted into one named
	 * component each. A discriminated union is an anonymous shape of one operation —
	 * naming every branch (`<parentName>_<PascalValue>`) only made Kubb fan the SDK
	 * out into one file per branch (`GetDashboardOutputMULTIGLOBAL.ts`, …) with no
	 * consumer benefit: Kubb degrades the refs to a plain `z.union` anyway and nothing
	 * imports the branch types. Inlining keeps the whole union in the operation's own
	 * file. Nested enums/refinements inside a variant are still promoted to shared
	 * `$ref` components (via processSchemaForEnums / processRefinementPlacement).
	 *
	 * No `discriminator` object is emitted: OpenAPI 3.1 `discriminator.mapping` requires
	 * `$ref` targets, which inline branches don't have, and oapi-codegen (Go client)
	 * hard-fails a discriminator whose branches aren't all mapped. The per-branch `kind`
	 * literal already narrows the union for every consumer. Returns the schema unchanged
	 * if it is not a discriminated union.
	 */
	private processDiscriminatedUnions(jsonSchema: Record<string, unknown>, zodSchema: ZodType, parentName: string): Record<string, unknown> {
		const def = (zodSchema as { _def?: ZodDef & { discriminator?: string; options?: ZodType[] } })._def
		if (def?.type !== 'union' || !def.discriminator || !Array.isArray(def.options)) {
			return jsonSchema
		}

		const discriminatorProp = def.discriminator
		const variants = def.options

		// JSON Schema from Zod gives oneOf with ordered variants matching def.options order
		const jsonVariants = (jsonSchema.oneOf ?? jsonSchema.anyOf) as Record<string, unknown>[] | undefined
		if (!jsonVariants || jsonVariants.length !== variants.length) {
			return jsonSchema
		}

		const branches: OpenAPIV3.SchemaObject[] = []

		for (let i = 0; i < variants.length; i++) {
			const variant = variants[i]!
			const variantJson = jsonVariants[i]!

			// Extract the discriminator const value from the variant's shape — used only to
			// derive a stable name prefix for any nested components this variant promotes.
			const variantDef = (variant as { _def?: ZodDef })._def
			if (!variantDef?.shape) continue
			const shape = typeof variantDef.shape === 'function' ? variantDef.shape() : variantDef.shape
			const discField = shape[discriminatorProp] as ZodType | undefined
			if (!discField) continue

			const discDef = (discField as { _def?: { type?: string; values?: unknown[]; value?: unknown } })._def
			let constValue: unknown
			if (discDef?.values && Array.isArray(discDef.values) && discDef.values.length > 0) {
				constValue = discDef.values[0]
			} else if (discDef && 'value' in discDef) {
				constValue = discDef.value
			}

			if (typeof constValue !== 'string' && typeof constValue !== 'number' && typeof constValue !== 'boolean') {
				continue
			}

			const variantName = `${parentName}_${toPascalCase(String(constValue))}`

			// Promote any inline refined subschemas / enums inside the variant into named
			// `$ref` components (keyed off variantName), same treatment as the parent schema.
			this.processRefinementPlacement(variantJson, variantName)
			const variantProcessed = this.processSchemaForEnums(variantJson, variantName) as OpenAPIV3.SchemaObject

			// Inline the processed variant — do NOT register it as its own component.
			branches.push(variantProcessed)
		}

		if (branches.length === 0) {
			return jsonSchema
		}

		return { oneOf: branches }
	}

	/**
	 * Walks the given JSON schema and extracts any subschema that carries
	 * `x-zod-refinements` into a named component (if it isn't already a $ref).
	 *
	 * Only property-level extraction is needed — top-level refinements on named
	 * components are fine (they live at `components.schemas.<Name>`).
	 *
	 * @param jsonSchema - The JSON schema to process (mutated in place)
	 * @param parentName - The component name used to synthesize nested names
	 */
	private processRefinementPlacement(jsonSchema: Record<string, unknown>, parentName: string): void {
		if (!jsonSchema || typeof jsonSchema !== 'object') return

		// Recurse into properties
		if (jsonSchema.properties && typeof jsonSchema.properties === 'object') {
			const properties = jsonSchema.properties as Record<string, Record<string, unknown>>

			for (const [key, propSchema] of Object.entries(properties)) {
				if (!propSchema || typeof propSchema !== 'object') continue
				// Skip already-extracted references
				if ('$ref' in propSchema) continue

				// Recurse first so deeper nested refined subschemas get extracted into
				// their own named components before we potentially hoist this one.
				const childName = `${parentName}${toPascalCase(key)}`
				this.processRefinementPlacement(propSchema, childName)

				if ('x-tpl-zod-refinements' in propSchema) {
					const syntheticName = this.generateUniqueSchemaName(childName, '')
					// Run enum promotion BEFORE storing so any inline enum: [...] nested
					// inside the extracted component (e.g. MoneySchema.currency inside a
					// refined `amount` property) is resolved to a $ref to the named enum
					// component rather than remaining as an un-named inline enum array.
					const promoted = this.processSchemaForEnums(propSchema, childName) as OpenAPIV3.SchemaObject
					this.reusableSchemas.set(syntheticName, promoted)
					properties[key] = { $ref: `#/components/schemas/${syntheticName}` }
				}
			}
		}

		// Recurse into union variants — variants registered as named components by
		// processDiscriminatedUnions are already at top level so they're fine, but
		// inline oneOf/anyOf arrays still need a walk.
		const variants = jsonSchema.oneOf ?? jsonSchema.anyOf
		if (Array.isArray(variants)) {
			for (let i = 0; i < variants.length; i++) {
				const variant = variants[i] as Record<string, unknown>
				if (variant && typeof variant === 'object' && !('$ref' in variant)) {
					this.processRefinementPlacement(variant, `${parentName}Variant${i}`)
				}
			}
		}
	}

	/**
	 * Consolidated conversion helper: Zod → JSON Schema → definition lifting
	 * → discriminator processing → refinement extraction → enum reference processing.
	 * Returns the final schema ready to be used in paths/components.
	 */
	private buildComponentSchema(schema: ZodType, parentName: string, io: 'input' | 'output' = 'input'): OpenAPIV3.SchemaObject {
		const jsonSchema = zodToJsonSchema(schema, io)
		// Lift any z.globalRegistry-registered schemas from `definitions` into
		// `components.schemas` and rewrite refs before the other passes run.
		this.liftDefinitions(jsonSchema, parentName)
		const discriminated = this.processDiscriminatedUnions(jsonSchema, schema, parentName)
		this.processRefinementPlacement(discriminated, parentName)
		return this.processSchemaForEnums(discriminated, parentName) as OpenAPIV3.SchemaObject
	}

	/**
	 * Second validation pass: enforces that x-zod-refinements only appears on
	 * named components at `components.schemas.*`. Inline refinements anywhere else
	 * indicate a bug in processRefinementPlacement.
	 */
	private validateRefinementPlacement(): void {
		const violations: string[] = []
		const componentRoot = this.spec.components?.schemas ?? {}

		const walk = (node: unknown, path: string, isComponentRoot: boolean) => {
			if (!node || typeof node !== 'object') return
			if (Array.isArray(node)) {
				node.forEach((item, i) => {
					walk(item, `${path}[${i}]`, false)
				})
				return
			}

			const obj = node as Record<string, unknown>
			if ('$ref' in obj && Object.keys(obj).length === 1) return

			if ('x-tpl-zod-refinements' in obj && !isComponentRoot) {
				violations.push(`${path}: x-zod-refinements found outside components.schemas.* root`)
			}

			for (const [key, value] of Object.entries(obj)) {
				if (key === 'x-tpl-zod-refinements') continue
				walk(value, path ? `${path}.${key}` : key, false)
			}
		}

		for (const [key, value] of Object.entries(this.spec)) {
			if (key === 'components') continue
			walk(value, key, false)
		}

		for (const [name, schema] of Object.entries(componentRoot)) {
			// The component root itself is allowed to carry refinements; recurse
			// into its children as non-root.
			if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
				const obj = schema as Record<string, unknown>
				for (const [key, value] of Object.entries(obj)) {
					if (key === 'x-tpl-zod-refinements') continue
					walk(value, `components.schemas.${name}.${key}`, false)
				}
			}
		}

		if (violations.length > 0) {
			throw new Error(
				`OpenAPI refinement-placement validation failed (${violations.length} violation${violations.length === 1 ? '' : 's'}):\n` +
					violations.map(v => `  - ${v}`).join('\n'),
			)
		}
	}

	/**
	 * Walks the finished spec and fails if any enum: [...] appears outside
	 * components.schemas.* — every enum must be a $ref component so Kubb can
	 * emit a shared TS enum, not an ad-hoc literal union.
	 */
	private validateSpec(): void {
		const violations: string[] = []
		const componentRoot = this.spec.components?.schemas ?? {}

		const walk = (node: unknown, path: string, insideComponent: boolean) => {
			if (!node || typeof node !== 'object') return
			if (Array.isArray(node)) {
				node.forEach((item, i) => {
					walk(item, `${path}[${i}]`, insideComponent)
				})
				return
			}

			const obj = node as Record<string, unknown>
			// Skip $ref-only nodes (they're fine — the enum lives at the target)
			if ('$ref' in obj && Object.keys(obj).length === 1) return

			if ('enum' in obj && Array.isArray(obj.enum) && !insideComponent) {
				violations.push(`${path}: inline enum ${JSON.stringify(obj.enum)} — must be a $ref to components.schemas`)
			}

			for (const [key, value] of Object.entries(obj)) {
				walk(value, path ? `${path}.${key}` : key, insideComponent)
			}
		}

		// Walk everything outside components.schemas
		for (const [key, value] of Object.entries(this.spec)) {
			if (key === 'components') continue
			walk(value, key, false)
		}
		// Walk inside components.schemas with insideComponent=true so enums in named
		// components don't trip the check
		for (const [name, schema] of Object.entries(componentRoot)) {
			walk(schema, `components.schemas.${name}`, true)
		}

		if (violations.length > 0) {
			throw new Error(
				`OpenAPI spec validation failed (${violations.length} violation${violations.length === 1 ? '' : 's'}):\n` +
					violations.map(v => `  - ${v}`).join('\n'),
			)
		}
	}

	private registerErrorSchemas(): void {
		const allErrorNames = Object.keys(GlobalErrorMapper) as AllErrors[]

		const errorsSchema: OpenAPIV3.SchemaObject = {
			type: 'string',
			enum: allErrorNames.sort(),
			description: 'All possible error codes',
		}
		this.reusableSchemas.set('ApiErrors', errorsSchema)
	}

	getSpec(): OpenAPIV3.Document {
		return this.spec
	}

	getSpecJSON(): string {
		return JSON.stringify(this.spec)
	}

	private buildPath(controller: Controller, router: Router): void {
		const completePath = `/${this.spec.info.version}${router.path === '/' ? '' : router.path}${controller.path}`
		const parsedParamsPath = completePath.replace(/:(\w+)/g, '{$1}')
		const methods = Array.isArray(controller.method) ? controller.method : [controller.method]

		this.spec.paths[parsedParamsPath] = {
			...(this.spec.paths[parsedParamsPath] ?? {}),
			// `String(method)` is `local/no-enum-widening`'s own sanctioned opt-out: `methods` is
			// `HttpMethod[]` (a closed union) and `buildOperation` takes a plain `string`. PRE-EXISTING
			// violation, surfaced here only because this is the first change to stage the file. Typing
			// `buildOperation` as `HttpMethod` is the real fix, but it cascades into `buildOperationId`
			// and then `operationIdOf`, whose signature B2 T5 consumes — follow-up, not this commit.
			...Object.fromEntries(methods.map(method => [method, this.buildOperation(controller, router, String(method))])),
		}
	}

	private buildOpenAPIControllerResponse(controller: Controller): OpenAPIV3.ResponsesObject {
		const { outputSchema } = controller

		// Extract examples from the output schema meta
		const outputExamples = extractExamples(outputSchema)

		// Convert Zod schema to JSON Schema (output types for responses — after transforms)
		const parentName = `${controller.constructor.name.replace('Controller', '')}Output`
		const processedSchema = this.buildComponentSchema(outputSchema, parentName, 'output') as Record<string, unknown>

		// Promote to a named component when top-level refinements are present
		let finalSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject = processedSchema as OpenAPIV3.SchemaObject
		if ('x-tpl-zod-refinements' in processedSchema && !('$ref' in processedSchema)) {
			const componentName = this.generateUniqueSchemaName(parentName, '')
			this.reusableSchemas.set(componentName, processedSchema as OpenAPIV3.SchemaObject)
			finalSchema = { $ref: `#/components/schemas/${componentName}` }
		}

		return {
			[HttpStatusCode.OK]: {
				description: controller.description,
				content: {
					[controller.contentType]: {
						schema: finalSchema,
						...(outputExamples.length > 0 && {
							examples: this.formatExamplesForOpenAPI(outputExamples),
						}),
					},
				},
			},
		}
	}

	private buildOperation(controller: Controller, router: Router, method: string): OpenAPIV3.OperationObject {
		const operationId = this.buildOperationId(controller, method)
		// THE MCP CROSSING. The declaration is the controller's OWN `static mcpScopes` — read here off
		// the class during the same walk that builds the path, with no registry and no side-effect
		// module in between.
		//
		// Empty for every operation nobody declared — THE DEFAULT IS NOT EXPOSED, and that is the whole
		// security property: an endpoint born tomorrow is not a model-callable tool tomorrow.
		const mcpScopes = this.mcpExposure.scopesFor(operationId)
		return {
			tags: this.buildTags(router, mcpScopes),
			description: controller.description,
			operationId,
			requestBody: this.buildRequestBody(controller),
			parameters: this.buildRequestParams(controller),
			responses: this.buildOpenAPIControllerResponse(controller),
			// The DECLARATION OF RECORD: greppable, human-readable, survives into the committed spec.
			// Emitted only when non-empty so the 34 untouched operations stay byte-identical.
			...(mcpScopes.length > 0 && { 'x-mcp-scope': mcpScopes }),
		}
	}

	private buildTags(router: Router, mcpScopes: readonly string[]): string[] {
		// The tag is the CONTEXT NAME from the manifest — never the mount prefix (which is
		// uniformly empty; the old prefix-derived tag left every root-mounted operation with '').
		//
		// Plus, since Fase 6, one SYNTHETIC tag per MCP scope. This is not a stylistic duplicate of
		// `x-mcp-scope` above: `@kubb/plugin-oas` filters operations by `tag | operationId | path |
		// method | contentType` and by NOTHING else — no branch reads a vendor extension, none invokes a
		// predicate, and an unknown filter `type` falls through to `return false` SILENTLY (measured: an
		// `x-mcp-scope` filter emitted zero tools with a green build). The tag is the ONLY axis the tool
		// generator can see, and the `mcp:` prefix keeps it un-collidable with a context name.
		return [router.name, ...mcpScopes.map(scope => `mcp:${scope}`)]
	}

	private buildOperationId(controller: Controller, method: string): string {
		// THE rule, and it now has exactly one home (`utils/McpExposure.ts#operationIdOf`). It used to be
		// spelled here and copied by hand into `agent/mcp/manifest.ts`, with an architecture test
		// asserting set-equality between the two copies — a referee between two truths instead of one
		// truth with two callers.
		const methods = Array.isArray(controller.method) ? controller.method : [controller.method]
		return operationIdOf(controller, method, methods)
	}

	private buildRequestParams(controller: Controller): OpenAPIV3.ParameterObject[] {
		const { inputSchema } = controller

		const parameters: OpenAPIV3.ParameterObject[] = []

		// Get the shape properties from the Zod schema
		const properties = getSchemaProperties(inputSchema)
		if (!properties) return parameters

		const { query, params, headers } = properties as Record<string, ZodType | undefined>

		// Extract examples from input schema for params, query, and headers
		const inputExamples = extractExamples(inputSchema)
		const firstExample = inputExamples.length > 0 ? inputExamples[0] : {}

		if (params) {
			const pathParams = this.extractPathParameters(controller.path)
			const paramsExample = (firstExample as Record<string, unknown>)?.params as Record<string, unknown> | undefined

			for (const paramName of pathParams) {
				const param: OpenAPIV3.ParameterObject = {
					in: 'path',
					name: paramName,
					required: true,
					schema: { type: 'string' },
				}

				if (paramsExample?.[paramName]) {
					param.example = paramsExample[paramName]
				}

				parameters.push(param)
			}
		}

		if (query) {
			const queryExample = (firstExample as Record<string, unknown>)?.query as Record<string, unknown> | undefined
			const parentName = `${controller.constructor.name.replace('Controller', '')}Query`
			const processedSchema = this.buildComponentSchema(query, parentName)
			const requiredQueryParams = new Set(Array.isArray(processedSchema.required) ? processedSchema.required : [])

			// Extract individual query parameters from the schema
			if (processedSchema.properties) {
				for (const [paramName, paramSchema] of Object.entries(processedSchema.properties)) {
					const queryParam: OpenAPIV3.ParameterObject = {
						in: 'query',
						name: paramName,
						schema: paramSchema as OpenAPIV3.SchemaObject,
						required: requiredQueryParams.has(paramName),
					}

					if (queryExample?.[paramName]) {
						queryParam.example = queryExample[paramName]
					}

					parameters.push(queryParam)
				}
			}
		}

		if (headers) {
			const headersExample = (firstExample as Record<string, unknown>)?.headers as Record<string, unknown> | undefined
			const parentName = `${controller.constructor.name.replace('Controller', '')}Headers`
			const processedSchema = this.buildComponentSchema(headers, parentName)
			const requiredHeaders = new Set(Array.isArray(processedSchema.required) ? processedSchema.required : [])

			// Extract individual header parameters from the schema
			if (processedSchema.properties) {
				for (const [headerName, headerSchema] of Object.entries(processedSchema.properties)) {
					const headerParam: OpenAPIV3.ParameterObject = {
						in: 'header',
						name: headerName,
						schema: headerSchema as OpenAPIV3.SchemaObject,
						required: requiredHeaders.has(headerName),
					}

					if (headersExample?.[headerName]) {
						headerParam.example = headersExample[headerName]
					}

					parameters.push(headerParam)
				}
			}
		}

		return parameters
	}

	private extractPathParameters(path: string): string[] {
		const matches = path.match(/:(\w+)/g)
		return matches ? matches.map(match => match.substring(1)) : []
	}

	/**
	 * Filters refinements to only include those that reference a specific property path
	 * of the HttpRequest (e.g., 'body', 'query', 'headers', 'params', 'cookie', 'ctx').
	 *
	 * A refinement is included only if ALL its parameter property references are to the specified property.
	 * This prevents cross-property refinements (e.g., req.body.x !== req.query.y) from
	 * being incorrectly included in a single property's schema.
	 *
	 * Handles various parameter patterns:
	 * - Named parameters: `data`, `req`, `input`, `ctx`, `request`, etc.
	 * - Destructured parameters are skipped (too complex to transform safely)
	 *
	 * @param refinements - Array of refinement metadata objects
	 * @param propertyName - The property to filter for (e.g., 'body', 'query', 'headers', 'params', 'cookie', 'ctx')
	 * @returns Refinements that only reference the specified property
	 *
	 * @example
	 * filterRefinementsForProperty(
	 *   [{ function: "data.body.x !== data.body.y" }, { function: "req.body.x !== req.query.z" }],
	 *   "body"
	 * )
	 * // Returns: [{ function: "data.body.x !== data.body.y" }]
	 *
	 * @example
	 * filterRefinementsForProperty(
	 *   [{ function: "req.query.page > 0" }, { function: "req.query.page !== req.body.page" }],
	 *   "query"
	 * )
	 * // Returns: [{ function: "req.query.page > 0" }]
	 */
	private filterRefinementsForProperty(refinements: RefinementMetadata[], propertyName: string): RefinementMetadata[] {
		return refinements.filter(refinement => {
			const fnString = refinement.function

			// Skip destructured parameters in function signature - they're too complex to transform safely
			// e.g., ({ body }) => ..., ({ query, headers }) => ...
			if (fnString.includes('({')) {
				return false
			}

			// If refinement has a path, it's operating on a nested property
			// Since we're filtering for a specific property (body, query, headers, etc.), any refinement
			// with a path is likely operating on that property's nested fields
			// e.g., body.holder.document, query.page, headers.authorization, params.id, etc.
			// The path tells us which nested property it validates
			// This check should happen early, before checking function body patterns
			if (refinement.path && Array.isArray(refinement.path) && refinement.path.length > 0) {
				// Check if the function accesses the target property
				// Pattern: anyParam.propertyName. or anyParam.propertyName (end of string or non-word char)
				// This ensures we only include refinements that actually operate on the target property
				const accessesProperty = new RegExp(`\\b\\w+\\.${propertyName}\\.|\\b\\w+\\.${propertyName}\\b`).test(fnString)
				if (accessesProperty) {
					return true
				}
			}

			// Check if refinement uses destructuring inside the function body
			// e.g., const { body } = data, const { query } = req, const { headers } = request
			const hasDestructuring = fnString.includes(`const {`) || fnString.includes(`let {`) || fnString.includes(`var {`)

			if (hasDestructuring) {
				// Try to find destructuring of the target property
				// Match: const { body } = data, const { query } = req, const { headers } = request, etc.
				const destructurePattern = new RegExp(`(?:const|let|var)\\s*\\{\\s*${propertyName}\\s*\\}\\s*=\\s*\\w+`, 'g')
				if (destructurePattern.test(fnString)) {
					// This refinement destructures the target property, include it
					// e.g., const { body } = data means it operates on body
					// e.g., const { query } = req means it operates on query
					// e.g., const { headers } = request means it operates on headers
					return true
				}

				return false
			}

			// Match patterns like: paramName.propertyName.field
			// Captures any parameter name (data, req, input, ctx, request, etc.)
			const propertyMatches = fnString.match(/\b(\w+)\.(\w+)\./g)

			if (!propertyMatches || propertyMatches.length === 0) {
				// Check for direct property access without nested fields
				// e.g., data.body, req.query, request.headers (without .field)
				const directPropertyMatch = fnString.match(new RegExp(`\\b(\\w+)\\.${propertyName}\\b`))
				if (directPropertyMatch) {
					return true
				}
				// No parameter.property patterns found, skip this refinement
				return false
			}

			// Check if the refinement accesses the target property
			// For nested access like data.body.holder.document, req.query.page, headers.authorization, etc.
			// we need to check if the first property access is to the target property
			// e.g., "data.body.holder.document" → first match is "data.body." → prop = "body" ✓
			// e.g., "req.query.page" → first match is "req.query." → prop = "query" ✓
			// e.g., "request.headers.authorization" → first match is "request.headers." → prop = "headers" ✓
			// The key is: if the first property access is to the target property, then all subsequent
			// accesses are nested properties of that property
			const firstMatch = propertyMatches[0]
			if (firstMatch) {
				const parts = firstMatch.split('.')
				const prop = parts[1]
				// If the first property access is to the target property, include it
				// This handles nested properties like:
				// - data.body.phone, data.body.holder.document
				// - req.query.page, req.query.limit
				// - request.headers.authorization, request.headers['content-type']
				// - params.id, params.userId
				if (prop === propertyName) {
					return true
				}
			}

			// Fallback: check if all references are to the target property
			// (for cases where there are multiple property accesses at the same level)
			return propertyMatches.every(match => {
				// Extract the property name (the second word after the first dot)
				// e.g., "data.body." -> "body", "req.query." -> "query", "request.headers." -> "headers"
				const parts = match.split('.')
				const prop = parts[1]
				return prop === propertyName
			})
		})
	}

	private buildRequestBody(controller: Controller): OpenAPIV3.RequestBodyObject | undefined {
		const { inputSchema } = controller

		// Get the shape properties from the Zod schema
		const properties = getSchemaProperties(inputSchema)
		if (!properties) return undefined

		const body = properties.body as ZodType | undefined

		if (!body) {
			return undefined
		}

		// Extract examples from the input schema
		const inputExamples = extractExamples(inputSchema)
		const bodyExamples = inputExamples.map(example => (example as Record<string, unknown>)?.body).filter(Boolean)

		// Convert body schema to JSON Schema
		const parentName = `${controller.constructor.name.replace('Controller', '')}Body`
		const processedSchema = this.buildComponentSchema(body, parentName) as Record<string, unknown>

		// Extract and attach parent-level refinements that reference the body
		// These are refinements on inputSchema (not on body itself) like password confirmation
		// Note: Nested schema refinements are already added by zodToJsonSchema -> addRefinementsRecursively
		const parentRefinements = extractRefinementsShallow(inputSchema)
		if (parentRefinements.length > 0) {
			const bodyRefinements = this.filterRefinementsForProperty(parentRefinements, 'body')
			if (bodyRefinements.length > 0) {
				// Transform parent-level refinement functions to remove 'body.' prefix
				// e.g., "data.body.password" -> "data.password" since we're placing on body schema
				const transformedRefinements = bodyRefinements.map(refinement => {
					const fnString = refinement.function
					// Match pattern: paramName.body. and replace with paramName.
					const transformedFn = fnString.replace(/\b(\w+)\.body\./g, '$1.')
					return { ...refinement, function: transformedFn }
				})

				// Merge with existing refinements (from nested schemas) instead of overwriting
				const existingRefinements = (processedSchema['x-tpl-zod-refinements'] as RefinementMetadata[]) ?? []
				processedSchema['x-tpl-zod-refinements'] = [...existingRefinements, ...transformedRefinements]
			}
		}

		// Refinement placement rule: refinements must live on named components.
		// If the body schema carries top-level refinements, promote it to
		// components.schemas.<ControllerName>Body and emit a $ref at the path.
		let finalBodySchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject = processedSchema as OpenAPIV3.SchemaObject
		if ('x-tpl-zod-refinements' in processedSchema && !('$ref' in processedSchema)) {
			const componentName = this.generateUniqueSchemaName(parentName, '')
			this.reusableSchemas.set(componentName, processedSchema as OpenAPIV3.SchemaObject)
			finalBodySchema = { $ref: `#/components/schemas/${componentName}` }
		}

		return {
			content: {
				[MimeTypes['.json']]: {
					schema: finalBodySchema,
					...(bodyExamples.length > 0 && {
						examples: this.formatExamplesForOpenAPI(bodyExamples),
					}),
				},
			},
		}
	}

	// Process schema to extract and reference enum types
	private processSchemaForEnums(schema: unknown, path = ''): unknown {
		if (typeof schema !== 'object' || schema === null) {
			return schema
		}

		if (Array.isArray(schema)) {
			return schema.map(item => this.processSchemaForEnums(item, path))
		}

		const schemaObj = schema as Record<string, unknown>

		// Handle enums - create reusable schema
		if ('enum' in schemaObj && Array.isArray(schemaObj.enum)) {
			// Single-value enums collapse to const — no point in a named component
			// whose only purpose is to name a literal. OpenAPI 3.1 represents these
			// as { type, const: value }.
			if (schemaObj.enum.length === 1) {
				const { enum: _enumValues, ...rest } = schemaObj
				return { ...rest, const: schemaObj.enum[0] }
			}
			return this.handleEnumSchema(schemaObj, path)
		}

		// Convert anyOf with const values to enum
		if ('anyOf' in schemaObj && Array.isArray(schemaObj.anyOf)) {
			const constValues = schemaObj.anyOf
				.filter((item: unknown) => typeof item === 'object' && item !== null && 'const' in item)
				.map((item: unknown) => (item as { const: string }).const)

			if (constValues.length > 0) {
				const enumSchema = {
					type: 'string',
					enum: constValues.sort(),
					description: `Enum values: ${constValues.sort().join(', ')}`,
				}
				return this.handleEnumSchema(enumSchema, path)
			}
		}

		// `z.enumRecord(E, V)` emits an object keyed by E's members (explicit per-member properties,
		// kept so the SDK stays exactly keyed). Detect it — the property-key set matches a registered
		// enum — and emit that enum as a named component, so the generated SDK also carries an
		// iterable enum const. Without this, an enum used ONLY as enumRecord keys never produces an
		// `enum: [...]` array and so is never named (the way a `z.enum()` field would be).
		if (
			schemaObj.type === 'object' &&
			schemaObj.properties &&
			typeof schemaObj.properties === 'object' &&
			!Array.isArray(schemaObj.properties)
		) {
			const propKeys = Object.keys(schemaObj.properties as Record<string, unknown>)
			if (propKeys.length > 1) {
				const enumName = this.enumNameMap.get(JSON.stringify([...propKeys].sort()))
				if (enumName && !this.reusableSchemas.has(enumName)) {
					this.reusableSchemas.set(enumName, { type: 'string', enum: propKeys } as OpenAPIV3.SchemaObject)
				}
			}
		}

		// Process nested objects
		const result: Record<string, unknown> = {}
		for (const [key, value] of Object.entries(schemaObj)) {
			result[key] = this.processSchemaForEnums(value, path ? `${path}.${key}` : key)
		}

		return result
	}

	private handleEnumSchema(schema: Record<string, unknown>, path: string): Record<string, unknown> {
		// Check for exact match first
		const existingMatch = this.findExactMatch(schema)
		if (existingMatch) {
			return { $ref: `#/components/schemas/${existingMatch}` }
		}

		// Try to resolve the enum name from registered enums (by matching sorted values)
		const schemaName = this.resolveEnumName(schema) ?? this.generateUniqueSchemaName(path, '')
		this.reusableSchemas.set(schemaName, schema as OpenAPIV3.SchemaObject)
		return { $ref: `#/components/schemas/${schemaName}` }
	}

	private resolveEnumName(schema: Record<string, unknown>): string | null {
		if (!Array.isArray(schema.enum)) return null
		const key = JSON.stringify([...schema.enum].sort())
		return this.enumNameMap.get(key) ?? null
	}

	private generateSchemaName(path: string, type: string): string {
		if (path && !path.includes('.') && !path.includes('[') && path.length > 0) {
			return path
		}

		const pathParts = path.split('.').filter(part => part && !part.includes('['))
		const lastPart = pathParts[pathParts.length - 1] || 'schema'
		const baseName = lastPart.charAt(0).toUpperCase() + lastPart.slice(1)
		return baseName.endsWith(type) ? baseName : `${baseName}${type}`
	}

	private generateSchemaKey(schema: Record<string, unknown>): string | null {
		if (typeof schema !== 'object' || schema === null) return null
		return JSON.stringify(this.normalizeSchema(schema))
	}

	private findExactMatch(schema: Record<string, unknown>): string | null {
		const schemaKey = this.generateSchemaKey(schema)
		if (!schemaKey) return null

		for (const [key, existingSchema] of this.reusableSchemas) {
			if (this.generateSchemaKey(existingSchema as Record<string, unknown>) === schemaKey) {
				return key
			}
		}
		return null
	}

	private generateUniqueSchemaName(path: string, type: string): string {
		const baseName = this.generateSchemaName(path, type)
		if (!this.reusableSchemas.has(baseName)) return baseName

		let counter = 2
		while (this.reusableSchemas.has(`${baseName}${counter}`)) {
			counter++
		}
		return `${baseName}${counter}`
	}

	private normalizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
		const normalized: Record<string, unknown> = {}

		for (const [key, value] of Object.entries(schema)) {
			if (key === 'description' || key === 'title') {
				normalized[key] = value
			} else if (key === 'enum' && Array.isArray(value)) {
				normalized[key] = [...value].sort()
			} else if (typeof value === 'object' && value !== null) {
				if (Array.isArray(value)) {
					normalized[key] = value.map(item =>
						typeof item === 'object' && item !== null ? this.normalizeSchema(item as Record<string, unknown>) : item,
					)
				} else {
					normalized[key] = this.normalizeSchema(value as Record<string, unknown>)
				}
			} else {
				normalized[key] = value
			}
		}

		const sorted: Record<string, unknown> = {}
		Object.keys(normalized)
			.sort()
			.forEach(key => {
				sorted[key] = normalized[key]
			})

		return sorted
	}

	private addReusableSchemasToSpec(): void {
		for (const [schemaName, schema] of this.reusableSchemas) {
			if (this.spec.components?.schemas) {
				this.spec.components.schemas[schemaName] = schema
			}
		}
	}

	private formatExamplesForOpenAPI(examples: unknown[]): Record<string, OpenAPIV3.ExampleObject> {
		if (examples.length === 0) {
			return {}
		}

		const formatted: Record<string, OpenAPIV3.ExampleObject> = {}

		examples.forEach((example, index) => {
			const exampleKey = examples.length === 1 ? 'default' : `example${index + 1}`
			formatted[exampleKey] = {
				value: example,
				summary: examples.length === 1 ? 'Example' : `Example ${index + 1}`,
			}
		})

		return formatted
	}

	toJSON(): OpenAPIV3.Document {
		return this.spec
	}
}

// Singleton instance
export const openapi = new OpenAPI()
