import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent } from 'storybook/test'
import i18n from '@/lib/i18n'
import { ReviewStep } from '.'

/**
 * D3 (founder review 12/08) — `ReviewStep` recebe a seleção como PROPS PLANAS agora (não mais
 * `form: AttachForm`), e perdeu `onBack`/`backDisabled` por completo: o Voltar mora SÓ no rodapé do
 * wizard (`AttachThreadWizard`), nunca no cabeçalho deste passo — `StepHeading` não tem mais botão
 * nenhum. `onFinish` também é OPCIONAL agora: no `/attach` real o commit ("Vincular conversa") vive
 * no MESMO rodapé, e este componente não passa `onFinish` — vira leitura pura. `Default`/`Submitting`
 * abaixo cobrem o caso que ainda passa `onFinish` (o uso do onboarding, sem footer ciente do attach).
 */

const CHANNEL = '019e4d24-6524-7041-9e1c-8108180cdd01'
const WORKSPACE = '019e4d24-6524-7041-9e1c-8108180cdd02'
const WORKSPACES = [{ workspaceId: WORKSPACE, path: '/Users/ada/looms', badges: ['GIT' as const] }]

const meta = {
	title: 'Attach/ReviewStep',
	component: ReviewStep,
	args: {
		contactRef: { channelId: CHANNEL, externalId: '55110001@c.us', displayName: 'Ada Lovelace', kind: 'USER' as const },
		workspaceId: WORKSPACE,
		providers: ['CLAUDE_CODE' as const],
		channelKindById: new Map(),
		workspaces: WORKSPACES,
	},
} satisfies Meta<typeof ReviewStep>
export default meta

type Story = StoryObj<typeof meta>

function finishButton(canvasElement: HTMLElement): HTMLButtonElement {
	const buttons = [...canvasElement.querySelectorAll('button')]
	const button = buttons.find(b => b.textContent?.includes(i18n.t('attach.finish')) || b.textContent?.includes(i18n.t('attach.attaching')))
	if (!button) throw new Error('botão de vincular não renderizado')
	return button as HTMLButtonElement
}

export const Default: Story = {
	args: { onFinish: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')

		// `Vincular conversa` NÃO é um "Continuar" — é o commit do wizard, quando o caller o pede
		// (onboarding). Sobrevive à varredura dos rodapés porque é ELE quem dispara a mutation.
		const finish = finishButton(canvasElement)
		await expect(finish).toBeEnabled()
		await userEvent.click(finish)
		await expect(args.onFinish).toHaveBeenCalledTimes(1)

		// Nenhum Voltar nasce daqui — nem no cabeçalho, nem no rodapé deste componente.
		await expect(canvasElement.querySelector('[data-slot="step-heading"] button')).toBeNull()
	},
}

export const Submitting: Story = {
	args: { onFinish: fn(), isSubmitting: true },
	play: async ({ canvasElement }) => {
		await i18n.changeLanguage('pt')
		// Enquanto vincula, não se confirma de novo.
		await expect(finishButton(canvasElement)).toBeDisabled()
	},
}

export const NoFinishButtonWhenOmitted: Story = {
	play: async ({ canvasElement }) => {
		// O `/attach` real não passa `onFinish` — o footer do wizard é quem comita. Sem a prop, nenhum
		// botão de commit nasce aqui.
		const buttons = [...canvasElement.querySelectorAll('button')]
		await expect(buttons.some(b => b.textContent?.includes(i18n.t('attach.finish')))).toBe(false)
	},
}

export const IncompleteSelectionCannotFinish: Story = {
	args: { contactRef: undefined, onFinish: fn() },
	play: async ({ canvasElement }) => {
		await i18n.changeLanguage('pt')
		// Sem contato, o schema completo não valida — o commit fica travado mesmo com `onFinish` presente.
		await expect(finishButton(canvasElement)).toBeDisabled()
	},
}
