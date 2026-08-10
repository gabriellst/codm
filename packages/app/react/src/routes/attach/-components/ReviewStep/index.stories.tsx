import type { Meta, StoryObj } from '@storybook/react'
import { useForm } from '@tanstack/react-form'
import { expect, fn, userEvent } from 'storybook/test'
import type { attachThreadMutationRequestSchema } from '@codm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import i18n from '@/lib/i18n'
import { ReviewStep } from '.'

/**
 * Migrado de `index.test.tsx` (T9, onda B). Pure/dumb component (recebe o form acumulado do wizard
 * via prop) — como o passo não cria o próprio `useForm`, a story precisa do mesmo hospedeiro que o
 * teste antigo usava (`Harness`) para produzir uma instância real. Nenhuma rede envolvida.
 */

const CHANNEL = '019e4d24-6524-7041-9e1c-8108180cdd01'
const WORKSPACE = '019e4d24-6524-7041-9e1c-8108180cdd02'
const WORKSPACES = [{ workspaceId: WORKSPACE, path: '/Users/ada/looms', badges: ['GIT' as const] }]

type AttachValues = DeepPartial<(typeof attachThreadMutationRequestSchema)['_zod']['output']>

const COMPLETE: AttachValues = {
	contactRef: { channelId: CHANNEL, externalId: '55110001@c.us', displayName: 'Ada Lovelace', kind: 'USER' },
	workspaceId: WORKSPACE,
	providers: ['CLAUDE_CODE'],
}

interface HarnessProps {
	onBack?: () => void
	onFinish: () => void
	isSubmitting?: boolean
}

/** O passo precisa do form acumulado do wizard — este hospedeiro o cria, como o wizard real faz. */
function Harness({ onBack, onFinish, isSubmitting }: HarnessProps) {
	const form = useForm({ defaultValues: COMPLETE })
	return (
		<ReviewStep
			form={form}
			channelKindById={new Map()}
			workspaces={WORKSPACES}
			onBack={onBack}
			onFinish={onFinish}
			isSubmitting={isSubmitting}
		/>
	)
}

const meta = {
	title: 'Attach/ReviewStep',
	component: Harness,
	args: { onFinish: fn() },
} satisfies Meta<typeof Harness>
export default meta

type Story = StoryObj<typeof meta>

function finishButton(canvasElement: HTMLElement): HTMLButtonElement {
	const buttons = [...canvasElement.querySelectorAll('button')]
	const button = buttons.find(b => b.textContent?.includes(i18n.t('attach.finish')) || b.textContent?.includes(i18n.t('attach.attaching')))
	if (!button) throw new Error('botão de vincular não renderizado')
	return button as HTMLButtonElement
}

export const Default: Story = {
	args: { onBack: fn(), onFinish: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')

		// `Anexar` NÃO é um "Continuar" — é o commit do wizard. Sobrevive à varredura dos rodapés
		// porque é ELE quem dispara a mutation que cria a conversa.
		const finish = finishButton(canvasElement)
		await expect(finish).toBeEnabled()
		await userEvent.click(finish)
		await expect(args.onFinish).toHaveBeenCalledTimes(1)

		// O Voltar está no cabeçalho, não no rodapé — e o rodapé só carrega a ação (um botão só).
		const back = canvasElement.querySelector('[data-slot="step-heading"] button') as HTMLButtonElement | null
		await expect(back).not.toBeNull()
		await expect(back).toHaveAttribute('aria-label', i18n.t('attach.back'))
		await expect(finish.parentElement?.querySelectorAll('button')).toHaveLength(1)

		await userEvent.click(back!)
		await expect(args.onBack).toHaveBeenCalledTimes(1)
	},
}

export const Submitting: Story = {
	args: { onBack: fn(), onFinish: fn(), isSubmitting: true },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')

		// Enquanto vincula, nem se recua nem se confirma de novo.
		const back = canvasElement.querySelector('[data-slot="step-heading"] button') as HTMLButtonElement | null
		await expect(back).toBeDisabled()
		await expect(finishButton(canvasElement)).toBeDisabled()

		await userEvent.click(back!, { pointerEventsCheck: 0 })
		await expect(args.onBack).not.toHaveBeenCalled()
	},
}
