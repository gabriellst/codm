import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from 'storybook/test'
import i18n from '@/lib/i18n'
import { StepHeading } from '.'

/**
 * O VOLTAR MORA NO CABEÇALHO, E QUEM DECIDE SE ELE EXISTE É O `onBack`.
 *
 * Migrado de `index.test.tsx` (T9, onda B) — pure/dumb component (props apenas, sem SDK/rota), então
 * nenhum harness é necessário: toda asserção do teste antigo cabe em `play`. Ver o docblock do
 * componente para o porquê do botão viver aqui e ser posicionado fora do fluxo (`absolute`).
 */
const meta = {
	title: 'Attach/StepHeading',
	component: StepHeading,
	args: {
		title: 'Escolha um espaço de trabalho',
		subtitle: 'A pasta em que seus agentes vão trabalhar.',
	},
} satisfies Meta<typeof StepHeading>
export default meta

type Story = StoryObj<typeof meta>

export const WithBack: Story = {
	args: { onBack: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')
		const canvas = within(canvasElement)

		const button = canvas.getByRole('button')
		await expect(button).toHaveAttribute('aria-label', i18n.t('attach.back'))
		// FALSEADOR — fora do fluxo: o bloco centrado (título+subtítulo) é o ÚNICO filho em fluxo do
		// cabeçalho — um Voltar em fluxo (linha flex, grid com espaçador) daria DOIS filhos aqui.
		const heading = canvasElement.querySelector('[data-slot="step-heading"]')
		const inFlowChildren = [...(heading?.children ?? [])].filter(child => !child.className.includes('absolute'))
		await expect(inFlowChildren).toHaveLength(1)
		await expect(button.className).toContain('absolute')

		await userEvent.click(button)
		await expect(args.onBack).toHaveBeenCalledTimes(1)
	},
}

export const NoBack: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// Sem `onBack` não há Voltar — o primeiro passo não oferece uma volta que não existe.
		await expect(canvas.queryByRole('button')).toBeNull()
		// E o bloco centrado continua sendo o único filho em fluxo — mesma forma, com ou sem o botão.
		const heading = canvasElement.querySelector('[data-slot="step-heading"]')
		const inFlowChildren = [...(heading?.children ?? [])].filter(child => !child.className.includes('absolute'))
		await expect(inFlowChildren).toHaveLength(1)
	},
}

export const BackDisabled: Story = {
	args: { onBack: fn(), backDisabled: true },
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		const button = canvas.getByRole('button')
		await expect(button).toBeDisabled()

		await userEvent.click(button)
		await expect(args.onBack).not.toHaveBeenCalled()
	},
}
