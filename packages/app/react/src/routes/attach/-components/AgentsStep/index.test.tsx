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
