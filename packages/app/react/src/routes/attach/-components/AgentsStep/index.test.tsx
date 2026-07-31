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
 * ESTE PASSO FICA DE FORA DO AUTO-AVANÇO, E O TIPO DA SELEÇÃO É O MOTIVO.
 *
 * O founder pediu que clicar em "contato, workspace, provedora" avançasse sozinho. Nos dois primeiros
 * o clique É a resposta: o campo é escalar e a segunda escolha substitui a primeira. Aqui não —
 * `providers` é `z.array(providerKindSchema).min(1)`, SEM máximo, e a linha faz `toggle`. Avançar no
 * primeiro clique tornaria o segundo provedor inalcançável pelo gesto principal: quem quisesse dois
 * teria de escolher um, ser levado embora, voltar e escolher o outro.
 *
 * Não é hipótese guardada para depois: `comingSoon` sai de `!drivable.includes(...)`, derivado dos
 * AgentRunners REGISTRADOS (`GetAttachThreadWizard.ts`) e deliberadamente não de uma lista literal —
 * no dia em que o segundo runner registrar, o segundo provedor fica disponível sozinho e o auto-avanço
 * viraria uma trave escondida. Por isso a decisão é sobre o TIPO da seleção, não sobre a contagem de
 * provedores dirigíveis hoje (que é um).
 *
 * A alternativa considerada — avançar só quando a seleção vai de vazia para um — foi recusada: o mesmo
 * gesto na mesma lista avançaria ou não conforme um estado invisível, afordância pior que um botão
 * honesto.
 *
 * O primeiro caso é a negação direta do auto-avanço e fica vermelho no minuto em que alguém o
 * acrescentar aqui. O segundo prova a capacidade que a decisão protege.
 */
describe('AgentsStep — multi-seleção fica fora do auto-avanço', () => {
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

	function mount(): void {
		host = document.createElement('div')
		document.body.appendChild(host)
		const element = host
		act(() => {
			root = createRoot(element)
			root.render(<AgentsStep providers={TWO_AVAILABLE} onSubmit={data => submitted.push(data)} />)
		})
	}

	function rowFor(label: string): HTMLButtonElement {
		const rows = [...(host?.querySelectorAll('button[type="button"]') ?? [])] as HTMLButtonElement[]
		const row = rows.find(r => r.textContent?.includes(label))
		if (!row) throw new Error(`linha do provedor ${label} não renderizada`)
		return row
	}

	function submitButton(): HTMLButtonElement {
		const button = host?.querySelector('button[type="submit"]') as HTMLButtonElement | null
		if (!button) throw new Error('botão de continuar não renderizado')
		return button
	}

	async function click(el: HTMLElement): Promise<void> {
		await act(async () => {
			el.click()
		})
		await act(async () => {
			await new Promise(resolve => setTimeout(resolve, 20))
		})
	}

	it('escolher um provedor NÃO entrega o passo — a pergunta ainda pode receber um segundo sim', async () => {
		mount()

		await click(rowFor('Claude Code'))

		expect(submitted).toEqual([])
	})

	it('dois provedores cabem na mesma resposta, e é o botão que a fecha', async () => {
		mount()

		await click(rowFor('Claude Code'))
		await click(rowFor('OpenCode'))
		await click(submitButton())

		expect(submitted).toHaveLength(1)
		expect([...(submitted[0]?.providers ?? [])].sort()).toEqual(['CLAUDE_CODE', 'OPENCODE'])
	})

	it('um provedor sem runner não entra na seleção nem entrega o passo', async () => {
		mount()

		const codex = rowFor('Codex')
		expect(codex.disabled).toBe(true)
		await click(codex)
		await click(rowFor('Claude Code'))
		await click(submitButton())

		expect(submitted).toHaveLength(1)
		expect(submitted[0]?.providers).toEqual(['CLAUDE_CODE'])
	})
})
