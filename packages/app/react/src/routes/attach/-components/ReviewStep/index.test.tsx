import { describe, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { composeStories } from '../../../../../tests/support/storybook'
import * as stories from './index.stories'

/**
 * A STORY É A FIXTURE; ESTE ARQUIVO SÓ A EXECUTA SOB `bun test` (SB-04).
 *
 * `ReviewStep` é pure/dumb (recebe o form acumulado via prop) — todas as asserções do antigo
 * `index.test.tsx` migraram para `play` em `index.stories.tsx` (o `Harness` que cria o `useForm` real
 * mora na story, mesmo papel que tinha no teste antigo).
 */
const composed = composeStories(stories)

describe('ReviewStep — stories', () => {
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
