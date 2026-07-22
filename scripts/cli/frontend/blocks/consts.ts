// `--consts=<spec>` — semicolon-separated `key=value` pairs become exported consts.
//
// Example: --consts='maxItems=20;defaultSort=name'
// Emits:
//   export const maxItems = 20
//   export const defaultSort = 'name'

import type { BlockFn } from './types'
import { parseKvSpec } from '../util/flags'

export const constsBlock: BlockFn = (_ctx, value) => {
	if (!value) return {}
	const entries = parseKvSpec(value)
	const decls = [...entries.entries()].map(([k, v]) => {
		const isNumeric = /^-?\d+(\.\d+)?$/.test(v)
		const isBool = v === 'true' || v === 'false'
		const formatted = isNumeric || isBool ? v : JSON.stringify(v)
		return `export const ${k} = ${formatted}`
	})
	return { declarations: decls }
}
