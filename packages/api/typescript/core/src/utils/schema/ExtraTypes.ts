import { z, type ZodObject, type ZodRawShape, type ZodTypeAny, type ZodLiteral, ZodDiscriminatedUnion } from 'zod'
import { instanceInputSchemaMap } from './InstanceRegistry'
import { stringToInteger } from './Transforms'

/**
 * Branded return type of `z.instance()`. Carries the VO schema type `S` as a
 * phantom field so that the `.input()` type mapper can recover the wire-input
 * shape at the type level — without changing any runtime behaviour.
 *
 * `ZodInstance<S, T>` extends `z.ZodType<T, T | z.input<S>>`, so it is
 * assignable everywhere a `ZodType` is expected.
 */
export interface ZodInstance<S extends ZodTypeAny, T> extends z.ZodType<T, T | z.input<S>> {
	/** Phantom — never set at runtime; lets `.input()` recover the VO schema type. */
	readonly _voSchema?: S
}
import { BaseEventSchema } from '../../types/BaseEvent'
import { BaseDomainEventSchema } from '../../types/BaseDomainEvent'
import { BaseIntegrationEventSchema } from '../../types/BaseIntegrationEvent'

// Meta options with examples
interface SchemaOptions {
	examples?: unknown[]
}

type IntegrationEventObjectSchema<T extends ZodRawShape> = ZodObject<
	Omit<(typeof BaseIntegrationEventSchema)['shape'], 'payload' | 'name'> & { name: ZodLiteral<string>; payload: ZodObject<T> }
>

type IntegrationEventWithPayloadSchema<T extends ZodTypeAny> = ZodObject<
	Omit<(typeof BaseIntegrationEventSchema)['shape'], 'payload' | 'name'> & { name: ZodLiteral<string>; payload: T }
>

type DomainEventObjectSchema<T extends ZodRawShape> = ZodObject<
	Omit<(typeof BaseDomainEventSchema)['shape'], 'payload'> & { payload: ZodObject<T> }
>

type DomainEventWithPayloadSchema<T extends ZodTypeAny> = ZodObject<
	Omit<(typeof BaseDomainEventSchema)['shape'], 'payload'> & { payload: T }
>

type BaseEventObjectSchema<T extends ZodRawShape> = ZodObject<
	Omit<(typeof BaseEventSchema)['shape'], 'payload'> & { payload: ZodObject<T> }
>

// Helper to get examples from schema meta
const getExamples = (schema: ZodTypeAny): unknown[] => {
	// Access meta from the schema definition - Zod v4 uses 'def' property
	const def = (schema as unknown as { def?: { meta?: SchemaOptions } }).def
	return def?.meta?.examples ?? []
}

// Helper function to merge examples from two schemas
const mergeExamples = (baseExamples: unknown[] = [], additionalExamples: unknown[] = []) => {
	if (baseExamples.length === 0) return additionalExamples
	if (additionalExamples.length === 0) return baseExamples

	const merged: unknown[] = []

	// Create all possible combinations
	for (const baseExample of baseExamples) {
		for (const additionalExample of additionalExamples) {
			merged.push({
				...(baseExample as object),
				...(additionalExample as object),
			})
		}
	}

	return merged
}

// PaginatedQuery schema
export const PaginatedQuery = z
	.object({
		page: stringToInteger({ minimum: 1 }).default(1),
		limit: stringToInteger({ minimum: 1, maximum: 100 }).default(10),
		search: z.string().optional(),
	})
	.meta({
		examples: [
			{
				limit: 10,
				page: 1,
				search: 'Kitten drinking coffee.',
			},
		],
	})

/**
 * Builds a paginated query schema with additional properties
 */
export function paginatedQuery(properties?: undefined, options?: SchemaOptions): typeof PaginatedQuery
export function paginatedQuery<T extends ZodRawShape>(
	properties: T,
	options?: SchemaOptions,
): ZodObject<(typeof PaginatedQuery)['shape'] & T>
export function paginatedQuery<T extends ZodRawShape>(properties?: T, options?: SchemaOptions) {
	if (!properties) return PaginatedQuery

	const baseExamples = getExamples(PaginatedQuery)
	const mergedExamples = mergeExamples(baseExamples, options?.examples)

	return z
		.object({
			...PaginatedQuery.shape,
			...properties,
		})
		.meta({ examples: mergedExamples })
}

// PaginatedData base schema
export const PaginatedData = z
	.object({
		items: z.array(z.unknown()),
		total: z.number(),
		totalPages: z.number(),
	})
	.meta({ examples: [] })

/**
 * Builds a paginated response schema with typed items
 */
export function paginatedResponse<T extends ZodRawShape>(
	properties: T,
	options?: SchemaOptions,
): ZodObject<{
	items: z.ZodArray<ZodObject<T>>
	total: z.ZodNumber
	totalPages: z.ZodNumber
}> {
	const baseExamples = getExamples(PaginatedData)
	const mergedExamples = mergeExamples(baseExamples, options?.examples)

	const itemSchema = z.object(properties)
	const itemsArraySchema = z.array(itemSchema)

	return z
		.object({
			items: itemsArraySchema,
			total: z.number(),
			totalPages: z.number(),
		})
		.meta({ examples: mergedExamples }) as any
}

/**
 * Builds a base event schema with custom payload properties
 */
export function baseEvent(properties?: undefined, options?: SchemaOptions): typeof BaseEventSchema
export function baseEvent<T extends ZodRawShape>(properties: T, options?: SchemaOptions): BaseEventObjectSchema<T>
export function baseEvent<T extends ZodRawShape>(properties?: T, options?: SchemaOptions) {
	if (!properties) return BaseEventSchema.meta({ examples: options?.examples ?? [] })

	const payloadSchema = z.object(properties)
	const mergedExamples = options?.examples ?? []

	const { payload: _payload, ...baseShape } = BaseEventSchema.shape

	return z
		.object({
			...baseShape,
			payload: payloadSchema,
		})
		.meta({ examples: mergedExamples })
}

/**
 * Builds a domain event schema with custom payload properties
 */
export function domainEvent(properties?: undefined, options?: SchemaOptions): typeof BaseDomainEventSchema
export function domainEvent<T extends ZodTypeAny>(schema: T, options?: SchemaOptions): DomainEventWithPayloadSchema<T>
export function domainEvent<T extends ZodRawShape>(properties: T, options?: SchemaOptions): DomainEventObjectSchema<T>
export function domainEvent(properties?: ZodRawShape | ZodTypeAny, options?: SchemaOptions) {
	if (!properties) return BaseDomainEventSchema.meta({ examples: options?.examples ?? [] })

	const mergedExamples = options?.examples ?? []
	const { payload: _payload, ...baseShape } = BaseDomainEventSchema.shape

	const payloadSchema = '_zod' in properties ? properties : z.object(properties as ZodRawShape)

	return z
		.object({
			...baseShape,
			payload: payloadSchema,
		})
		.meta({ examples: mergedExamples })
}
/**
 * Builds an integration event schema with a baked-in z.literal name for discriminatedUnion support.
 */
export function integrationEvent(
	name: string,
	options?: SchemaOptions,
): ZodObject<{
	name: ZodLiteral<string>
	payload: (typeof BaseIntegrationEventSchema)['shape']['payload']
	ownerId: (typeof BaseIntegrationEventSchema)['shape']['ownerId']
}>
export function integrationEvent<T extends ZodTypeAny>(
	name: string,
	schema: T,
	options?: SchemaOptions,
): IntegrationEventWithPayloadSchema<T>
export function integrationEvent<T extends ZodRawShape>(
	name: string,
	properties: T,
	options?: SchemaOptions,
): IntegrationEventObjectSchema<T>
export function integrationEvent(name: string, properties?: ZodRawShape | ZodTypeAny | SchemaOptions, options?: SchemaOptions) {
	// Allow (name) / (name, options) / (name, schema) / (name, schema, options) / (name, properties, options).
	let resolvedProperties: ZodRawShape | ZodTypeAny | undefined
	let resolvedOptions: SchemaOptions | undefined

	if (properties && typeof properties === 'object' && !('_zod' in properties) && !Array.isArray(properties)) {
		// Either ZodRawShape or SchemaOptions (which has only `examples`).
		const keys = Object.keys(properties)
		const looksLikeOptions = keys.length === 1 && keys[0] === 'examples'
		if (looksLikeOptions) {
			resolvedOptions = properties as SchemaOptions
		} else {
			resolvedProperties = properties as ZodRawShape
			resolvedOptions = options
		}
	} else if (properties && '_zod' in (properties as object)) {
		resolvedProperties = properties as ZodTypeAny
		resolvedOptions = options
	} else {
		resolvedOptions = options
	}

	const mergedExamples = resolvedOptions?.examples ?? []
	const { name: _name, payload: _payload, ...baseShape } = BaseIntegrationEventSchema.shape

	if (resolvedProperties === undefined) {
		return z
			.object({ ...baseShape, name: z.literal(name), payload: BaseIntegrationEventSchema.shape.payload })
			.meta({ examples: mergedExamples })
	}

	const payloadSchema =
		'_zod' in (resolvedProperties as object) ? (resolvedProperties as ZodTypeAny) : z.object(resolvedProperties as ZodRawShape)

	return z.object({ ...baseShape, name: z.literal(name), payload: payloadSchema }).meta({ examples: mergedExamples })
}

// Time-effective window appended to any schema by `z.historical`. `endDate`
// null = open-ended / currently active. `z.coerce.date()` lets jsonb-stored
// ISO strings rehydrate to Date on read without manual parsing.
const TimeWindowShape = {
	startDate: z.coerce.date(),
	endDate: z.coerce.date().nullable().default(null),
}

// Cast to the broader refine callback type Zod v4 expects internally.
const windowIsValid = (w: unknown) => {
	const win = w as { startDate: Date; endDate: Date | null }
	return win.endDate === null || win.startDate < win.endDate
}
const INVALID_RANGE = { error: 'INVALID_DATE_RANGE' } as const

/**
 * Extends a schema with a validated `[startDate, endDate)` window.
 * Accepts a raw shape, a ZodObject, or a discriminated union (window
 * applied per-variant so the discriminator stays narrowable).
 *
 * `endDate` is nullable with a default of `null` (open-ended / currently active).
 * `z.coerce.date()` lets jsonb-stored ISO strings rehydrate to Date on read.
 * A `startDate < endDate` refine emits `INVALID_DATE_RANGE` on violation.
 */
export function historical<T extends ZodRawShape>(shape: T): ZodObject<T & typeof TimeWindowShape>
export function historical<T extends ZodTypeAny>(schema: T): z.ZodType<z.output<T> & { startDate: Date; endDate: Date | null }>
export function historical(input: ZodRawShape | ZodTypeAny): ZodTypeAny {
	if (!('_zod' in (input as object))) {
		// Raw shape — wrap in ZodObject then extend + refine
		return (z.object(input as ZodRawShape) as ZodObject<ZodRawShape>)
			.extend(TimeWindowShape)
			.refine(windowIsValid, INVALID_RANGE) as unknown as ZodTypeAny
	}
	const schema = input as ZodTypeAny
	// Discriminated union — extend each variant so the discriminator stays narrowable.
	// Zod v4: def.type is 'union' for discriminated unions; use instanceof instead.
	if (schema instanceof ZodDiscriminatedUnion) {
		// Access def via unknown cast — Zod v4 generics are complex; we only need
		// the discriminator string and the options array of ZodObjects at runtime.
		const du = schema as unknown as { def: { discriminator: string; options: ZodObject<ZodRawShape>[] } }
		const widened = du.def.options.map(o => o.extend(TimeWindowShape))
		return (z.discriminatedUnion(du.def.discriminator, widened as never) as ZodTypeAny).refine(windowIsValid, INVALID_RANGE)
	}
	// Plain ZodObject or any other schema — extend + refine
	return (schema as ZodObject<ZodRawShape>).extend(TimeWindowShape).refine(windowIsValid, INVALID_RANGE)
}

/**
 * Creates a schema that parses input and transforms it into a class instance.
 * The class must have a static `schema` property (BaseValueObject, BasePrimitiveValueObject, or BaseEntity).
 *
 * @example
 * ```ts
 * crm: z.instance(CRM),
 * userId: z.instance(Id),
 * specialties: z.array(z.instance(DoctorSpecialty)).default([]),
 * ```
 */
function instance<S extends ZodTypeAny, T>(Cls: { schema: S; new (props: any): T }): ZodInstance<S, T> {
	// Accept already-constructed instances (idempotent for re-validation via
	// this.validate()) OR raw input (the constructor validates via static
	// schema). The declared input type mirrors both runtime branches so
	// call sites can pass either an instance or a props object without casts.
	const schema = z.unknown().transform((v: any) => (v instanceof Cls ? v : new Cls(v))) as unknown as ZodInstance<S, T>
	// Register the underlying VO schema so that .input() can recover it instead
	// of returning z.unknown(). This does NOT change parse-time behaviour.
	instanceInputSchemaMap.set(schema as z.ZodTypeAny, Cls.schema as z.ZodTypeAny)
	return schema
}

/**
 * Like `z.record(z.enum(E), value)` but emits EXPLICIT per-member properties, so
 * the generated OpenAPI/SDK is keyed by the enum members (`{ marketing: V, … }`)
 * instead of a string-indexed map (`{ [k: string]: V }`). All members are
 * required — segments always carry every key (0/empty when there's no data).
 *
 * The OpenAPI generator also emits E as a named enum component (so the SDK carries
 * an iterable enum const) by matching the property-key set against the registered
 * enums — see `OpenAPI.processSchemaForEnums`. So an enum used ONLY via `enumRecord`
 * is still exported, exactly as a `z.enum()` field would be.
 *
 * @example
 * ```ts
 * segments: z.enumRecord(CostKind, MetricSchema),        // { marketing: Metric, … }
 * byStatus: z.enumRecord(PaymentStatus, TallySchema),
 * ```
 */
function enumRecord<T extends Record<string, string>, V extends ZodTypeAny>(
	enumObject: T,
	valueSchema: V,
): ZodObject<Record<T[keyof T], V>> {
	const shape = {} as Record<T[keyof T], V>
	for (const key of Object.values(enumObject) as T[keyof T][]) shape[key] = valueSchema
	return z.object(shape) as unknown as ZodObject<Record<T[keyof T], V>>
}

// Export all extra schema types with camelCase naming to match Zod convention
export const ExtraSchemaTypes = {
	paginatedQuery,
	paginatedResponse,
	baseEvent,
	domainEvent,
	integrationEvent,
	instance,
	historical,
	enumRecord,
}
