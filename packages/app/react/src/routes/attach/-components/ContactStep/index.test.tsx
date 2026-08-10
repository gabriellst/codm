import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/lib/i18n'
import { useIntegrationBackend, type IntegrationBackend } from '../../../../../tests/support/integration-harness'
import { ContactStep } from '.'

/**
 * REDUZIDO (T9, onda B) — o que sobrevive contra o backend REAL, sem `globalThis.fetch` manual.
 *
 * `ContactStep` é conectado (`useGetAttachThreadWizard`), então o round-trip real É a asserção
 * (SB-05). Mas `channels`/`remotes` são tabelas do gateway Go sem repositório no lado TS — os
 * `given*` que as semeariam (`givenChannel`/`givenRemote`) não são reexportados por
 * `@codm/api-typescript/testing` (tooling congelado nesta task). Sem canal seedável, a leitura real
 * sempre devolve `contacts: []` para qualquer owner — então este arquivo prova exatamente isso (o
 * round-trip real e o estado vazio computado), e o resto das asserções do `index.test.tsx` antigo
 * (busca chegando ao servidor, os dois rótulos de tipo, contato já anexado) viraram SÓ-VISUAIS em
 * `index.stories.tsx` — o caso que a ruling do founder pós-spike destina a MSW.
 *
 * Descartado (falseamento, não migrado): "não manda `search` vazio na primeira carga" — o servidor
 * trata `search: ''` e `search: undefined` de forma IDÊNTICA (`input.search?.trim()` é falsy nos
 * dois), então quebrar `trimmed || undefined` de volta para `trimmed` sozinho não muda nenhum
 * resultado observável — só o texto literal da URL, que este canon não inspeciona.
 */
describe('ContactStep — contra o backend real', () => {
	let backend: IntegrationBackend
	let root: Root | null = null
	let host: HTMLDivElement | null = null

	beforeAll(async () => {
		backend = await useIntegrationBackend()
	})

	afterAll(async () => {
		await backend.stop()
	})

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	})

	async function mount(): Promise<void> {
		host = document.createElement('div')
		document.body.appendChild(host)
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const element = host
		await act(async () => {
			root = createRoot(element)
			root.render(
				<QueryClientProvider client={queryClient}>
					<ContactStep channelKindById={new Map()} onSubmit={() => {}} />
				</QueryClientProvider>,
			)
		})
		// Espera POR CONDIÇÃO — o passo sai do spinner assim que a leitura real resolve.
		for (let attempt = 0; attempt < 100; attempt++) {
			if (!host.textContent?.includes(i18n.t('common.loading'))) return
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		throw new Error('ContactStep nunca saiu do carregando')
	}

	it('monta e lê o backend real — sem canal conectado, a lista vem vazia (computada, não mockada)', async () => {
		await mount()

		expect(host?.textContent).toContain(i18n.t('attach.noContacts'))
		expect(host?.querySelectorAll('button[type="button"]')).toHaveLength(0)
	})

	it('o rodapé sumiu por inteiro — nada de Continuar, e nem um Voltar que este passo não tem', async () => {
		await mount()

		expect(host?.querySelector('button[type="submit"]')).toBeNull()
		expect(host?.textContent).not.toContain(i18n.t('attach.continue'))
		expect(host?.querySelector('[data-slot="step-heading"] button')).toBeNull()
	})
})
