// `--i18n=<prefix>` — wires useTranslation + emits t() calls for visible text.
//
// The block contributes the import + the hook call; the actual t() references
// are emitted by the assembler (since JSX shape varies by recipe). The block
// declares i18nSlots so the assembler can pass them to the i18n writer for
// auto-seeding.

import type { BlockFn } from './types'
import { renderBlock } from './fragments'

export const i18nBlock: BlockFn = ctx => {
	if (!ctx.i18nPrefix) return {}
	// Default slots seeded by most recipes; the assembler may add more.
	return renderBlock('i18n', 'react', {})
}
