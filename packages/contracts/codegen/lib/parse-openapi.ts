import { parse as parseYaml } from 'yaml'

export type FieldType =
	| { kind: 'string' }
	| { kind: 'literal'; value: string }
	| { kind: 'string-enum'; values: string[] }
	| { kind: 'enum-ref'; ref: string }
	| { kind: 'union-ref'; ref: string }
	| { kind: 'boolean' }
	| { kind: 'integer'; format?: 'int32' | 'int64' }
	| { kind: 'number'; format?: 'float' | 'float32' | 'float64' }
	| { kind: 'date-time' }
	| { kind: 'url' }
	| { kind: 'array'; items: FieldType }
	| { kind: 'unknown' }

export interface EventField {
	name: string
	type: FieldType
	required: boolean
	doc?: string
}

export interface ParsedEnum {
	name: string
	values: string[]
	doc?: string
}

export interface ParsedUnion {
	name: string
	refs: string[]
	doc?: string
}

export interface ParsedEvent {
	modelName: string
	wireName: string
	doc?: string
	fields: EventField[]
}

export interface ParsedContracts {
	enums: ParsedEnum[]
	unions: ParsedUnion[]
	events: ParsedEvent[]
}

interface OASchema {
	type?: string
	format?: string
	enum?: string[]
	items?: OASchema
	properties?: Record<string, OASchema>
	required?: string[]
	allOf?: Array<{ $ref?: string } | OASchema>
	oneOf?: Array<{ $ref?: string }>
	anyOf?: Array<{ $ref?: string }>
	discriminator?: { propertyName: string }
	description?: string
	$ref?: string
}

interface OADoc {
	components?: { schemas?: Record<string, OASchema> }
}

const ENVELOPE = 'IntegrationEvent'

export function parseContractsOpenapi(yamlText: string): ParsedContracts {
	const doc = parseYaml(yamlText) as OADoc
	const schemas = doc.components?.schemas ?? {}

	const enums: ParsedEnum[] = []
	const unions: ParsedUnion[] = []
	const events: ParsedEvent[] = []

	// First pass: enums + unions (so event parsing can distinguish union refs).
	for (const [name, schema] of Object.entries(schemas)) {
		if (schema.type === 'string' && Array.isArray(schema.enum)) {
			enums.push({ name, values: schema.enum, doc: schema.description })
			continue
		}
		const variants = schema.oneOf ?? schema.anyOf
		if (Array.isArray(variants) && variants.length > 0 && variants.every(v => typeof v.$ref === 'string')) {
			unions.push({ name, refs: variants.map(v => v.$ref!.split('/').pop()!), doc: schema.description })
		}
	}

	const unionNames = new Set(unions.map(u => u.name))

	// Second pass: events, remapping any enum-ref that targets a union.
	for (const [name, schema] of Object.entries(schemas)) {
		const ev = tryParseEvent(name, schema, schemas)
		if (!ev) continue
		for (const f of ev.fields) {
			if (f.type.kind === 'enum-ref' && unionNames.has(f.type.ref)) {
				f.type = { kind: 'union-ref', ref: f.type.ref }
			}
		}
		events.push(ev)
	}

	return { enums, unions, events }
}

function tryParseEvent(modelName: string, schema: OASchema, all: Record<string, OASchema>): ParsedEvent | null {
	if (!Array.isArray(schema.allOf)) return null
	const extendsEnvelope = schema.allOf.some(s => '$ref' in s && s.$ref?.endsWith(`/${ENVELOPE}`))
	if (!extendsEnvelope) return null

	// TypeSpec emits properties at the schema root alongside allOf; fall back to that when
	// no inline OASchema is present inside allOf.
	const ownSchema = (schema.allOf.find(s => !('$ref' in s)) as OASchema | undefined) ?? {
		properties: schema.properties,
		required: schema.required,
	}

	const envSchema = all[ENVELOPE]
	if (!envSchema) return null

	const requiredSet = new Set([...(envSchema.required ?? []), ...(ownSchema.required ?? [])])
	const props: Record<string, OASchema> = { ...(envSchema.properties ?? {}), ...(ownSchema.properties ?? {}) }

	// wireName comes from the `name` property's const-enum
	const nameProp = props.name
	const wireName = nameProp?.enum?.[0]
	if (!wireName) return null

	const fields: EventField[] = Object.entries(props).map(([fieldName, fs]) => ({
		name: fieldName,
		type: typeOf(fs),
		required: requiredSet.has(fieldName),
		doc: fs.description,
	}))

	return { modelName, wireName, doc: schema.description, fields }
}

function typeOf(s: OASchema): FieldType {
	if (s.$ref) {
		const name = s.$ref.split('/').pop()!
		return { kind: 'enum-ref', ref: name }
	}
	// TypeSpec wraps a property's $ref in `allOf:` when the property carries
	// its own annotation (e.g. @doc). The ref appears as the single element of
	// allOf alongside top-level description/etc — unwrap it back to enum-ref.
	if (Array.isArray(s.allOf) && s.allOf.length === 1) {
		const inner = s.allOf[0]
		if (inner && '$ref' in inner && typeof inner.$ref === 'string') {
			const name = inner.$ref.split('/').pop()!
			return { kind: 'enum-ref', ref: name }
		}
	}
	if (s.enum && s.enum.length === 1) return { kind: 'literal', value: s.enum[0]! }
	if (s.type === 'string' && s.enum && s.enum.length > 1) return { kind: 'string-enum', values: s.enum }
	if (s.type === 'string') {
		if (s.format === 'date-time') return { kind: 'date-time' }
		if (s.format === 'uri') return { kind: 'url' }
		return { kind: 'string' }
	}
	if (s.type === 'integer') {
		const f = s.format
		return { kind: 'integer', format: f === 'int32' ? 'int32' : f === 'int64' ? 'int64' : undefined }
	}
	if (s.type === 'number') {
		const f = s.format
		return { kind: 'number', format: f === 'float' || f === 'float32' || f === 'float64' ? (f as 'float') : undefined }
	}
	if (s.type === 'boolean') return { kind: 'boolean' }
	if (s.type === 'array' && s.items) return { kind: 'array', items: typeOf(s.items) }
	return { kind: 'unknown' }
}
