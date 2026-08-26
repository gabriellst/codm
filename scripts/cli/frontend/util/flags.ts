// Flag-parsing helpers shared across artifacts.
//
// Conventions (spec §5):
//   - Flags with values: `--flag=value` (or `--flag value` — the cli.ts parser supports both)
//   - Boolean flags: bare `--flag` to enable; `--no-flag` to disable
//   - Multi-value flags: comma-separated CSV
//   - Exceptions (use `;` between entries because each entry contains `=`):
//       --variants, --with-pt, --with-en, --mask (onboarding-step), --import (route), --consts (component)

// Parse a CSV value into an array of trimmed non-empty strings.
export function parseCsv(value: string | undefined): string[] {
	if (!value) return []
	return value
		.split(',')
		.map(s => s.trim())
		.filter(Boolean)
}

// Parse a `;`-separated `key=value` spec into a Map (preserves insertion order).
// Example: `title=Pacientes;subtitle=Bem-vindo` → Map{title=>'Pacientes', subtitle=>'Bem-vindo'}
export function parseKvSpec(value: string | undefined): Map<string, string> {
	const out = new Map<string, string>()
	if (!value) return out
	for (const entry of value.split(';')) {
		const trimmed = entry.trim()
		if (!trimmed) continue
		const eq = trimmed.indexOf('=')
		if (eq === -1) continue
		out.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim())
	}
	return out
}

// Parse `--variants` value: `name:v1,v2|name:v1,v2` → `{ name: ['v1','v2'], ... }`.
export function parseVariantSpec(value: string | undefined): Record<string, string[]> {
	const out: Record<string, string[]> = {}
	if (!value) return out
	for (const group of value.split('|')) {
		const colon = group.indexOf(':')
		if (colon === -1) continue
		const name = group.slice(0, colon).trim()
		const values = group.slice(colon + 1).trim()
		if (!name || !values) continue
		out[name] = parseCsv(values)
	}
	return out
}

// Read a boolean flag, accounting for `--no-flag` opt-outs.
// Returns undefined when the flag was not passed at all.
export function readBool(flags: Record<string, string>, name: string): boolean | undefined {
	if (flags[name] === 'true') return true
	if (flags[`no-${name}`] === 'true' || flags[name] === 'false') return false
	return undefined
}

// Read a value flag — returns undefined when the flag is missing OR was passed as a bare boolean.
export function readValue(flags: Record<string, string>, name: string): string | undefined {
	const v = flags[name]
	return v && v !== 'true' && v !== 'false' ? v : undefined
}

export function requireValue(flags: Record<string, string>, name: string, verb: string): string {
	const v = readValue(flags, name)
	if (!v) {
		console.error(`[${verb}] --${name}=<value> is required`)
		process.exit(1)
	}
	return v
}
