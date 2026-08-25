// Section wrapper with inline skeleton on `data === undefined`.
// Takes a `data: <T> | undefined` prop (typed from --sdk when given).
// The host body is sourced from the registry fragment via loadRecipe + interpolate.

import type { Recipe } from './index'
import { loadRecipe } from './index'
import { interpolate } from '../../snippet/render'

export const section: Recipe = {
	blocks: ['element', 'skeleton'],
	defaultElement: 'section',
	renderBody: ({ i18nPrefix }) => {
		if (i18nPrefix) {
			const { host } = loadRecipe('section', 'react')
			if (host) return interpolate(host, { i18nPrefix })
		}
		return `\t\t\t{/* Implement section */}`
	},
}
