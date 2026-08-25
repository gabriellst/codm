// `--state` includes `store` — emits `useFooStore()` selector + import.
// Requires `--store=<StoreName>` on the component verb. Does NOT scaffold
// the store file itself (run `bun cli store <StoreName>` separately).

import type { BlockFn } from './types'
import { renderBlock } from './fragments'

export const storeBlock: BlockFn = ctx => {
	if (!ctx.storeName) {
		return {}
	}
	const storeVar = ctx.storeName.charAt(0).toLowerCase() + ctx.storeName.slice(1)
	return renderBlock('store', 'react', { storeName: ctx.storeName, storeVar })
}
