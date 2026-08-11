import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getOnboarding, getOperatorIdentityQueryKey } from '@codm/client-typescript/typescript'
import { givenConnectedGatewayChannel } from '@codm/api-typescript/testing'
import i18n from '@/lib/i18n'
import { mountRouter, type MountedRouter } from '../../../../tests/support/mountRouter'
import { useIntegrationBackend, type IntegrationBackend } from '../../../../tests/support/integration-harness'
import { UserProfile } from '.'

/**
 * T9 (AC-7, item 3b) — UserProfile contra o GATEWAY SUBPROCESS real (`services: ['apiGo']`), com um
 * canal REALMENTE pareado (`channelDone`), companheiro de `SetupChecklist/index.services.test.tsx`.
 *
 * O QUE ESTE ARQUIVO PROVA, E O QUE NÃO — leia antes de estender:
 *
 * `UserProfile` lê `GetOperatorIdentity` (ui/usecases/GetOperatorIdentity.ts), que exige DUAS coisas —
 * não uma: (1) um canal CONNECTED com `owner_remote_id != ''` (satisfeito pelo pareamento real do mock
 * — MESMO pipeline provado em `SetupChecklist`), e (2) uma linha em `gateway_remotes` cuja chave
 * exata é `(channel_id, remote_id) = (channel.id, channel.owner_remote_id)`. A condição (2) NUNCA se
 * satisfaz aqui pelo MESMO gap documentado em `ContactStep/index.services.test.tsx`:
 * `MockChannel.StreamContactSnapshot` não é consumido por nenhum handler do pipeline de pareamento —
 * `gateway_remotes` fica vazia para qualquer canal que o mock pareia. Então `identity` continua
 * ausente mesmo com um canal REALMENTE conectado — o "empréstimo" (ver docblock de `UserProfile`)
 * nunca chega a acontecer neste harness hoje.
 *
 * O que muda em relação ao `index.test.tsx` (sem `services`): aquele arquivo prova a queda para a
 * sessão constante com NENHUM canal no sistema — um caso quase vazio por construção. Este arquivo
 * prova a MESMA queda com um canal REAL, CONECTADO, presente (`channelDone` real, verificado por
 * diagnóstico abaixo) — uma asserção mais forte: `GetOperatorIdentity` exige o par completo
 * (canal + remotes casando), não só "existe algum canal".
 *
 * O CANAL É SEMEADO PELO CATÁLOGO, NÃO POR ESCOLHA LOCAL (founder correction, T9/T12): criar+conectar
 * um canal real contra o gateway subprocess é choreography repetida em TODOS os 4 arquivos
 * `.services.test.tsx` — então virou um GIVEN congelado, `givenConnectedGatewayChannel(backend,
 * overrides?)` (`@codm/api-typescript/testing`), em vez de uma implementação local por arquivo. Ele
 * resolve a URL do gateway do próprio `backend.services.apiGo`, dirige create+connect pela SDK, e
 * faz deadline-poll até CONNECTED — devolvendo só quando o pipeline real (Connect → runPairingClock →
 * mapper.MapEvent(*events.Connected{}) → outbox → handler → projeção CONNECTED) já rodou de verdade.
 * Este arquivo não conhece transporte, header de owner, nem a URL do subprocesso — só o resultado.
 *
 * FALSEADO (T9): comentando a chamada a `givenConnectedGatewayChannel` — sem canal, o diagnóstico
 * (`getOnboarding().channelDone`) nunca vira `true` → RED. Restaurado → GREEN. A asserção de produto
 * (cai na sessão constante) não muda de valor com ou sem o canal — por isso nunca aparece
 * desacompanhada do diagnóstico, exatamente como em `ContactStep`. Números no relato da Task T9.
 */

describe('UserProfile — services: apiGo (T9) — com um canal real, realmente conectado', () => {
	let backend: IntegrationBackend
	let mounted: MountedRouter | null = null

	beforeAll(async () => {
		backend = await useIntegrationBackend({ services: ['apiGo'] })
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

	it('canal real conectado (channelDone=true) mas sem remotes casando: continua caindo na sessão constante', async () => {
		await givenConnectedGatewayChannel(backend, { name: 'user-profile-services-test-channel' })

		// O FALSEADOR: este diagnóstico muda de valor conforme o pareamento real acontece ou não.
		const onboarding = await getOnboarding()
		expect(onboarding.channelDone).toBe(true)

		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const { host } = await mount(queryClient)

		// O gap documentado (gateway_remotes vazia), provado com um canal real presente — não vacuamente.
		expect(queryClient.getQueryData(getOperatorIdentityQueryKey())).toEqual({})
		expect(host.textContent).toContain('Operator')
		expect(host.textContent).toContain('OperatorO')
	})
})
