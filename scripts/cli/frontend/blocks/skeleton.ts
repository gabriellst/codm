// `--skeleton` — inline `data === undefined` guard rendering a Skeleton.
// No separate `<Name>Skeleton` export (BP-027 — sections handle their own
// loading inline).

import type { BlockFn } from './types'
import { renderBlock } from './fragments'

export const skeletonBlock: BlockFn = () => renderBlock('skeleton', 'react', {})
