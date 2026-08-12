import type { Meta, StoryObj } from '@storybook/react'
import { expect, fn, userEvent, within } from 'storybook/test'
import type { GetAttachThreadWizardQueryResponse } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { WorkspaceStep } from '.'

/**
 * D3 (founder review 12/08) — o clique GRAVA a escolha (`onSubmit`) mas não avança mais o passo
 * sozinho, e não sobra back button nenhum aqui: `StepHeading` perdeu o Voltar por completo, e
 * `onBack` saiu do contrato deste componente — o rodapé persistente do wizard
 * (`AttachThreadWizard`) é quem move o passo em qualquer direção agora.
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
	args: { onSubmit: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')
		const canvas = within(canvasElement)

		// FALSEADOR — um clique na linha GRAVA a escolha via `onSubmit`, sem passar pelo botão
		// Continuar (que nem existe aqui — vive no footer do wizard). E o gravado é o CLICADO (aqui
		// "engine", o SEGUNDO da lista) — não o primeiro por padrão.
		await userEvent.click(rowFor(canvasElement, '/Users/ada/engine'))
		await expect(args.onSubmit).toHaveBeenCalledTimes(1)
		await expect(args.onSubmit).toHaveBeenCalledWith({ workspaceId: WORKSPACES[1]?.workspaceId })

		// Clicar noutra linha grava o NOVO id — prova de que nada ficou hardcoded no primeiro clique.
		await userEvent.click(rowFor(canvasElement, '/Users/ada/looms'))
		await expect(args.onSubmit).toHaveBeenCalledTimes(2)
		await expect(args.onSubmit).toHaveBeenNthCalledWith(2, { workspaceId: WORKSPACES[0]?.workspaceId })

		// Nem Continuar, nem Voltar — nenhum controle de navegação nasce deste componente.
		await expect(canvasElement.querySelector('button[type="submit"]')).toBeNull()
		await expect(canvas.queryByRole('button', { name: i18n.t('attach.continue') })).toBeNull()
		await expect(canvasElement.querySelector('[data-slot="step-heading"] button')).toBeNull()
	},
}

export const ReclickAlreadySelectedStillDelivers: Story = {
	args: { defaultValues: { workspaceId: WORKSPACES[0]?.workspaceId }, onSubmit: fn() },
	play: async ({ canvasElement, args }) => {
		await i18n.changeLanguage('pt')
		// VOLTAR E SEGUIR SEM REESCOLHER: clicar de novo na linha JÁ selecionada grava o passo igual —
		// este caso derruba um `if (workspaceId === selected) return` que trancaria o operador.
		await userEvent.click(rowFor(canvasElement, '/Users/ada/looms'))
		await expect(args.onSubmit).toHaveBeenCalledTimes(1)
		await expect(args.onSubmit).toHaveBeenCalledWith({ workspaceId: WORKSPACES[0]?.workspaceId })
	},
}

export const SelectedRowShowsCheck: Story = {
	args: { defaultValues: { workspaceId: WORKSPACES[0]?.workspaceId }, onSubmit: fn() },
	play: async ({ canvasElement }) => {
		await i18n.changeLanguage('pt')
		// `.split(' ')`, não `.toContain` de substring — a base do `row` já carrega `hover:border-primary`
		// (presente nas duas linhas), então uma checagem de substring "vê" o token errado.
		const selectedRow = rowFor(canvasElement, '/Users/ada/looms')
		await expect(selectedRow.className.split(' ')).toContain('border-primary')
		const otherRow = rowFor(canvasElement, '/Users/ada/engine')
		await expect(otherRow.className.split(' ')).not.toContain('border-primary')
	},
}
