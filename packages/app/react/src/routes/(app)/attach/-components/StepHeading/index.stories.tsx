import type { Meta, StoryObj } from '@storybook/react'
import { expect, within } from 'storybook/test'
import { StepHeading } from '.'

/**
 * D3 (founder review 12/08) — the back button that used to live here MOVED to the wizard's
 * persistent footer (`AttachThreadWizard`). `StepHeading` is now a pure title+subtitle heading: no
 * `onBack`, no button, ever. Previously (`WithBack`/`NoBack`/`BackDisabled`) this suite proved the
 * back button's presence/absence/disabled state — that behavior now lives in
 * `AttachThreadWizard`'s own tests. What survives here is the shape: left-aligned, no interactive
 * element.
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

export const Default: Story = {
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)

		// FALSEADOR — nenhum botão nasce daqui mais; o Voltar é do footer do wizard.
		await expect(canvas.queryByRole('button')).toBeNull()

		await expect(canvas.getByText(args.title as string)).toBeInTheDocument()
		await expect(canvas.getByText(args.subtitle as string)).toBeInTheDocument()

		// Alinhado à esquerda — o founder reclamou do centro do desenho anterior.
		const heading = canvasElement.querySelector('[data-slot="step-heading"]')
		await expect(heading?.className).toContain('text-left')
		await expect(heading?.className).not.toContain('items-center')
		await expect(heading?.className).not.toContain('text-center')
	},
}
