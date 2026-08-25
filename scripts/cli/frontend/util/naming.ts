// Naming helpers — robust for hyphen/snake/space/mixed-case inputs.
// The existing scripts/cli.ts has thin versions that only handle single-word strings;
// these are the frontend-CLI replacements.

export function toPascalCase(input: string): string {
	if (!input) return ''
	const parts = input
		// split camelCase boundaries
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		// split kebab-case and snake_case and any whitespace
		.split(/[-_\s]+/)
		.filter(Boolean)
	return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('')
}

export function toCamelCase(input: string): string {
	const pascal = toPascalCase(input)
	return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

export function toKebabCase(input: string): string {
	const pascal = toPascalCase(input)
	return pascal.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

// Strip a trailing suffix (if present) and re-add it. Idempotent.
// Used so `bun cli dialog ... CreatePatient` and `... CreatePatientDialog` both
// produce `CreatePatientDialog/`.
export function withSuffix(name: string, suffix: string): string {
	const pascal = toPascalCase(name)
	const stripped = pascal.endsWith(suffix) ? pascal.slice(0, -suffix.length) : pascal
	return stripped + suffix
}

// Take the last non-`$param` non-`(group)` segment of a route path.
// `(app)/agenda` → `agenda`
// `(app)/patients/$patientId` → `patients`
// `(app)/clinics/$clinicId/units` → `units`
export function lastStaticSegment(routePath: string): string {
	const segments = routePath.split('/').filter(Boolean)
	for (let i = segments.length - 1; i >= 0; i--) {
		const seg = segments[i]
		if (!seg.startsWith('$') && !(seg.startsWith('(') && seg.endsWith(')'))) {
			return seg
		}
	}
	return segments[segments.length - 1] ?? 'route'
}
