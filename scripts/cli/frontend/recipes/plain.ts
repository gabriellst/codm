// Bare function shell — no styling, no state, no i18n by default.

import type { Recipe } from './index'

export const plain: Recipe = {
	blocks: [],
	defaultElement: 'div',
	renderBody: () => `\t\t\t{/* Implement */}`,
}
