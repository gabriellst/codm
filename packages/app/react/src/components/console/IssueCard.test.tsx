import { beforeAll, describe, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/lib/i18n'
import { composeStories } from '../../../tests/support/storybook'
import * as stories from './IssueCard.stories'

/**
 * THE STORY IS THE FIXTURE (SB-04): `IssueCard` is a leaf (the item by prop), so every assertion lives in the
 * stories' `play` — the retry time today and past midnight, the escalation badge, and neither. This file mounts each
 * story (in the default language, the one its plays format instants in) and runs its `play`.
 */
const composed = composeStories(stories)

describe('IssueCard — stories', () => {
	beforeAll(async () => {
		await i18n.changeLanguage('pt')
	})

	for (const [name, Story] of Object.entries(composed)) {
		it(name, async () => {
			const host = document.createElement('div')
			document.body.appendChild(host)
			let root: Root | null = null
			await act(async () => {
				root = createRoot(host)
				root.render(<Story />)
			})
			await act(async () => {
				await Promise.resolve()
			})
			await act(async () => {
				await Story.play?.({ canvasElement: host })
			})
			act(() => root?.unmount())
			host.remove()
		})
	}
})
