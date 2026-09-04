import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getOperatorIdentityQueryKey, type GetOperatorIdentityQueryResponse } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { mountRouter, type MountedRouter } from '../../../../tests/support/mountRouter'
import { useIntegrationBackend, type IntegrationBackend, INTEGRATION_BOOT_TIMEOUT_MS } from '../../../../tests/support/integration-harness'
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
	}, INTEGRATION_BOOT_TIMEOUT_MS)

	afterAll(async () => {
		await backend.stop()
	}, INTEGRATION_BOOT_TIMEOUT_MS)

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
	 * SEM SESSÃO, O CABEÇALHO DIZ "ANÔNIMO" — e não um nome de consolação.
	 *
	 * Este caso pedia `"Operator"` até 2026-08-15, porque `lib/auth.ts` era um STUB: uma sessão
	 * CONSTANTE de compile-time, herdada do mundo do `OPERATOR_ID`. O ADR 0001 aboliu esse mundo
	 * (identidade vem da nuvem), e trocar o stub pelo client real do better-auth tornou o antigo
	 * `"Operator"` o que ele sempre foi — um valor que ninguém tinha autenticado.
	 *
	 * Um nome constante é perfeitamente consistente consigo mesmo, que é por que nada acusava: toda
	 * asserção sobre "quem está logado" comparava a constante com ela mesma.
	 *
	 * FALSEADOR: devolva a sessão constante a `lib/auth.ts` e este teste fica vermelho — `"Anônimo"`
	 * some e o nome de consolação volta.
	 */
	it('sem sessão de nuvem, o cabeçalho cai no rótulo ANÔNIMO — nunca num nome constante', async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const { host } = await mount(queryClient)

		expect(host.textContent, 'sem ninguém logado, o console não pode afirmar um nome').toContain(i18n.t('common.anonymous'))
		expect(host.textContent, 'e o nome de consolação do stub não pode voltar').not.toContain('Operator')
	})

	/**
	 * A PROVA de que é o read do OPERADOR que preenche o cabeçalho, não o de sessão: só um round-trip
	 * real por `GetOperatorIdentity` deixa a query DESTA chave resolvida com `{}` (sem `identity`) —
	 * uma leitura na fonte errada nunca preencheria esta chave especificamente.
	 */
	it('pergunta ao read do operador — a query key de GetOperatorIdentity é quem resolve', async () => {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		await mount(queryClient)

		// O parâmetro de tipo NÃO é decoração: a query key gerada pelo Kubb é uma tupla CRUA (sem o
		// `DataTag` do TanStack), então `getQueryData` não tem de onde inferir o dado cacheado —
		// aninhado direto num `expect(...)` a inferência colapsa para `undefined` e nada casa. Dizer
		// qual é a resposta daquela chave (a MESMA que o hook da SDK cacheia) é o conserto honesto.
		expect(queryClient.getQueryData<GetOperatorIdentityQueryResponse>(getOperatorIdentityQueryKey())).toEqual({})
	})
})
