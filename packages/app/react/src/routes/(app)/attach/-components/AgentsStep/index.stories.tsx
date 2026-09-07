import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { GetAttachThreadWizardQueryResponse } from '@codm/client-typescript/typescript'
import { enumLabel } from '@/lib'
import i18n from '@/lib/i18n'
import { AgentsStep } from '.'

/**
 * D3 (founder review 12/08) — redesenho completo do card (72px, ícone-tile, select de modelo inline,
 * checkbox). O clique GRAVA a escolha (`onSubmit`) mas não avança mais o passo sozinho — sem back
 * button aqui, `StepHeading` perdeu o Voltar por completo, e o rodapé persistente do wizard
 * (`AttachThreadWizard`) é quem move o passo. A linha deixou de ser um `<button>` (o select de modelo
 * aninhado, interativo, não pode viver dentro de um `<button>` real) — agora é `div[role=button]`.
 */

const THREE_PROVIDERS: GetAttachThreadWizardQueryResponse['providers'] = [
	{
		provider: 'CLAUDE_CODE',
		status: 'DETECTED',
		available: true,
		comingSoon: false,
		version: '1.0.0',
		models: ['DEFAULT', 'OPUS', 'SONNET', 'HAIKU'],
	},
	// Instalado E sem runner — a máquina exata em que o rótulo antigo mentia ("Detectado" e clicável).
	{ provider: 'CODEX', status: 'DETECTED', available: false, comingSoon: true, version: '3.1.0', models: ['DEFAULT', 'TERRA', 'LUNA'] },
	{ provider: 'OPENCODE', status: 'NOT_INSTALLED', available: false, comingSoon: true, models: [] },
]

const TWO_AVAILABLE: GetAttachThreadWizardQueryResponse['providers'] = [
	{
		provider: 'CLAUDE_CODE',
		status: 'DETECTED',
		available: true,
		comingSoon: false,
		version: '1.0.0',
		models: ['DEFAULT', 'OPUS', 'SONNET', 'HAIKU'],
	},
	// Disponível e SEM catálogo: a linha renderiza sem seletor, que é o caso que `models.length > 0` cobre.
	{ provider: 'OPENCODE', status: 'DETECTED', available: true, comingSoon: false, version: '2.0.0', models: [] },
]

const meta = {
	title: 'Attach/AgentsStep',
	component: AgentsStep,
	args: { providers: THREE_PROVIDERS },
} satisfies Meta<typeof AgentsStep>
export default meta

// `fn()` is a SPY — sharing one instance via `meta.args` would accumulate calls across every story
// composed in the same process (the smoke + this file's executor both compose the whole module), so
// each story below mints its OWN `onSubmit` instead of relying on the meta default.

type Story = StoryObj<typeof meta>

function rowFor(canvasElement: HTMLElement, label: string): HTMLElement {
	const rows = [...canvasElement.querySelectorAll('[role="button"]')] as HTMLElement[]
	const row = rows.find(r => r.textContent?.includes(label))
	if (!row) throw new Error(`linha do provedor ${label} não renderizada`)
	return row
}

export const Default: Story = {
	args: { onSubmit: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')
		const canvas = within(canvasElement)

		// "EM BREVE" É UM RÓTULO DE OUTRO EIXO, NÃO UM STATUS — os dois eixos são independentes.
		const codex = rowFor(canvasElement, 'Codex')
		await expect(codex.textContent).toContain(i18n.t('common.comingSoon'))
		await expect(codex.textContent).not.toContain(enumLabel('ProviderStatus', 'DETECTED'))
		await expect(codex).toHaveAttribute('aria-disabled', 'true')

		const opencode = rowFor(canvasElement, 'OpenCode')
		await expect(opencode.textContent).toContain(i18n.t('common.comingSoon'))
		await expect(opencode).toHaveAttribute('aria-disabled', 'true')

		const claude = rowFor(canvasElement, 'Claude Code')
		await expect(claude.textContent).toContain(enumLabel('ProviderStatus', 'DETECTED'))
		await expect(claude.textContent).not.toContain(i18n.t('common.comingSoon'))
		await expect(claude).toHaveAttribute('aria-disabled', 'false')

		// D3 — o select de modelo só existe na linha DISPONÍVEL.
		await expect(claude.querySelector(`[aria-label="${i18n.t('session.agentModel')}"]`)).not.toBeNull()
		await expect(codex.querySelector(`[aria-label="${i18n.t('session.agentModel')}"]`)).toBeNull()

		// FALSEADOR — o clique na linha GRAVA a escolha via `onSubmit`, sem passar por botão nenhum.
		await userEvent.click(claude)
		await expect(args.onSubmit).toHaveBeenCalledTimes(1)
		await expect(args.onSubmit).toHaveBeenCalledWith({ providers: ['CLAUDE_CODE'] })

		// Um provedor sem runner não grava nada — a linha continua desabilitada e o clique é inerte.
		await userEvent.click(codex, { pointerEventsCheck: 0 })
		await expect(args.onSubmit).toHaveBeenCalledTimes(1)

		// Nem Continuar, nem Voltar — nenhum controle de navegação nasce deste componente.
		await expect(canvas.queryByRole('button', { name: i18n.t('attach.continue') })).toBeNull()
		await expect(canvasElement.querySelector('button[type="submit"]')).toBeNull()
		await expect(canvasElement.querySelector('[data-slot="step-heading"] button')).toBeNull()
	},
}

export const ModelSelectDoesNotSelectRow: Story = {
	args: { onSubmit: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')
		const claude = rowFor(canvasElement, 'Claude Code')
		const select = claude.querySelector(`[aria-label="${i18n.t('session.agentModel')}"]`) as HTMLElement

		// FALSEADOR — abrir o select de modelo (nested interactive) não deve, sozinho, gravar a linha:
		// o clique é interceptado (`stopPropagation`) antes de borbulhar para o `onClick` da linha.
		await userEvent.click(select)
		await expect(args.onSubmit).not.toHaveBeenCalled()
	},
}

export const SwitchDefinesNotAccumulates: Story = {
	args: { providers: TWO_AVAILABLE, defaultValues: { providers: ['CLAUDE_CODE'] }, onSubmit: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')
		// O clique DEFINE a escolha em vez de acumular — voltar e escolher outro grava só o outro.
		await userEvent.click(rowFor(canvasElement, 'OpenCode'))
		await expect(args.onSubmit).toHaveBeenCalledTimes(1)
		await expect(args.onSubmit).toHaveBeenCalledWith({ providers: ['OPENCODE'] })
	},
}

export const ReclickAlreadySelectedStillDelivers: Story = {
	args: { providers: TWO_AVAILABLE, defaultValues: { providers: ['CLAUDE_CODE'] }, onSubmit: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')
		// FALSEADOR — clicar na linha JÁ escolhida grava ela de novo: nunca desmarca, nunca entrega
		// vazio (a aresta do alternar que a definição evita).
		await userEvent.click(rowFor(canvasElement, 'Claude Code'))
		await expect(args.onSubmit).toHaveBeenCalledTimes(1)
		await expect(args.onSubmit).toHaveBeenCalledWith({ providers: ['CLAUDE_CODE'] })
	},
}
