// `--sdk=<Identifier>` — emits a type import line. Other blocks that need
// hooks/types from the SDK add their own imports separately (this block
// covers the bare `--sdk=Foo` case where the user wants the type available).

import type { BlockFn } from './types'
import { renderBlock } from './fragments'

export const sdkBlock: BlockFn = (_ctx, value) => {
	if (!value) return {}
	return renderBlock('sdk', 'react', { sdkValue: value })
}
