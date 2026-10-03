import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getAttachThreadWizardQueryKey, getAttachThreadWizardQueryOptions } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { enumLabel } from '@/lib'
import {
	useIntegrationBackend,
	type IntegrationBackend,
	INTEGRATION_BOOT_TIMEOUT_MS,
} from '../../../../../../tests/support/integration-harness'
import { ProvidersSection } from '.'

/**
 * REDUZIDO (T9, onda B) — comportamento contra o backend REAL, sem `globalThis.fetch` manual.
 *
 * Nenhum given é necessário aqui: sob `integration`, `ProviderDetector` é o `MockProviderDetector`
 * (catálogo determinístico — CLAUDE_CODE DETECTED, o resto NOT_INSTALLED) e `AgentRunnerFactory` é o
 * `StubAgentRunnerFactory` (`supported = [CLAUDE_CODE]`) — a mesma combinação que produz o
 * `comingSoon` de CODEX/OPENCODE sem depender de canal/remote nenhum. O round-trip real É a
 * asserção (SB-05).
 *
 * Descartado (falseamento, não migrado): "o clique pede `refresh=true`; a carga inicial não" —
 * `MockProviderDetector.detect()` IGNORA o parâmetro `refresh` por completo (retorna sempre o mesmo
 * catálogo fixo), então quebrar `{ refresh: true }` de volta para `{}` no `rescan()` não muda NENHUM
 * resultado computável por este harness — só o texto literal da URL, que este canon não inspeciona.
 * O que sobra observável (e migrou abaixo) é o EFEITO real do clique: o botão desabilita enquanto a
 * chamada está no ar, e o catálogo do wizard de anexar é invalidado ao final.
 */
describe('ProvidersSection — contra o backend real', () => {
	let backend: IntegrationBackend
	let root: Root | null = null
	let host: HTMLDivElement | null = null
	let queryClient: QueryClient | null = null

	beforeAll(async () => {
		backend = await useIntegrationBackend()
	}, INTEGRATION_BOOT_TIMEOUT_MS)

	afterAll(async () => {
		await backend.stop()
	}, INTEGRATION_BOOT_TIMEOUT_MS)

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
		queryClient = null
	})

	async function mount(): Promise<void> {
		host = document.createElement('div')
		document.body.appendChild(host)
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const element = host
		const client = queryClient
		await act(async () => {
			root = createRoot(element)
			root.render(
				<QueryClientProvider client={client}>
					<ProvidersSection />
				</QueryClientProvider>,
			)
		})
		await settled(() => host?.querySelector('[data-slot="skeleton"]') === null, 'o skeleton sair')
	}

	/** Espera POR CONDIÇÃO, nunca sleep fixo. */
	async function settled(predicate: () => boolean, label = 'condição'): Promise<void> {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (predicate()) return
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		throw new Error(`ProvidersSection: ${label} nunca aconteceu`)
	}

	function rescanButton(): HTMLButtonElement {
		const buttons = [...(host?.querySelectorAll('button') ?? [])] as HTMLButtonElement[]
		const button = buttons.find(b => b.textContent?.includes(i18n.t('settings.rescanProviders')))
		if (!button) throw new Error('botão Reescanear não renderizado')
		return button
	}

	it('lê o catálogo determinístico real — CLAUDE_CODE dirigível, CODEX/OPENCODE "Em breve"', async () => {
		await mount()

		const text = host?.textContent ?? ''
		expect(text).toContain('Claude Code')
		expect(text).toContain(enumLabel('ProviderStatus', 'DETECTED'))
		expect(text).toContain('Codex')
		expect(text).toContain('OpenCode')
		// "Em breve" GANHA do rótulo de status para os dois sem runner — o eixo do binário some da tela.
		const comingSoonCount = (text.match(new RegExp(i18n.t('common.comingSoon'), 'g')) ?? []).length
		expect(comingSoonCount).toBe(2)
		expect(text).not.toContain(enumLabel('ProviderStatus', 'NOT_INSTALLED'))
	})

	it('mostra estado de carregando enquanto a chamada real está no ar', async () => {
		await mount()

		act(() => rescanButton().click())
		// Logo após o clique — antes do round-trip real (tens de ms) resolver — o botão já está preso.
		expect(rescanButton().disabled).toBe(true)

		await settled(() => !rescanButton().disabled, 'o botão reabilitar')
	})

	it('ao concluir, invalida o catálogo do wizard de anexar — senão ele segue com a lista velha', async () => {
		await mount()
		const client = queryClient!
		// Semeia o cache do wizard ANTES do rescan, como se o operador já tivesse passado por lá.
		await client.fetchQuery(getAttachThreadWizardQueryOptions())
		const key = getAttachThreadWizardQueryKey()
		expect(client.getQueryState(key)?.isInvalidated).not.toBe(true)

		await act(async () => {
			rescanButton().click()
		})
		await settled(() => !rescanButton().disabled, 'o botão reabilitar')

		expect(client.getQueryState(key)?.isInvalidated).toBe(true)
	})
})
