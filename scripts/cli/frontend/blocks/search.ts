// `--state` includes `search` — reads URL search params from the parent route.
//
// Components live at routes/<route>/-components/<Name>/index.tsx, so the parent
// route file is two levels up. We import the `Route` export from there and call
// `Route.useSearch()` for typed search params.

import type { BlockFn } from './types'
import { renderBlock } from './fragments'

export const searchBlock: BlockFn = () => renderBlock('search', 'react', {})
