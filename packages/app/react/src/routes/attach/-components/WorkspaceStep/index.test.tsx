import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/lib/i18n'
import { WorkspaceStep } from '.'

/**
 * ESCOLHER É RESPONDER — o clique na linha JÁ é a resposta do passo.
 *
 * O pedido do founder: "ao clicar no nome do contato, workspace, provedora automaticamente continue,
 * sem ter que clicar no botão". Este passo é de seleção ÚNICA: o campo é um `workspaceId` escalar, e
 * escolher um segundo workspace substitui o primeiro. Não existe estado intermediário entre "cliquei
 * numa linha" e "terminei o passo" — o botão Continuar era um segundo clique que só confirmava o que
 * o primeiro já tinha dito.
 *
 * O caso mede o EFEITO (o `onSubmit` do passo dispara com o id escolhido), não a fiação: um teste que
 * espionasse `form.setFieldValue` continuaria verde com o auto-avanço removido, que é exatamente a
 * regressão a fixar.
 */

const WORKSPACES = [
	{ workspaceId: '019e4d24-6524-7041-9e1c-8108180cdd01', path: '/Users/ada/looms', badges: ['GIT' as const] },
	{ workspaceId: '019e4d24-6524-7041-9e1c-8108180cdd02', path: '/Users/ada/engine', badges: [] },
]

describe('WorkspaceStep — clicar no workspace avança o passo', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	let submitted: { workspaceId: string }[] = []

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		submitted = []
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	})

	function mount(): void {
		host = document.createElement('div')
		document.body.appendChild(host)
		const element = host
		act(() => {
			root = createRoot(element)
			root.render(<WorkspaceStep workspaces={WORKSPACES} onSubmit={data => submitted.push(data)} />)
		})
	}

	/** A linha selecionável de um workspace, achada pelo caminho que ela mostra. */
	function rowFor(path: string): HTMLButtonElement {
		const rows = [...(host?.querySelectorAll('button[type="button"]') ?? [])] as HTMLButtonElement[]
		const row = rows.find(r => r.textContent?.includes(path))
		if (!row) throw new Error(`linha do workspace ${path} não renderizada`)
		return row
	}

	/** O clique, e as passadas de efeito que o submit do TanStack Form precisa para assentar. */
	async function click(el: HTMLElement): Promise<void> {
		await act(async () => {
			el.click()
		})
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 20))
		})
	}

	it('FALSEADOR — um clique na linha entrega o passo, sem passar pelo botão Continuar', async () => {
		mount()

		await click(rowFor('/Users/ada/engine'))

		expect(submitted).toEqual([{ workspaceId: '019e4d24-6524-7041-9e1c-8108180cdd02' }])
	})

	it('o workspace entregue é o que foi clicado — não o primeiro da lista', async () => {
		mount()

		await click(rowFor('/Users/ada/looms'))

		expect(submitted).toHaveLength(1)
		expect(submitted[0]?.workspaceId).toBe('019e4d24-6524-7041-9e1c-8108180cdd01')
	})
})
