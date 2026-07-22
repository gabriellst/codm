// `--search` micro-DSL parser/renderer for the route artifact.
//
// Each spec is `<name>:<type>[?][=<default>]`.
//   Types:    string, number, boolean, date, enum:<EnumName>, id
//   Modifiers: ?       → .optional()
//              =<lit>  → .default(<lit>) (strings auto-quoted; bools/numbers/enum refs verbatim)
//              =fn:<x> → .default(<x>) (expression emitted verbatim)
//
// Parsing precedence: each spec is split on the **first** `:` to separate
// <name> from the rest, so `view:enum:CalendarView?=CalendarView.WEEK` parses
// as name=`view`, rest=`enum:CalendarView?=CalendarView.WEEK`.
//
// Top-level comma-splitting is bracket-aware so `fn:` defaults with simple
// expressions can include commas inside parens/braces/brackets. When the
// expression gets ugly enough that this still mis-parses, use `--search-file`.

export type SearchFieldType =
	| { kind: 'string' }
	| { kind: 'number' }
	| { kind: 'boolean' }
	| { kind: 'date' }
	| { kind: 'enum'; enumName: string }
	| { kind: 'id' }

export interface SearchField {
	name: string
	type: SearchFieldType
	optional: boolean
	default?: { kind: 'literal'; value: string } | { kind: 'fn'; expr: string }
}

export function parseSearchField(spec: string): SearchField {
	const firstColon = spec.indexOf(':')
	if (firstColon === -1) {
		throw new Error(`[--search] invalid spec (missing ':'): ${spec}`)
	}
	const name = spec.slice(0, firstColon).trim()
	let rest = spec.slice(firstColon + 1).trim()

	// Pull off the default (`=...` suffix, possibly `=fn:...`).
	let def: SearchField['default']
	const eq = rest.indexOf('=')
	if (eq !== -1) {
		const value = rest.slice(eq + 1)
		rest = rest.slice(0, eq)
		if (value.startsWith('fn:')) {
			def = { kind: 'fn', expr: value.slice(3) }
		} else {
			def = { kind: 'literal', value }
		}
	}

	// Optional marker on the type portion.
	const optional = rest.endsWith('?')
	if (optional) rest = rest.slice(0, -1)

	// Type token.
	let type: SearchFieldType
	if (rest.startsWith('enum:')) {
		type = { kind: 'enum', enumName: rest.slice(5) }
	} else if (rest === 'string') type = { kind: 'string' }
	else if (rest === 'number') type = { kind: 'number' }
	else if (rest === 'boolean') type = { kind: 'boolean' }
	else if (rest === 'date') type = { kind: 'date' }
	else if (rest === 'id') type = { kind: 'id' }
	else throw new Error(`[--search] unknown type "${rest}" in spec: ${spec}`)

	return { name, type, optional, default: def }
}

// Bracket-aware comma split: a comma is a top-level field separator iff bracket
// depth is zero. Handles () {} [] in `fn:` expressions; doesn't handle quotes
// (no field value should contain a stray comma inside a quoted string at this
// layer — use --search-file for that case).
export function parseSearchSpec(value: string | undefined): SearchField[] {
	if (!value) return []
	const parts: string[] = []
	let depth = 0
	let buf = ''
	for (const ch of value) {
		if (ch === '(' || ch === '{' || ch === '[') depth++
		else if (ch === ')' || ch === '}' || ch === ']') depth--
		if (ch === ',' && depth === 0) {
			parts.push(buf)
			buf = ''
		} else {
			buf += ch
		}
	}
	if (buf) parts.push(buf)
	return parts.map(p => parseSearchField(p.trim())).filter(Boolean)
}

// Render the Zod chain for one field.
export function renderField(field: SearchField): string {
	const base =
		field.type.kind === 'enum'
			? `z.enum(${field.type.enumName})`
			: field.type.kind === 'date'
				? `z.coerce.date()`
				: field.type.kind === 'string'
					? `z.string()`
					: field.type.kind === 'number'
						? `z.number()`
						: field.type.kind === 'boolean'
							? `z.boolean()`
							: field.type.kind === 'id'
								? `z.string()`
								: 'z.unknown()'

	let chain = base
	if (field.optional) chain += `.optional()`
	if (field.default) {
		const arg = field.default.kind === 'fn' ? field.default.expr : renderLiteralDefault(field.type, field.default.value)
		chain += `.default(${arg})`
	}
	return chain
}

function renderLiteralDefault(type: SearchFieldType, value: string): string {
	if (type.kind === 'string') return JSON.stringify(value)
	if (type.kind === 'boolean') return value === 'true' ? 'true' : 'false'
	if (type.kind === 'number') return value
	if (type.kind === 'enum') return value // e.g. `CalendarView.WEEK` — emit verbatim
	if (type.kind === 'id') return JSON.stringify(value)
	if (type.kind === 'date') return value // emitted verbatim (most likely a `new Date(...)` literal)
	return JSON.stringify(value)
}
