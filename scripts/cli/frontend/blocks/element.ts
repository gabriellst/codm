// `--as=<tag>` — contributes the React imports + a hint about the root HTML element.
// The actual JSX root tag is rendered by the assembler in artifacts/component.ts;
// this block just stocks the import list with React + cn.

import type { BlockFn } from './types'
import { renderBlock } from './fragments'

// Map HTML tags to their TypeScript HTMLElement interfaces.
// Used by the assembler for forwardRef<HTMLXElement>.
export const ELEMENT_INTERFACES: Record<string, string> = {
	section: 'HTMLElement',
	div: 'HTMLDivElement',
	article: 'HTMLElement',
	aside: 'HTMLElement',
	button: 'HTMLButtonElement',
	a: 'HTMLAnchorElement',
}

export const elementBlock: BlockFn = () => renderBlock('element', 'react', {})
