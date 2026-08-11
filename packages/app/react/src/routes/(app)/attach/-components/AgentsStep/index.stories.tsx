import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { GetAttachThreadWizardQueryResponse } from '@codm/client-typescript/typescript'
import { enumLabel } from '@/lib'
import i18n from '@/lib/i18n'
import { AgentsStep } from '.'

/**
 * Migrado de `index.test.tsx` (T9, onda B). Pure/dumb component (providers via prop, sem SDK) —
 * toda asserção do teste antigo cabe em `play`, sem harness. Ver o docblock do componente para a
 * dívida conhecida (seleção única definindo, não alternando) e por que "Em breve" vence do rótulo
 * de status do enum.
 */

const THREE_PROVIDERS: GetAttachThreadWizardQueryResponse['providers'] = [
	{ provider: 'CLAUDE_CODE', status: 'DETECTED', available: true, comingSoon: false, version: '1.0.0' },
	// Instalado E sem runner — a máquina exata em que o rótulo antigo mentia ("Detectado" e clicável).
	{ provider: 'CODEX', status: 'DETECTED', available: false, comingSoon: true, version: '3.1.0' },
	{ provider: 'OPENCODE', status: 'NOT_INSTALLED', available: false, comingSoon: true },
]

const TWO_AVAILABLE: GetAttachThreadWizardQueryResponse['providers'] = [
	{ provider: 'CLAUDE_CODE', status: 'DETECTED', available: true, comingSoon: false, version: '1.0.0' },
	{ provider: 'OPENCODE', status: 'DETECTED', available: true, comingSoon: false, version: '2.0.0' },
]

const meta = {
	title: 'Attach/AgentsStep',
	component: AgentsStep,
	args: { providers: THREE_PROVIDERS },
} satisfies Meta<typeof AgentsStep>
export default meta

// `fn()` is a SPY — sharing one instance via `meta.args` would accumulate calls across every story
// composed in the same process (the smoke + this file's executor both compose the whole module), so
// each story below mints its OWN `onSubmit`/`onBack` instead of relying on the meta default.

type Story = StoryObj<typeof meta>

function rowFor(canvasElement: HTMLElement, label: string): HTMLButtonElement {
	const rows = [...canvasElement.querySelectorAll('button[type="button"]')] as HTMLButtonElement[]
	const row = rows.find(r => r.textContent?.includes(label))
	if (!row) throw new Error(`linha do provedor ${label} não renderizada`)
	return row
}

export const Default: Story = {
	args: { onSubmit: fn(), onBack: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')
		const canvas = within(canvasElement)

		// "EM BREVE" É UM RÓTULO DE OUTRO EIXO, NÃO UM STATUS — os dois eixos são independentes.
		const codex = rowFor(canvasElement, 'Codex')
		await expect(codex.textContent).toContain(i18n.t('common.comingSoon'))
		await expect(codex.textContent).not.toContain(enumLabel('ProviderStatus', 'DETECTED'))
		await expect(codex).toBeDisabled()

		const opencode = rowFor(canvasElement, 'OpenCode')
		await expect(opencode.textContent).toContain(i18n.t('common.comingSoon'))
		await expect(opencode.textContent).not.toContain(enumLabel('ProviderStatus', 'NOT_INSTALLED'))
		await expect(opencode).toBeDisabled()

		const claude = rowFor(canvasElement, 'Claude Code')
		await expect(claude.textContent).toContain(enumLabel('ProviderStatus', 'DETECTED'))
		await expect(claude.textContent).not.toContain(i18n.t('common.comingSoon'))
		await expect(claude).toBeEnabled()

		// FALSEADOR — o clique na linha entrega o passo, sem passar por botão nenhum.
		await userEvent.click(claude)
		await expect(args.onSubmit).toHaveBeenCalledTimes(1)
		await expect(args.onSubmit).toHaveBeenCalledWith({ providers: ['CLAUDE_CODE'] })

		// Um provedor sem runner não entrega nada — a linha continua desabilitada e o clique é inerte.
		await userEvent.click(codex, { pointerEventsCheck: 0 })
		await expect(args.onSubmit).toHaveBeenCalledTimes(1)

		// O rodapé sumiu por inteiro — não há mais Continuar neste passo.
		await expect(canvas.queryByRole('button', { name: i18n.t('attach.continue') })).toBeNull()
		await expect(canvasElement.querySelector('button[type="submit"]')).toBeNull()

		// O Voltar continua no cabeçalho, ao lado do título.
		const back = canvasElement.querySelector('[data-slot="step-heading"] button') as HTMLButtonElement | null
		await expect(back).not.toBeNull()
		await expect(back).toHaveAttribute('aria-label', i18n.t('attach.back'))
		await userEvent.click(back!)
		await expect(args.onBack).toHaveBeenCalledTimes(1)
	},
}

export const SwitchDefinesNotAccumulates: Story = {
	args: { providers: TWO_AVAILABLE, defaultValues: { providers: ['CLAUDE_CODE'] }, onSubmit: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')
		// O clique DEFINE a escolha em vez de acumular — voltar e escolher outro entrega só o outro.
		await userEvent.click(rowFor(canvasElement, 'OpenCode'))
		await expect(args.onSubmit).toHaveBeenCalledTimes(1)
		await expect(args.onSubmit).toHaveBeenCalledWith({ providers: ['OPENCODE'] })
	},
}

export const ReclickAlreadySelectedStillDelivers: Story = {
	args: { providers: TWO_AVAILABLE, defaultValues: { providers: ['CLAUDE_CODE'] }, onSubmit: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')
		// FALSEADOR — clicar na linha JÁ escolhida entrega ela de novo: nunca desmarca, nunca entrega
		// vazio (a aresta do alternar-e-entregar que a definição evita).
		await userEvent.click(rowFor(canvasElement, 'Claude Code'))
		await expect(args.onSubmit).toHaveBeenCalledTimes(1)
		await expect(args.onSubmit).toHaveBeenCalledWith({ providers: ['CLAUDE_CODE'] })
	},
}
