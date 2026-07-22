import type { z } from 'zod'

/**
 * Generic helpers for introspecting a Zod v4 union / discriminatedUnion at runtime — used to drive
 * "discriminated backend operation → variant-specific UI": list a discriminant's possible values, and
 * pick a member SCHEMA by its discriminant(s) so a form validates against ITS member (via `safeParse`)
 * instead of the whole union. Works on any `z.union(...)` / `z.discriminatedUnion(...)` (both expose
 * `.options`). `pickUnionVariant` returns the WHOLE member — for `.safeParse()` only, NOT a TanStack
 * `validators.onChange` (the member type can't satisfy that — TS2322). When a form edits a single
 * field of the member (the common case), `pickUnionVariantField` returns that FIELD's sub-schema,
 * which IS a valid `validators.onChange` (its input type matches the flat form value).
 */

// A discriminant field is a ZodEnum/ZodLiteral; read its literal value(s). Generically a member field
// is an opaque ZodType, so `.options` is read via one contained introspection access (not data casting).
const literalsOf = (field: unknown): readonly string[] => {
	const opts = (field as { options?: readonly unknown[] } | undefined)?.options
	return Array.isArray(opts) ? opts.filter((v): v is string => typeof v === 'string') : []
}

// The inferred output type of the union (the union of member types). Drives the typed `match`/
// `discriminant` args below so typos + invalid literals are caught at compile time.
type UnionShape<M extends z.ZodObject> = z.infer<z.ZodUnion<readonly M[]>>

/**
 * Distinct values a discriminant field takes across all members — the "possible options" for that field.
 * `discriminant` is constrained to the union's actual fields. e.g.
 * `unionVariantValues(connectSchema, 'connectionMode')` → ['CREDENTIALS','MANUAL','OAUTH'].
 */
export function unionVariantValues<M extends z.ZodObject>(
	union: z.ZodUnion<readonly M[]>,
	discriminant: keyof UnionShape<M> & string,
): string[] {
	const out = new Set<string>()
	for (const member of union.options) for (const v of literalsOf(member.shape[discriminant])) out.add(v)
	return [...out]
}

/**
 * The member schema whose discriminant fields ALL match `match` — call `.safeParse(value)` on it.
 * `match` keys are constrained to the union's fields and values to their valid literals (typos / bad
 * values are compile errors). Throws if no member matches. NOTE: the return is typed as the whole
 * union (runtime-validates the matched member); for the narrowed *type* use `Extract<Req, { … }>`.
 * e.g. `pickUnionVariant(connectSchema, { platform: 'EXAMPLE', connectionMode: 'CREDENTIALS' })`.
 */
export function pickUnionVariant<M extends z.ZodObject>(union: z.ZodUnion<readonly M[]>, match: Partial<UnionShape<M>>): M {
	const member = union.options.find(m =>
		Object.entries(match).every(([field, value]) => typeof value === 'string' && literalsOf(m.shape[field]).includes(value)),
	)
	if (!member) throw new Error(`No union variant matching ${JSON.stringify(match)}`)
	return member
}

/**
 * The sub-schema of ONE field of the member matched by `match` — precisely typed via `Extract`, so it
 * doubles as a TanStack Form `validators.onChange` AND a `.safeParse` source for that field's value.
 * Use when a form edits a single field of a discriminated operation (e.g. the `credentials` object of
 * the connect union): the form value IS that field's value, and this returns the exact schema for it.
 *   const credentialsSchema = pickUnionVariantField(connectSchema, { platform: 'EXAMPLE', connectionMode: 'CREDENTIALS' }, 'credentials')
 * `match` narrows the union member (typos/bad literals are compile errors); `field` is constrained to
 * that member's keys; the returned schema's output type is exactly `Extract<Req, Match>[field]`.
 */
export function pickUnionVariantField<
	M extends z.ZodObject,
	const Match extends Partial<UnionShape<M>>,
	F extends keyof Extract<UnionShape<M>, Match> & string,
>(union: z.ZodUnion<readonly M[]>, match: Match, field: F): z.ZodType<VariantField<M, Match, F>, VariantField<M, Match, F>> {
	const schema = pickUnionVariant(union, match).shape[field]
	if (!schema) throw new Error(`Union variant ${JSON.stringify(match)} has no field "${field}"`)
	// Generic introspection: the runtime shape access is opaque; the precise type is proven by
	// `VariantField<…>` in the signature (same contained-cast philosophy as literalsOf). Both Output and
	// Input are set so the returned schema satisfies a TanStack `validators.onChange` (which constrains
	// the schema's INPUT to the form value, not just its output).
	return schema as z.ZodType<VariantField<M, Match, F>, VariantField<M, Match, F>>
}

// The type of one field of the union member selected by `Match` — drives pickUnionVariantField's return.
type VariantField<
	M extends z.ZodObject,
	Match extends Partial<UnionShape<M>>,
	F extends keyof Extract<UnionShape<M>, Match> & string,
> = Extract<UnionShape<M>, Match>[F]
