import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { GetAttachThreadWizardQueryResponse } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { WorkspaceStep } from '.'

/**
 * Migrado de `index.test.tsx` (T9, onda B). Pure/dumb component (workspaces via prop, sem SDK) —
 * toda asserção do teste antigo cabe em `play`, sem harness. Ver o docblock do componente: escolher
 * é responder, o clique entrega sem passar por Continuar.
 */

const WORKSPACES: GetAttachThreadWizardQueryResponse['workspaces'] = [
	{ workspaceId: '019e4d24-6524-7041-9e1c-8108180cdd01', path: '/Users/ada/looms', badges: ['GIT'] },
	{ workspaceId: '019e4d24-6524-7041-9e1c-8108180cdd02', path: '/Users/ada/engine', badges: [] },
]

const meta = {
	title: 'Attach/WorkspaceStep',
	component: WorkspaceStep,
	args: { workspaces: WORKSPACES },
} satisfies Meta<typeof WorkspaceStep>
export default meta

type Story = StoryObj<typeof meta>

function rowFor(canvasElement: HTMLElement, path: string): HTMLButtonElement {
	const rows = [...canvasElement.querySelectorAll('button[type="button"]')] as HTMLButtonElement[]
	const row = rows.find(r => r.textContent?.includes(path))
	if (!row) throw new Error(`linha do workspace ${path} não renderizada`)
	return row
}

export const Default: Story = {
	args: { onSubmit: fn(), onBack: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')
		const canvas = within(canvasElement)

		// FALSEADOR — um clique na linha entrega o passo, sem passar pelo botão Continuar. E o
		// entregue é o CLICADO (aqui "engine", o SEGUNDO da lista) — não o primeiro por padrão.
		await userEvent.click(rowFor(canvasElement, '/Users/ada/engine'))
		await expect(args.onSubmit).toHaveBeenCalledTimes(1)
		await expect(args.onSubmit).toHaveBeenCalledWith({ workspaceId: WORKSPACES[1]?.workspaceId })

		// Clicar noutra linha entrega o NOVO id — prova de que nada ficou hardcoded no primeiro clique.
		await userEvent.click(rowFor(canvasElement, '/Users/ada/looms'))
		await expect(args.onSubmit).toHaveBeenCalledTimes(2)
		await expect(args.onSubmit).toHaveBeenNthCalledWith(2, { workspaceId: WORKSPACES[0]?.workspaceId })

		// O rodapé sumiu por inteiro — nem Continuar, nem um Voltar solto embaixo da lista.
		await expect(canvasElement.querySelector('button[type="submit"]')).toBeNull()
		await expect(canvas.queryByRole('button', { name: i18n.t('attach.continue') })).toBeNull()

		// FALSEADOR — o Voltar é renderizado DENTRO do cabeçalho, e volta ao clicar.
		const back = canvasElement.querySelector('[data-slot="step-heading"] button') as HTMLButtonElement | null
		await expect(back).not.toBeNull()
		await expect(back).toHaveAttribute('aria-label', i18n.t('attach.back'))
		await userEvent.click(back!)
		await expect(args.onBack).toHaveBeenCalledTimes(1)
	},
}

export const ReclickAlreadySelectedStillDelivers: Story = {
	args: { defaultValues: { workspaceId: WORKSPACES[0]?.workspaceId }, onSubmit: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')
		// VOLTAR E SEGUIR SEM REESCOLHER: clicar de nada na linha JÁ selecionada entrega o passo igual
		// — este caso derruba um `if (workspaceId === selected) return` que trancaria o operador.
		await userEvent.click(rowFor(canvasElement, '/Users/ada/looms'))
		await expect(args.onSubmit).toHaveBeenCalledTimes(1)
		await expect(args.onSubmit).toHaveBeenCalledWith({ workspaceId: WORKSPACES[0]?.workspaceId })
	},
}

export const NoBack: Story = {
	args: { onSubmit: fn() },
	play: async ({ canvasElement }) => {
		await i18n.changeLanguage('pt')
		// Sem `onBack` o passo não mostra volta nenhuma — nem no título, nem embaixo.
		await expect(canvasElement.querySelector('[data-slot="step-heading"] button')).toBeNull()
		await expect(canvasElement.textContent).not.toContain(i18n.t('attach.back'))
	},
}
