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

	function mount(props: { onBack?: () => void; defaultValues?: { workspaceId: string } } = {}): void {
		host = document.createElement('div')
		document.body.appendChild(host)
		const element = host
		act(() => {
			root = createRoot(element)
			root.render(<WorkspaceStep workspaces={WORKSPACES} onSubmit={data => submitted.push(data)} {...props} />)
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

	/**
	 * O QUE O CONTINUAR AINDA SEGURAVA, E QUEM SEGURA AGORA.
	 *
	 * O docblock do passo justificava manter o botão dizendo que ele era "o que fecha o passo quando ele
	 * reabre já preenchido por `defaultValues` (voltar e seguir sem reescolher)". Com o rodapé removido
	 * essa afirmação vira uma dívida: é preciso PROVAR que voltar e seguir ainda funciona sem ele.
	 *
	 * Funciona, e por um caminho que já existia: `selectAndAdvance` não pergunta se o valor MUDOU, então
	 * clicar de novo na linha que já está selecionada entrega o passo igual. Este caso é a prova, e ele
	 * fica vermelho se alguém "otimizar" o clique com um `if (workspaceId === selected) return` — que
	 * trancaria o operador no passo depois de voltar, agora que não há mais botão para destrancá-lo.
	 */
	it('voltar e seguir sem reescolher: clicar de novo na linha já selecionada entrega o passo', async () => {
		mount({ defaultValues: { workspaceId: '019e4d24-6524-7041-9e1c-8108180cdd01' } })

		await click(rowFor('/Users/ada/looms'))

		expect(submitted).toEqual([{ workspaceId: '019e4d24-6524-7041-9e1c-8108180cdd01' }])
	})
})

/**
 * O RODAPÉ SAIU, E O VOLTAR SUBIU PARA O TÍTULO.
 *
 * Pedido do founder: "Remova o botão 'Voltar' e 'Continuar' da parte de baixo (…), coloque apenas
 * voltar ao lado do titulo quando for possível voltar, continuar é inferido pelo clique". Neste passo
 * as duas metades acontecem juntas: o Continuar já era redundante (o clique na linha entrega), então
 * ao subir o Voltar não sobra rodapé nenhum.
 *
 * O segundo caso mede a CASA do botão, não só a existência dele: um Voltar que continuasse no rodapé
 * também "existiria". Por isso a asserção é de parentesco — ele tem de estar dentro do cabeçalho.
 */
describe('WorkspaceStep — o Voltar mora no título, e o rodapé não existe mais', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	let backs = 0

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		backs = 0
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	})

	function mount(props: { onBack?: () => void } = {}): void {
		host = document.createElement('div')
		document.body.appendChild(host)
		const element = host
		act(() => {
			root = createRoot(element)
			root.render(<WorkspaceStep workspaces={WORKSPACES} onSubmit={() => {}} {...props} />)
		})
	}

	it('não há mais rodapé — nem Continuar, nem um Voltar solto embaixo da lista', () => {
		mount({ onBack: () => (backs += 1) })

		expect(host?.querySelector('button[type="submit"]')).toBeNull()
		expect(host?.textContent).not.toContain(i18n.t('attach.continue'))
	})

	it('FALSEADOR — o Voltar é renderizado DENTRO do cabeçalho, e volta ao clicar', () => {
		mount({ onBack: () => (backs += 1) })

		const button = host?.querySelector('[data-slot="step-heading"] button') as HTMLButtonElement | null
		expect(button).not.toBeNull()
		expect(button?.getAttribute('aria-label')).toBe(i18n.t('attach.back'))

		act(() => button?.click())
		expect(backs).toBe(1)
	})

	it('sem `onBack` o passo não mostra volta nenhuma — nem no título, nem embaixo', () => {
		mount()

		expect(host?.querySelector('[data-slot="step-heading"] button')).toBeNull()
		expect(host?.textContent).not.toContain(i18n.t('attach.back'))
	})
})
