import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getOnboarding, getOperatorIdentityQueryKey, type GetOperatorIdentityQueryResponse } from '@codm/client-typescript/typescript'
import { givenConnectedGatewayChannel } from '@codm/api-typescript/testing'
import i18n from '@/lib/i18n'
import { mountRouter, type MountedRouter } from '../../../../tests/support/mountRouter'
import { useIntegrationBackend, type IntegrationBackend } from '../../../../tests/support/integration-harness'
import { UserProfile } from '.'

/**
 * T9 (AC-7, item 3b) / T13 — UserProfile contra o GATEWAY SUBPROCESS real (`services: ['apiGo']`), com
 * um canal REALMENTE pareado (`channelDone`), companheiro de `SetupChecklist/index.services.test.tsx`.
 *
 * O QUE ESTE ARQUIVO PROVA, E O QUE NÃO — leia antes de estender:
 *
 * `UserProfile` lê `GetOperatorIdentity` (ui/usecases/GetOperatorIdentity.ts), que exige DUAS coisas —
 * não uma: (1) um canal CONNECTED com `owner_remote_id != ''` (satisfeito pelo pareamento real do mock
 * — MESMO pipeline provado em `SetupChecklist`), e (2) uma linha em `gateway_remotes` cuja chave
 * exata é `(channel_id, remote_id) = (channel.id, channel.owner_remote_id)` — o PRÓPRIO cartão de
 * contato do operador, não um contato qualquer.
 *
 * O GAP MUDOU DE NATUREZA EM T13, O RESULTADO NÃO. Em T9, a condição (2) nunca se satisfazia porque
 * NADA escrevia em `gateway_remotes` pelo pipeline do mock — o gap era de PIPELINE (ver o antigo
 * docblock de `ContactStep/index.services.test.tsx`, ou o histórico deste arquivo). T13 fechou esse
 * gap: `RemoteSnapshotProjector` agora projeta `scenario.Contacts` de verdade (prova em
 * `ContactStep/index.services.test.tsx`, fortalecida na mesma task). Mas `defaultE2eScenario()`
 * (overlay.go) semeia Ada Lovelace/Alan Turing — DUAS OUTRAS PESSOAS, nunca um contato cujo
 * `remote_id` seja o `mock-<ownerId>@s.whatsapp.net` que `MockChannel.GetOwnerRemoteID()` deriva para
 * este owner (`services/gateway/mock/channel.go`'s `NewMockChannel`). A condição (2) continua vazia —
 * agora porque o roteiro nunca inclui o PRÓPRIO operador como contato dele mesmo, não porque a escrita
 * não acontece. Julgamento (T13): a asserção abaixo permanece correta e não muda — só a docblock, para
 * não deixar a razão desatualizada depois que T13 mudou o pipeline por baixo dela. Fechar ESTE gap
 * exigiria o roteiro semear um contato auto-referente, fora do escopo desta task (o mock não tem hoje
 * um jeito declarado de "eu mesmo" em `Scenario.Contacts` — cresce sob demanda de teste concreto,
 * mesma política do resto do `mock` package).
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
		backend = await useIntegrationBackend({ services: ['apiGo'], identity: 'double' })
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

	// Timeout explícito: um seed via givenConnectedGatewayChannel (AutoPairAfter 2s do cenário e2e) —
	// T10 deixou o default de 5000ms do bun:test com margem apertada (observado ~4.6-4.9s). 15s dá
	// folga real sem mascarar uma regressão de verdade.
	it('canal real conectado (channelDone=true) mas sem o remote do PRÓPRIO operador: continua caindo na sessão constante', async () => {
		await givenConnectedGatewayChannel(backend, { name: 'user-profile-services-test-channel' })

		// O FALSEADOR: este diagnóstico muda de valor conforme o pareamento real acontece ou não.
		const onboarding = await getOnboarding()
		expect(onboarding.channelDone).toBe(true)

		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const { host } = await mount(queryClient)

		// O gap documentado (nenhuma linha em gateway_remotes bate a chave own-remote — não que a tabela
		// esteja vazia; T13 a preenche com Ada/Alan, mas nenhum dos dois É o operador), provado com um
		// canal real presente — não vacuamente. Não há race aqui: diferente de `wizard.contacts`
		// (`ContactStep`), esta ausência é estrutural ao roteiro (ver docblock), não uma escrita
		// assíncrona ainda em trânsito — então não há nada a fazer poll.
		// O parâmetro de tipo espelha o gêmeo sem `services` (`index.test.tsx`): a query key do Kubb é
		// uma tupla crua, sem `DataTag`, então `getQueryData` só sabe o que há na chave se lhe
		// dissermos — e o que há é a resposta de `GetOperatorIdentity`.
		expect(queryClient.getQueryData<GetOperatorIdentityQueryResponse>(getOperatorIdentityQueryKey())).toEqual({})
		// ── A QUEDA NÃO É MAIS PARA "Operator" — o ADR 0001 matou a sessão constante (F7) ──────────
		//
		// Estas duas linhas assertavam `toContain('Operator')`: o nome que o `OperatorMiddleware`
		// carimbava quando o daemon tinha identidade PRÓPRIA e constante. Esse middleware não existe
		// mais — a identidade vem da nuvem, e sem ela `UserProfile` cai em `t('common.anonymous')`
		// (`index.tsx:49`: `identity?.displayName || session?.user.name || anônimo`).
		//
		// O gêmeo SEM `services` (`index.test.tsx:73-74`) já dizia isto, e nas mesmas palavras: *"sem
		// ninguém logado, o console não pode afirmar um nome"* e *"o nome de consolação do stub não
		// pode voltar"*. Este arquivo ficou para trás porque NUNCA CHEGAVA AQUI — morria antes, na
		// infraestrutura, e uma asserção que não roda não envelhece: ela só espera.
		//
		// A asserção segue sendo a mesma AFIRMAÇÃO — `GetOperatorIdentity` exige o par completo
		// (canal + o remote do próprio operador) e cai quando falta a metade (2) —, provada agora com
		// um canal REAL conectado. Só o nome do estado de queda mudou, porque o produto mudou.
		expect(host.textContent, 'sem identidade de nuvem, o console não afirma um nome').toContain(i18n.t('common.anonymous'))
		expect(host.textContent, 'e o nome de consolação do operador constante não pode voltar').not.toContain('Operator')
	}, 15_000)
})
