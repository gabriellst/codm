import { describe, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { composeStories } from '../../../../../tests/support/storybook'
import * as stories from './index.stories'

/**
 * A STORY É A FIXTURE; ESTE ARQUIVO SÓ A EXECUTA SOB `bun test` (SB-04).
 *
 * `StepHeading` é pure/dumb (props apenas) — nenhuma das asserções do antigo `index.test.tsx`
 * precisava de rede, então TODAS migraram para `play` em `index.stories.tsx`. Este arquivo apenas
 * monta cada story (mesmo padrão do smoke) e invoca o `play` dela — o `bun:test` `it()` propaga
 * qualquer `expect` que falhar dentro do `play`.
 */
const composed = composeStories(stories)

describe('StepHeading — stories', () => {
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
