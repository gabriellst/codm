import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from 'storybook/test'
import { Composer } from '.'

/**
 * Migrado de `Composer.test.tsx` (T10, onda B). `Composer` USA hooks de mutation
 * (`useSteerThread`/`useSendDirectMessage`/`useQueryClient`), mas nenhum caso do teste antigo dispara
 * uma requisição — os dois casos abaixo cabem em `play` sem MSW nem harness, com o `QueryClientProvider`
 * ambiente que o decorator global já injeta em toda story (`withConnected`, mesmo sem
 * `parameters.route`). O terceiro caso do teste antigo — "um re-render com um NOVO `composerMode` muda
 * o que o composer vai fazer" (a prova de que o modo NÃO fica preso num `useState` semeado uma vez,
 * F4) — não cabe numa única story (cada story monta uma instância fresca; a regressão só aparece
 * remontando o MESMO componente com um prop diferente) e fica em `index.test.tsx`.
 */

const THREAD = '019e4d24-6524-7041-9e1c-8108180cddae'

const meta = {
	title: 'Console/Composer',
	component: Composer,
	args: { threadId: THREAD },
} satisfies Meta<typeof Composer>
export default meta

type Story = StoryObj<typeof meta>

/**
 * AC-F4.1, metade STEER: o composer obedece o modo que o servidor mandou, sem re-decidir.
 * FALSEADOR: restaurar o `MODES.map(...)` do seletor voltaria a renderizar mais de um botão.
 */
export const Steer: Story = {
	args: { composerMode: 'STEER' },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		const composer = canvasElement.querySelector('[data-testid="composer"]')
		await expect(composer).toHaveAttribute('data-mode', 'STEER')

		const buttons = canvas.getAllByRole('button')
		await expect(buttons).toHaveLength(1)
		await expect(buttons[0]).toHaveAttribute('aria-label')
	},
}

export const Direct: Story = {
	args: { composerMode: 'DIRECT' },
	play: async ({ canvasElement }) => {
		const composer = canvasElement.querySelector('[data-testid="composer"]')
		await expect(composer).toHaveAttribute('data-mode', 'DIRECT')
	},
}
