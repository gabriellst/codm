import { describe, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { composeStories } from '../../../../../../tests/support/storybook'
import * as stories from './index.stories'

/**
 * THE STORY IS THE FIXTURE (SB-04): `SystemHealthFacts` is a leaf (props only), so every assertion lives in the
 * stories' `play` — one per quota state, and the observation week's would-hold. This file mounts each and runs it.
 */
const composed = composeStories(stories)

describe('SystemHealthFacts — stories', () => {
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
