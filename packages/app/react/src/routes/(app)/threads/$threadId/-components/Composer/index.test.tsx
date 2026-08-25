import { afterEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ThreadMode } from '@codm/client-typescript/typescript'
import { composeStories } from '../../../../../../../tests/support/storybook'
import { Composer } from './index'
import * as stories from './index.stories'

/**
 * A STORY É A FIXTURE; ESTE ARQUIVO SÓ A EXECUTA SOB `bun test` (T10, onda B) — mais o ÚNICO caso
 * que não cabe numa story sozinha (ver docblock de `index.stories.tsx`).
 */
const composed = composeStories(stories)

describe('Composer — stories', () => {
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

/**
 * F4 — O SELETOR ESTÁ FORA, E O MODO SEGUE A THREAD.
 *
 * O composer usava um `useState` semeado UMA vez a partir do prop — se a thread pausa enquanto a
 * caixa está com foco, Enter continuava fazendo uma coisa enquanto o cabeçalho já dizia outra. Isso
 * só é observável remontando o MESMO componente com um `composerMode` diferente — cada story compõe
 * uma instância NOVA, então este caso não cabe em `play` (ver docblock da story) e mora aqui, num
 * mount mínimo direto do componente.
 *
 * FALSEADOR: voltar a `useState(composerMode)` sem ler o prop a cada render deixa isto vermelho.
 */
describe('Composer — o modo não fica preso num useState semeado uma vez', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host = null
	})

	function render(composerMode: ThreadMode): HTMLElement {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
		host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(
				<QueryClientProvider client={queryClient}>
					<Composer threadId="019e4d24-6524-7041-9e1c-8108180cddae" composerMode={composerMode} />
				</QueryClientProvider>,
			)
		})
		return host
	}

	it('um re-render com um novo modo muda o que o composer vai fazer', () => {
		const container = render('DIRECT')
		expect(container.querySelector('[data-testid="composer"]')?.getAttribute('data-mode')).toBe('DIRECT')

		// A thread pausa underneath the operator: same mounted component, new prop.
		act(() => {
			root!.render(
				<QueryClientProvider client={new QueryClient()}>
					<Composer threadId="019e4d24-6524-7041-9e1c-8108180cddae" composerMode="STEER" />
				</QueryClientProvider>,
			)
		})

		expect(container.querySelector('[data-testid="composer"]')?.getAttribute('data-mode')).toBe('STEER')
	})
})
