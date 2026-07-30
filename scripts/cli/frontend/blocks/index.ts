// Block primitive registry — referenced by recipes and the component assembler.

import type { BlockFn } from './types'
import { elementBlock } from './element'
import { sdkBlock } from './sdk'
import { variantsBlock } from './variants'
import { queryBlock } from './query'
import { storeBlock } from './store'
import { searchBlock } from './search'
import { composerBlock } from './composer'
import { labelsBlock } from './labels'
import { constsBlock } from './consts'
import { i18nBlock } from './i18n'
import { skeletonBlock } from './skeleton'

export const blocks: Record<string, BlockFn> = {
	element: elementBlock,
	sdk: sdkBlock,
	variants: variantsBlock,
	query: queryBlock,
	store: storeBlock,
	search: searchBlock,
	composer: composerBlock,
	labels: labelsBlock,
	consts: constsBlock,
	i18n: i18nBlock,
	skeleton: skeletonBlock,
}

export type { BlockFn, BlockContext, BlockOutput } from './types'
export { ELEMENT_INTERFACES } from './element'
