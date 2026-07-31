import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import i18n from '@/lib/i18n'
import { enumLabel } from '@/lib'
import { AgentsStep } from '.'

/**
 * "EM BREVE" É UM RÓTULO DE OUTRO EIXO, NÃO UM STATUS.
 *
 * O passo desabilitava a linha por `!available` e mostrava `enumLabel('ProviderStatus', …)` do lado —
 * então um CLI instalado mas que este motor ainda não sabe dirigir aparecia como "Detectado" e
 * clicável. O operador escolhia CODEX, o `AttachThread` aceitava (ele só confere instalação) e a run
 * morria depois com NOT_IMPLEMENTED, numa conversa já criada.
 *
 * Os dois eixos continuam separados no DTO (`status` = o binário está aqui; `comingSoon` = existe um
 * runner para ele), e é por isso que o rótulo não pode sair do enum: nenhum valor de `ProviderStatus`
 * consegue dizer "instalado, mas ainda não dirigimos". O teste compara contra os DOIS rótulos do enum
 * de propósito — se a propagação do `comingSoon` sumir daqui ou do wizard, a linha volta a dizer
 * "Detectado" e este caso fica vermelho.
 */

const PROVIDERS = [
	{ provider: 'CLAUDE_CODE' as const, status: 'DETECTED' as const, available: true, comingSoon: false, version: '1.0.0' },
	// Instalado E sem runner — a máquina exata em que o rótulo antigo mentia.
	{ provider: 'CODEX' as const, status: 'DETECTED' as const, available: false, comingSoon: true, version: '3.1.0' },
	{ provider: 'OPENCODE' as const, status: 'NOT_INSTALLED' as const, available: false, comingSoon: true },
]

describe('AgentsStep — provedor sem runner se apresenta como "Em breve"', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
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
			root.render(<AgentsStep providers={PROVIDERS} onSubmit={() => {}} />)
		})
	}

	/** A linha (o botão selecionável) de um provedor, achada pelo rótulo do provedor. */
	function rowFor(label: string): HTMLButtonElement {
		const rows = [...(host?.querySelectorAll('button[type="button"]') ?? [])] as HTMLButtonElement[]
		const row = rows.find(r => r.textContent?.includes(label))
		if (!row) throw new Error(`linha do provedor ${label} não renderizada`)
		return row
	}

	it('um provedor DETECTED sem runner mostra "Em breve" no lugar do status e continua desabilitado', () => {
		mount()

		const codex = rowFor('Codex')
		expect(codex.textContent).toContain(i18n.t('common.comingSoon'))
		// O rótulo do enum NÃO pode aparecer: era exatamente o "Detectado" que fazia a linha parecer utilizável.
		expect(codex.textContent).not.toContain(enumLabel('ProviderStatus', 'DETECTED'))
		expect(codex.disabled).toBe(true)
	})

	it('um provedor sem runner E sem binário também diz "Em breve" — instalar não adiantaria', () => {
		mount()

		const opencode = rowFor('OpenCode')
		expect(opencode.textContent).toContain(i18n.t('common.comingSoon'))
		expect(opencode.textContent).not.toContain(enumLabel('ProviderStatus', 'NOT_INSTALLED'))
		expect(opencode.disabled).toBe(true)
	})

	it('o provedor com runner mantém o rótulo de status e continua selecionável', () => {
		mount()

		const claude = rowFor('Claude Code')
		expect(claude.textContent).toContain(enumLabel('ProviderStatus', 'DETECTED'))
		expect(claude.textContent).not.toContain(i18n.t('common.comingSoon'))
		expect(claude.disabled).toBe(false)
	})
})

/**
 * O CLIQUE PASSOU A ENTREGAR O PASSO — E A ESCOLHA É ÚNICA PELO GESTO.
 *
 * Esta suíte era o contrário: ela provava que o clique NÃO avançava, e defendia o botão Continuar como
 * a única coisa que tornava a multi-seleção alcançável. O founder viu o resultado, a objeção do
 * multi-seleção foi levantada explicitamente, e ele decidiu assim mesmo (31/07): o rodapé sai daqui
 * também. Os casos abaixo medem o que passou a valer; o docblock do componente carrega a dívida.
 *
 * ENTRE AS DUAS FORMAS DE "CLICAR E ENTREGAR", a escolhida foi DEFINIR (`[provider]`), não alternar.
 * Alternar-e-entregar tem duas arestas que esta suíte existe para manter fechadas:
 *   1. clicar numa linha JÁ escolhida a desmarcaria — a entrega falharia no `.min(1)` e o operador
 *      levaria um clique morto que ainda por cima apagou a escolha dele;
 *   2. depois de voltar, a escolha anterior sobrevive invisível, e clicar noutro provedor ACUMULARIA
 *      — o mesmo gesto com resultado diferente conforme um estado que ninguém vê.
 * Definir não tem nenhuma das duas: um clique, um significado, sempre.
 */
describe('AgentsStep — o clique escolhe e entrega', () => {
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	let submitted: { providers: string[] }[] = []

	/** Dois provedores dirigíveis: a resposta que o servidor passa a dar quando o 2º runner registra. */
	const TWO_AVAILABLE = [
		{ provider: 'CLAUDE_CODE' as const, status: 'DETECTED' as const, available: true, comingSoon: false, version: '1.0.0' },
		{ provider: 'OPENCODE' as const, status: 'DETECTED' as const, available: true, comingSoon: false, version: '2.0.0' },
		{ provider: 'CODEX' as const, status: 'DETECTED' as const, available: false, comingSoon: true, version: '3.1.0' },
	]

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

	function mount(props: { onBack?: () => void; defaultValues?: { providers: string[] } } = {}): void {
		host = document.createElement('div')
		document.body.appendChild(host)
		const element = host
		act(() => {
			root = createRoot(element)
			root.render(<AgentsStep providers={TWO_AVAILABLE} onSubmit={data => submitted.push(data)} {...props} />)
		})
	}

	function rowFor(label: string): HTMLButtonElement {
		const rows = [...(host?.querySelectorAll('button[type="button"]') ?? [])] as HTMLButtonElement[]
		const row = rows.find(r => r.textContent?.includes(label))
		if (!row) throw new Error(`linha do provedor ${label} não renderizada`)
		return row
	}

	async function click(el: HTMLElement): Promise<void> {
		await act(async () => {
			el.click()
		})
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 20))
		})
	}

	it('FALSEADOR — um clique na linha entrega o passo, sem passar por botão nenhum', async () => {
		mount()

		await click(rowFor('Claude Code'))

		expect(submitted).toEqual([{ providers: ['CLAUDE_CODE'] }])
	})

	it('o clique DEFINE a escolha em vez de acumular — voltar e escolher outro entrega só o outro', async () => {
		mount({ defaultValues: { providers: ['CLAUDE_CODE'] } })

		await click(rowFor('OpenCode'))

		// Não `['CLAUDE_CODE', 'OPENCODE']`: a escolha anterior sobrevive ao voltar, mas ela é invisível
		// para quem clica, e acumular faria o mesmo gesto significar coisas diferentes.
		expect(submitted).toEqual([{ providers: ['OPENCODE'] }])
	})

	it('FALSEADOR — clicar na linha JÁ escolhida entrega ela de novo: nunca desmarca, nunca entrega vazio', async () => {
		mount({ defaultValues: { providers: ['CLAUDE_CODE'] } })

		await click(rowFor('Claude Code'))

		// A aresta do alternar-e-entregar: ali este clique zeraria a lista, o `.min(1)` barraria a
		// entrega, e o operador ficaria preso num passo que acabou de perder a escolha dele.
		expect(submitted).toEqual([{ providers: ['CLAUDE_CODE'] }])
	})

	it('um provedor sem runner não entrega nada — a linha continua desabilitada', async () => {
		mount()

		const codex = rowFor('Codex')
		expect(codex.disabled).toBe(true)
		await click(codex)

		expect(submitted).toEqual([])
	})

	it('o rodapé sumiu por inteiro — não há mais Continuar neste passo', () => {
		mount()

		expect(host?.querySelector('button[type="submit"]')).toBeNull()
		expect(host?.textContent).not.toContain(i18n.t('attach.continue'))
	})

	it('o Voltar continua no cabeçalho, ao lado do título', () => {
		mount({ onBack: () => {} })

		const back = host?.querySelector('[data-slot="step-heading"] button') as HTMLButtonElement | null
		expect(back).not.toBeNull()
		expect(back?.getAttribute('aria-label')).toBe(i18n.t('attach.back'))
	})
})
