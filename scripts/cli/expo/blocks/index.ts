// Mobile block registry — re-exports each block helper so artifacts can
// import them from a single entry. Mobile blocks are simpler than the web
// equivalents (no central assembler); each artifact composes the pieces it
// needs directly.

export { sdkBlock, sdkImport, MOBILE_SDK_PACKAGE } from './sdk'
export { i18nBlock } from './i18n'
export { variantsBlock } from './variants'
export { searchBlock, type SearchBlockOptions } from './search'
export { constsBlock } from './consts'
export { mobileElementImport, MOBILE_ELEMENT_INTERFACES, type MobileElement } from './element'
export type { MobileBlockContext, MobileBlockOutput } from './types'
