import { describe, it, expect } from 'bun:test'
import { z } from 'zod'
import { OpenAPI } from './OpenAPI'

// We need to test the internal functions, so we'll recreate them here for testing
// In a real scenario, these would be exported from OpenAPI.ts

interface RefinementMetadata {
	function: string
	error?: string
	path?: (string | number)[]
}

interface ZodCheck {
	_zod?: {
		def?: {
			fn?: (...args: unknown[]) => unknown
			path?: (string | number)[]
			error?: () => string
		}
	}
}

interface ZodDef {
	type?: string
	checks?: ZodCheck[]
	shape?: Record<string, z.ZodType> | (() => Record<string, z.ZodType>)
	innerType?: z.ZodType
}

const extractRefinementsShallow = (schema: z.ZodType): RefinementMetadata[] => {
	const refinements: RefinementMetadata[] = []
	const def = (schema as { _def?: ZodDef })._def

	if (!def) return refinements

	if (Array.isArray(def.checks)) {
		for (const check of def.checks) {
			if (check._zod?.def?.fn && typeof check._zod.def.fn === 'function') {
				const fnString = check._zod.def.fn.toString()
				const zodDef = check._zod.def

				const refinement: RefinementMetadata = {
					function: fnString,
				}

				if (typeof zodDef.error === 'function') {
					try {
						const errorMessage = zodDef.error()
						if (errorMessage && typeof errorMessage === 'string') {
							refinement.error = errorMessage
						}
					} catch {
						// Ignore errors
					}
				}

				if (zodDef.path && Array.isArray(zodDef.path)) {
					refinement.path = zodDef.path
				}

				refinements.push(refinement)
			}
		}
	}

	return refinements
}

const addRefinementsRecursively = (jsonSchema: Record<string, unknown>, zodSchema: z.ZodType): void => {
	const refinements = extractRefinementsShallow(zodSchema)
	if (refinements.length > 0) {
		jsonSchema['x-tpl-zod-refinements'] = refinements
	}

	const def = (zodSchema as { _def?: ZodDef })._def
	if (def?.type === 'object' && def.shape && jsonSchema.properties) {
		const shape = typeof def.shape === 'function' ? def.shape() : def.shape
		const properties = jsonSchema.properties as Record<string, Record<string, unknown>>

		for (const key in shape) {
			let propertyZodSchema = shape[key]
			const propertyJsonSchema = properties[key]

			if (propertyZodSchema && propertyJsonSchema) {
				const propDef = (propertyZodSchema as { _def?: ZodDef })._def
				if (propDef?.type === 'optional' && propDef.innerType) {
					propertyZodSchema = propDef.innerType
				}

				addRefinementsRecursively(propertyJsonSchema, propertyZodSchema)
			}
		}
	}
}

describe('OpenAPI Refinement Extraction', () => {
	describe('extractRefinementsShallow', () => {
		it('should extract refinements from a schema with .refine()', () => {
			const schema = z
				.object({
					password: z.string(),
					confirmPassword: z.string(),
				})
				.refine(data => data.password === data.confirmPassword, {
					message: 'PASSWORDS_DONT_MATCH',
					path: ['confirmPassword'],
				})

			const refinements = extractRefinementsShallow(schema)

			expect(refinements.length).toBe(1)
			expect(refinements[0]!.error).toBe('PASSWORDS_DONT_MATCH')
			expect(refinements[0]!.path).toEqual(['confirmPassword'])
			expect(refinements[0]!.function).toContain('password')
			expect(refinements[0]!.function).toContain('confirmPassword')
		})

		it('should extract multiple refinements from a schema', () => {
			const schema = z
				.object({
					startDate: z.string(),
					endDate: z.string(),
				})
				.refine(data => data.startDate < data.endDate, {
					message: 'START_BEFORE_END',
					path: ['endDate'],
				})
				.refine(data => data.startDate !== data.endDate, {
					message: 'DATES_MUST_DIFFER',
					path: ['startDate'],
				})

			const refinements = extractRefinementsShallow(schema)

			expect(refinements.length).toBe(2)
			expect(refinements.map(r => r.error)).toContain('START_BEFORE_END')
			expect(refinements.map(r => r.error)).toContain('DATES_MUST_DIFFER')
		})

		it('should NOT extract refinements from nested schemas', () => {
			const NestedSchema = z
				.object({
					zipCode: z.string(),
				})
				.refine(data => data.zipCode.length === 8, {
					message: 'INVALID_ZIP_CODE',
					path: ['zipCode'],
				})

			const ParentSchema = z.object({
				name: z.string(),
				address: NestedSchema,
			})

			const refinements = extractRefinementsShallow(ParentSchema)

			// Should NOT find the nested refinement
			expect(refinements.length).toBe(0)
		})

		it('should return empty array for schema without refinements', () => {
			const schema = z.object({
				name: z.string(),
				age: z.number(),
			})

			const refinements = extractRefinementsShallow(schema)

			expect(refinements.length).toBe(0)
		})
	})

	describe('addRefinementsRecursively', () => {
		it('should add refinements at the nested schema level', () => {
			const AddressSchema = z
				.object({
					street: z.string(),
					zipCode: z.string(),
				})
				.refine(data => data.zipCode.replace(/\D/g, '').length === 8, {
					message: 'INVALID_ZIP_CODE',
					path: ['zipCode'],
				})

			const ParentSchema = z.object({
				name: z.string(),
				address: AddressSchema,
			})

			// Simulate JSON schema structure
			const jsonSchema: Record<string, unknown> = {
				type: 'object',
				properties: {
					name: { type: 'string' },
					address: {
						type: 'object',
						properties: {
							street: { type: 'string' },
							zipCode: { type: 'string' },
						},
					},
				},
			}

			addRefinementsRecursively(jsonSchema, ParentSchema)

			// Parent should NOT have refinements
			expect(jsonSchema['x-tpl-zod-refinements']).toBeUndefined()

			// Nested address should have the refinement
			const addressSchema = (jsonSchema.properties as Record<string, Record<string, unknown>>)!.address!
			expect(addressSchema['x-tpl-zod-refinements']).toBeDefined()

			const refinements = addressSchema['x-tpl-zod-refinements'] as RefinementMetadata[]
			expect(refinements.length).toBe(1)
			expect(refinements[0]!.error).toBe('INVALID_ZIP_CODE')
			expect(refinements[0]!.path).toEqual(['zipCode'])
		})

		it('should add refinements at multiple nesting levels', () => {
			const DeepNestedSchema = z
				.object({
					code: z.string(),
				})
				.refine(data => data.code.length > 0, {
					message: 'CODE_REQUIRED',
					path: ['code'],
				})

			const MiddleSchema = z
				.object({
					nested: DeepNestedSchema,
					value: z.string(),
				})
				.refine(data => data.value.length > 0, {
					message: 'VALUE_REQUIRED',
					path: ['value'],
				})

			const RootSchema = z
				.object({
					middle: MiddleSchema,
					rootField: z.string(),
				})
				.refine(data => data.rootField !== 'invalid', {
					message: 'INVALID_ROOT',
					path: ['rootField'],
				})

			const jsonSchema: Record<string, unknown> = {
				type: 'object',
				properties: {
					middle: {
						type: 'object',
						properties: {
							nested: {
								type: 'object',
								properties: {
									code: { type: 'string' },
								},
							},
							value: { type: 'string' },
						},
					},
					rootField: { type: 'string' },
				},
			}

			addRefinementsRecursively(jsonSchema, RootSchema)

			// Check root level
			const rootRefinements = jsonSchema['x-tpl-zod-refinements'] as RefinementMetadata[]
			expect(rootRefinements).toBeDefined()
			expect(rootRefinements.length).toBe(1)
			expect(rootRefinements[0]!.error).toBe('INVALID_ROOT')

			// Check middle level
			const middleSchema = (jsonSchema.properties as Record<string, Record<string, unknown>>)!.middle!
			const middleRefinements = middleSchema['x-tpl-zod-refinements'] as RefinementMetadata[]
			expect(middleRefinements).toBeDefined()
			expect(middleRefinements.length).toBe(1)
			expect(middleRefinements[0]!.error).toBe('VALUE_REQUIRED')

			// Check deep nested level
			const nestedSchema = (middleSchema.properties as Record<string, Record<string, unknown>>)!.nested!
			const nestedRefinements = nestedSchema['x-tpl-zod-refinements'] as RefinementMetadata[]
			expect(nestedRefinements).toBeDefined()
			expect(nestedRefinements.length).toBe(1)
			expect(nestedRefinements[0]!.error).toBe('CODE_REQUIRED')
		})

		it('should handle optional nested schemas', () => {
			const AddressSchema = z
				.object({
					zipCode: z.string(),
				})
				.refine(data => data.zipCode.length === 8, {
					message: 'INVALID_ZIP_CODE',
					path: ['zipCode'],
				})

			const ParentSchema = z.object({
				name: z.string(),
				address: AddressSchema.optional(),
			})

			const jsonSchema: Record<string, unknown> = {
				type: 'object',
				properties: {
					name: { type: 'string' },
					address: {
						type: 'object',
						properties: {
							zipCode: { type: 'string' },
						},
					},
				},
			}

			addRefinementsRecursively(jsonSchema, ParentSchema)

			// Nested optional address should still have the refinement
			const addressSchema = (jsonSchema.properties as Record<string, Record<string, unknown>>)!.address!
			expect(addressSchema['x-tpl-zod-refinements']).toBeDefined()

			const refinements = addressSchema['x-tpl-zod-refinements'] as RefinementMetadata[]
			expect(refinements.length).toBe(1)
			expect(refinements[0]!.error).toBe('INVALID_ZIP_CODE')
		})

		it('should not add refinements to schemas without them', () => {
			const SimpleSchema = z.object({
				name: z.string(),
				nested: z.object({
					value: z.string(),
				}),
			})

			const jsonSchema: Record<string, unknown> = {
				type: 'object',
				properties: {
					name: { type: 'string' },
					nested: {
						type: 'object',
						properties: {
							value: { type: 'string' },
						},
					},
				},
			}

			addRefinementsRecursively(jsonSchema, SimpleSchema)

			expect(jsonSchema['x-tpl-zod-refinements']).toBeUndefined()
			const nestedSchema = (jsonSchema.properties as Record<string, Record<string, unknown>>)!.nested!
			expect(nestedSchema['x-tpl-zod-refinements']).toBeUndefined()
		})
	})

	describe('Integration: CreateUnitInputSchema pattern', () => {
		it('should place AddressSchema refinements on the address property, not hoisted to parent', () => {
			// Simulating the real-world pattern from the codebase
			const AddressSchema = z
				.object({
					street: z.string().min(3).max(200),
					number: z.string().min(1).max(20),
					complement: z.string().max(100).optional(),
					neighborhood: z.string().min(2).max(100),
					city: z.string().min(2).max(100),
					state: z.string().length(2),
					zipCode: z.string().min(8).max(10),
				})
				.refine(data => data.zipCode.replace(/\D/g, '').length === 8, {
					message: 'INVALID_ZIP_CODE',
					path: ['zipCode'],
				})

			const CreateUnitBodySchema = z.object({
				clinicId: z.string(),
				name: z.string().min(1).max(255),
				address: AddressSchema,
				memberId: z.string(),
			})

			// Simulate the JSON schema that would be generated
			const jsonSchema: Record<string, unknown> = {
				type: 'object',
				properties: {
					clinicId: { type: 'string' },
					name: { type: 'string', minLength: 1, maxLength: 255 },
					address: {
						type: 'object',
						properties: {
							street: { type: 'string', minLength: 3, maxLength: 200 },
							number: { type: 'string', minLength: 1, maxLength: 20 },
							complement: { type: 'string', maxLength: 100 },
							neighborhood: { type: 'string', minLength: 2, maxLength: 100 },
							city: { type: 'string', minLength: 2, maxLength: 100 },
							state: { type: 'string', minLength: 2, maxLength: 2 },
							zipCode: { type: 'string', minLength: 8, maxLength: 10 },
						},
					},
					memberId: { type: 'string' },
				},
			}

			addRefinementsRecursively(jsonSchema, CreateUnitBodySchema)

			// The parent (CreateUnitBodySchema) should NOT have refinements
			expect(jsonSchema['x-tpl-zod-refinements']).toBeUndefined()

			// The address property SHOULD have the refinement
			const addressSchema = (jsonSchema.properties as Record<string, Record<string, unknown>>)!.address!
			expect(addressSchema['x-tpl-zod-refinements']).toBeDefined()

			const refinements = addressSchema['x-tpl-zod-refinements'] as RefinementMetadata[]
			expect(refinements.length).toBe(1)
			expect(refinements[0]!.error).toBe('INVALID_ZIP_CODE')
			expect(refinements[0]!.path).toEqual(['zipCode'])

			// The function should reference data.zipCode directly (not data.address.zipCode)
			// This is correct because when the SDK reconstructs this, it will be applied to the address schema
			expect(refinements[0]!.function).toContain('data.zipCode')
			expect(refinements[0]!.function).not.toContain('data.address')
		})

		it('should handle parent-level refinements separately from nested refinements', () => {
			const AddressSchema = z
				.object({
					zipCode: z.string(),
				})
				.refine(data => data.zipCode.length === 8, {
					message: 'INVALID_ZIP_CODE',
					path: ['zipCode'],
				})

			// Parent has its own refinement
			const ParentSchema = z
				.object({
					name: z.string(),
					address: AddressSchema,
				})
				.refine(data => data.name !== 'test', {
					message: 'NAME_CANNOT_BE_TEST',
					path: ['name'],
				})

			const jsonSchema: Record<string, unknown> = {
				type: 'object',
				properties: {
					name: { type: 'string' },
					address: {
						type: 'object',
						properties: {
							zipCode: { type: 'string' },
						},
					},
				},
			}

			addRefinementsRecursively(jsonSchema, ParentSchema)

			// Parent should have its own refinement
			const parentRefinements = jsonSchema['x-tpl-zod-refinements'] as RefinementMetadata[]
			expect(parentRefinements).toBeDefined()
			expect(parentRefinements.length).toBe(1)
			expect(parentRefinements[0]!.error).toBe('NAME_CANNOT_BE_TEST')

			// Address should have its own refinement
			const addressSchema = (jsonSchema.properties as Record<string, Record<string, unknown>>)!.address!
			const addressRefinements = addressSchema['x-tpl-zod-refinements'] as RefinementMetadata[]
			expect(addressRefinements).toBeDefined()
			expect(addressRefinements.length).toBe(1)
			expect(addressRefinements[0]!.error).toBe('INVALID_ZIP_CODE')
		})
	})
})

// ─────────────────────────────────────────────────────────
// Phase 1 — OpenAPI 3.0.3 emission
// ─────────────────────────────────────────────────────────

describe('OpenAPI 3.0.3 emission', () => {
	it('emits openapi: 3.0.3 on the generated spec', () => {
		const openapi = new OpenAPI()
		const spec = openapi.getSpec()
		expect(spec.openapi).toBe('3.0.3')
	})
})

describe('z.unknown disambiguation', () => {
	it('emits x-tpl-unknown: true on a z.unknown() field when registered as a named schema component', async () => {
		const openapi = new OpenAPI()

		// Minimal schema with one z.unknown() field. Inject directly into reusableSchemas
		// via buildComponentSchema (integration events no longer go through OpenAPI).
		const TestEventSchema = z.object({
			payload: z.unknown(),
		})

		const buildComponentSchema = openapi as unknown as {
			buildComponentSchema: (schema: z.ZodType, name: string, io?: 'input' | 'output') => Record<string, unknown>
			reusableSchemas: Map<string, Record<string, unknown>>
		}
		const built = buildComponentSchema.buildComponentSchema(TestEventSchema, 'TestEvent')
		buildComponentSchema.reusableSchemas.set('TestEvent', built)

		await openapi.generateSpecification([])

		const spec = openapi.getSpec()
		const testEvent = spec.components?.schemas?.TestEvent as Record<string, unknown> | undefined
		expect(testEvent).toBeDefined()

		const payloadProp = (testEvent!.properties as Record<string, Record<string, unknown>>).payload
		expect(payloadProp?.['x-tpl-unknown']).toBe(true)
	})
})

describe('const emission (3.1 native)', () => {
	const exposeProcess = (o: OpenAPI) =>
		(o as unknown as { processSchemaForEnums: (s: unknown, path?: string) => unknown }).processSchemaForEnums.bind(o)

	it('preserves const in processed schema output instead of collapsing to enum: [value]', () => {
		const process = exposeProcess(new OpenAPI())

		const result = process({ type: 'string', const: 'HELLO' }) as Record<string, unknown>

		expect(result.const).toBe('HELLO')
		expect(result.enum).toBeUndefined()
	})

	it('non-string const values (number, boolean) survive processing unchanged', () => {
		const process = exposeProcess(new OpenAPI())

		const numberResult = process({ type: 'number', const: 42 }) as Record<string, unknown>
		expect(numberResult.const).toBe(42)
		expect(numberResult.enum).toBeUndefined()

		const boolResult = process({ type: 'boolean', const: true }) as Record<string, unknown>
		expect(boolResult.const).toBe(true)
		expect(boolResult.enum).toBeUndefined()
	})

	it('multi-value enum still becomes a $ref component', () => {
		const process = exposeProcess(new OpenAPI())

		const result = process({ type: 'string', enum: ['A', 'B'] }, 'Foo') as { $ref?: string }
		expect(result.$ref).toMatch(/^#\/components\/schemas\//)
	})

	it('single-value enum collapses to const (not a $ref component)', () => {
		const process = exposeProcess(new OpenAPI())

		const result = process({ type: 'string', enum: ['ONLY'] }, 'Foo') as Record<string, unknown>

		expect(result.const).toBe('ONLY')
		expect(result.enum).toBeUndefined()
		expect(result.$ref).toBeUndefined()
	})
})

describe('spec validation', () => {
	it('throws if any inline enum: [...] survives outside components.schemas', async () => {
		const openapi = new OpenAPI()

		// Inject a malformed schema directly to simulate a bug in processSchemaForEnums.
		// We use the private `spec` field — a tiny cast is fine in a test.
		const spec = openapi.getSpec()
		spec.paths = {
			'/test': {
				get: {
					responses: {
						200: {
							description: 'ok',
							content: {
								'application/json': {
									schema: { type: 'string', enum: ['A', 'B'] } as unknown as never,
								},
							},
						},
					},
				},
			},
		}

		await expect(openapi.generateSpecification([])).rejects.toThrow(/inline enum/i)
	})
})

// ─────────────────────────────────────────────────────────
// Phase 2 — Discriminated unions + refinement placement
// ─────────────────────────────────────────────────────────

describe('z.discriminatedUnion emission', () => {
	it('emits oneOf with inline variant branches (no named-component fan-out, no discriminator)', async () => {
		const openapi = new OpenAPI()

		const FooSchema = z.discriminatedUnion('type', [
			z.object({ type: z.literal('a'), value: z.string() }),
			z.object({ type: z.literal('b'), count: z.number() }),
		])

		// Inject directly — integration events no longer go through registerEvents.
		const internals = openapi as unknown as {
			buildComponentSchema: (schema: z.ZodType, name: string, io?: 'input' | 'output') => Record<string, unknown>
			reusableSchemas: Map<string, Record<string, unknown>>
		}
		const built = internals.buildComponentSchema(FooSchema, 'Foo')
		internals.reusableSchemas.set('Foo', built)

		await openapi.generateSpecification([])

		const spec = openapi.getSpec()
		const foo = spec.components?.schemas?.Foo as Record<string, unknown>
		const oneOf = foo.oneOf as Record<string, unknown>[]
		expect(oneOf).toBeDefined()
		expect(oneOf).toHaveLength(2)

		// No discriminator object — mapping requires $ref targets that inline branches lack,
		// and oapi-codegen rejects an unmapped discriminator. The `type` literal narrows instead.
		expect(foo.discriminator).toBeUndefined()

		// Branches are inlined, not hoisted into Foo_A / Foo_B components.
		expect(spec.components?.schemas?.Foo_A).toBeUndefined()
		expect(spec.components?.schemas?.Foo_B).toBeUndefined()

		const variantA = oneOf.find(v => {
			const type = (v.properties as Record<string, Record<string, unknown>> | undefined)?.type
			return type?.const === 'a'
		})
		expect(variantA).toBeDefined()
	})
})

describe('nullable enum occurrences must not mutate the shared component', () => {
	it('keeps the named enum component non-nullable while each call site carries its own nullability', () => {
		const openapi = new OpenAPI()
		openapi.registerEnums({ TestEnum: { A: 'A', B: 'B' } })

		const internals = openapi as unknown as {
			processSchemaForEnums: (s: unknown, path?: string) => unknown
			reusableSchemas: Map<string, Record<string, unknown>>
		}

		// Two occurrences of the SAME enum values in one document walk — e.g. one controller's
		// field is `.optional()` only (RegisterMcpServer.approvalPolicy), another's is genuinely
		// `.nullable()` (UpdateMcpServer.toolPolicy.policy). Order matters for the regression:
		// the non-nullable occurrence is resolved first, the nullable one second — reproducing
		// "whichever occurrence is processed LAST decides nullability for every consumer".
		const nonNullableResult = internals.processSchemaForEnums({ type: 'string', enum: ['A', 'B'] }, 'first') as {
			$ref?: string
			nullable?: boolean
		}
		const nullableResult = internals.processSchemaForEnums({ type: 'string', enum: ['A', 'B'], nullable: true }, 'second') as {
			$ref?: string
			nullable?: boolean
			allOf?: { $ref?: string }[]
		}

		const component = internals.reusableSchemas.get('TestEnum')

		// The shared component identity must stay non-nullable — nullability is a call-site trait,
		// not a property of the enum itself.
		expect(component?.nullable).toBeUndefined()

		// The non-nullable occurrence must not carry nullable, and stays a bare $ref.
		expect(nonNullableResult.$ref).toBe('#/components/schemas/TestEnum')
		expect(nonNullableResult.nullable).toBeUndefined()

		// The nullable occurrence must carry its OWN nullable marker, without touching the shared
		// component. It is wrapped in `allOf` (not a bare `{ $ref, nullable: true }` sibling) so the
		// `$ref` node itself stays sibling-free — a bare sibling gets merged into the SDK generator's
		// shared dereferenced object for that ref, leaking nullability onto every other consumer.
		expect(nullableResult.nullable).toBe(true)
		expect(nullableResult.$ref).toBeUndefined()
		expect(nullableResult.allOf).toEqual([{ $ref: '#/components/schemas/TestEnum' }])
	})
})

describe('refinement placement', () => {
	it('extracts inline refined subschemas into named components', async () => {
		const openapi = new OpenAPI()

		const Address = z
			.object({
				zip: z.string(),
			})
			.refine(a => a.zip.length === 8, { error: 'INVALID_ZIP' })

		const Parent = z.object({
			name: z.string(),
			address: Address,
		})

		// Inject directly — integration events no longer go through registerEvents.
		const internals = openapi as unknown as {
			buildComponentSchema: (schema: z.ZodType, name: string, io?: 'input' | 'output') => Record<string, unknown>
			reusableSchemas: Map<string, Record<string, unknown>>
		}
		const built = internals.buildComponentSchema(Parent, 'Parent')
		internals.reusableSchemas.set('Parent', built)

		await openapi.generateSpecification([])

		const spec = openapi.getSpec()
		const parent = spec.components?.schemas?.Parent as Record<string, unknown>
		const addressProp = (parent.properties as Record<string, Record<string, unknown>>).address!
		expect(addressProp.$ref).toMatch(/#\/components\/schemas\/ParentAddress$/)

		const addressComponent = spec.components?.schemas?.ParentAddress as Record<string, unknown>
		const refinements = addressComponent['x-tpl-zod-refinements'] as Array<{ error?: string }> | undefined
		expect(refinements?.[0]?.error).toBe('INVALID_ZIP')
	})
})
