// Mobile consts block — emits a top-level `const FOO = 'bar'` for each
// `--consts=foo=bar;baz=qux` entry. Same surface as web; no platform-specific
// rendering needed.

import { parseKvSpec } from '../util/flags'
import type { MobileBlockOutput } from './types'

export function constsBlock(_ctx: unknown, spec?: string): MobileBlockOutput {
	const parsed = parseKvSpec(spec)
	if (parsed.size === 0) return {}
	const declarations: string[] = []
	for (const [key, value] of parsed) {
		const isNumeric = /^-?\d+(\.\d+)?$/.test(value)
		const literal = isNumeric ? value : JSON.stringify(value)
		declarations.push(`const ${key.toUpperCase()} = ${literal}`)
	}
	return { declarations }
}
