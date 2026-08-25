// Preferences screen that saves in the control itself — NO submit button.
//
// The shape's reference implementation is the ThreadSettingsDialog: a Switch that mutates in its
// `onCheckedChange`, an Input that mutates in its `onBlur`, pills that mutate in their `onClick`, and
// one shared `invalidate()`. The absence of a "Save" button is the point, not an omission: a toggle
// that needs confirming is a toggle that lies about its own state while the operator looks at it.
//
// Composes only blocks that already exist (element + skeleton) — the settings arrive from a query, so
// `data === undefined` renders the skeleton before any control is drawn.

import type { Recipe } from './index'
import { loadRecipe } from './index'
import { interpolate } from '../../snippet/render'

export const liveSettings: Recipe = {
	blocks: ['element', 'skeleton'],
	defaultElement: 'div',
	requiresI18n: true,
	// The host references these two keys and nothing else; without declaring them the i18n writer would
	// seed the generic `title`/`subtitle` pair, which this recipe never renders.
	i18nSlots: ['section', 'toggle'],
	renderBody: ({ i18nPrefix }) => {
		const { host } = loadRecipe('live-settings', 'react')
		if (host) return interpolate(host, { i18nPrefix: i18nPrefix ?? '' })
		return `\t\t\t{/* Implement live settings */}`
	},
}
