// `--state` includes `query` — wires the SDK list hook + isLoading.
//
// Best-guess: `useList${sdk}s` (plural). For non-list usages or irregular
// plurals (Person → People), the user adjusts the import line after.

import type { BlockFn } from './types'
import { renderBlock } from './fragments'

export const queryBlock: BlockFn = ctx => {
	if (!ctx.sdk) return {}
	const plural = ctx.sdk.endsWith('s') ? ctx.sdk : `${ctx.sdk}s`
	return renderBlock('query', 'react', { hookName: `useList${plural}` })
}
