import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getOperatorIdentityQueryKey } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { mountRouter, type MountedRouter } from '../../../../tests/support/mountRouter'
import { useIntegrationBackend, type IntegrationBackend } from '../../../../tests/support/integration-harness'
import { UserProfile } from '.'

/**
 * REDUZIDO (T11, onda B) — comportamento contra o backend REAL, sem `globalThis.fetch` manual.
 *
 * `GetOperatorIdentity` lê `channels`/`remotes` — tabelas do gateway Go. Este arquivo sobe o backend
 * TS sozinho (sem `services`), então nenhum canal existe — o read real SEMPRE devolve `identity`
 * ausente por essa razão vazia. Este arquivo prova o EMPRÉSTIMO devolvido: a queda para a sessão
 * constante, e que é o read do OPERADOR (não da sessão) quem preenche o cache.
 *
 * ATUALIZADO (T9/T12): `channels` deixou de ser improduzível — `index.services.test.tsx`
 * (`services: ['apiGo']`) semeia um canal REAL, CONECTADO, via `givenConnectedGatewayChannel`, e prova
 * a MESMA queda por uma razão mais forte (canal presente, mas `remotes` ainda vazia — gap documentado
 * lá). O estado "identidade emprestada" (com `remotes` casando) continua SÓ-VISUAL em
 * `index.stories.tsx` — nenhum caminho hoje escreve `gateway_remotes` para um canal pareado pelo mock.
 */
describe('UserProfile — contra o backend real', () => {
	let backend: IntegrationBackend
	let mounted: MountedRouter | null = null

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
		mounted?.unmount()
		mounted = null
	})

	async function mount(queryClient: QueryClient): Promise<MountedRouter> {
		mounted = await mountRouter(
			<QueryClientProvider client={queryClient}>
				<UserProfile />
			</QueryClientProvider>,
		)
		await mounted.settled(() => queryClient.getQueryState(getOperatorIdentityQueryKey())?.status === 'success', 'a leitura real resolver')
		return mounted
	}

	/**
	 * FALSEADOR: volte a ler `session.user` no componente e este teste fica vermelho — o
	 * `"Operator"` some e as iniciais do fallback também.
	 */
	it('sem canal conectado no backend real, cai na sessão constante — nome e iniciais do fallback', async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const { host } = await mount(queryClient)

		expect(host.textContent).toContain('Operator')
		expect(host.textContent).toContain('OperatorO')
	})

	/**
	 * A PROVA de que é o read do OPERADOR que preenche o cabeçalho, não o de sessão: só um round-trip
	 * real por `GetOperatorIdentity` deixa a query DESTA chave resolvida com `{}` (sem `identity`) —
	 * uma leitura na fonte errada nunca preencheria esta chave especificamente.
	 */
	it('pergunta ao read do operador — a query key de GetOperatorIdentity é quem resolve', async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		await mount(queryClient)

		expect(queryClient.getQueryData(getOperatorIdentityQueryKey())).toEqual({})
	})
})
