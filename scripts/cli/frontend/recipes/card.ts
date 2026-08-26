// Leaf card for rendering inside a `.map()`. Receives an `item` prop typed
// via --sdk when given. Empty CVA scaffold by default (user fills variants
// after generation).
//
// i18n is NOT auto-enabled — some cards are icon/badge-only. If your card
// renders any text, pass --i18n=<prefix>.

import type { Recipe } from './index'

export const card: Recipe = {
	blocks: ['element', 'variants'],
	defaultElement: 'article',
	renderBody: () => `\t\t\t{/* Implement card */}`,
}
