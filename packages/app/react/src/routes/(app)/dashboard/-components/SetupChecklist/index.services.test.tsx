import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { givenConnectedGatewayChannel } from '@codm/api-typescript/testing'
import i18n from '@/lib/i18n'
import { mountRouter, type MountedRouter } from '../../../../../../tests/support/mountRouter'
import {
	useIntegrationBackend,
	type IntegrationBackend,
	INTEGRATION_BOOT_TIMEOUT_MS,
	RUNNING_CROSS_SERVICE_LANE,
} from '../../../../../../tests/support/integration-harness'
import { SetupChecklist } from '.'

/**
 * T9 (AC-7, item 3a) — `channelDone` REAL, contra o GATEWAY SUBPROCESS (`services: ['apiGo']`).
 *
 * `index.test.tsx` (sem `services`) já prova `workspaceDone`/`threadDone` reais — `channelDone` ficava
 * de fora porque, à época (T9), `channels`/`remotes` eram tabelas gateway-owned sem produtor no
 * harness (`remotes` ganhou um em T13 — `RemoteSnapshotProjector`, ver `ContactStep/index.services.test.tsx`
 * — mas isso não muda nada aqui, ver a seguir). Este arquivo fecha exatamente esse buraco para
 * `channelDone`: um canal pareia de verdade pelo `MockChannel` do gateway (Connect → runPairingClock →
 * mapper.MapEvent(*events.Connected{}) → outbox → handler → projeção CONNECTED — `gateway_channels.status`),
 * `GetOnboarding` (ui/usecases/GetOnboarding.ts) lê essa MESMA coluna (`channels.status = CONNECTED`,
 * sem depender de `remotes` — ao contrário de `ContactStep`/`UserProfile`, cujo gap está documentado
 * nos irmãos deste arquivo), e o checklist reage.
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
 * FALSEADO (T9): comentando a chamada a `givenConnectedGatewayChannel` — sem canal, a linha
 * (`home.setupChannelTitle`) permanece presente em vez de sumir → RED. Restaurado → GREEN. Números no
 * relato da Task T9.
 *
 * 2026-08-26 — REESCRITO: `CHANNEL` virou `REQUIRED` no `STEP_TAXONOMY` do wizard (founder override
 * do bug "Próximo avança sem conectar canal") — `DEFERRABLE_SETUP_IDS` (`index.tsx`) deriva dessa
 * mesma tabela, e `CHANNEL` saiu da lista. A linha do canal agora NUNCA aparece neste painel,
 * conectado ou não — o teste original ("a linha do canal fica marcada concluída") não tem mais como
 * ser verdade porque a linha deixou de existir. O caso abaixo prova exatamente isso: um canal
 * conectado DE VERDADE contra o gateway subprocess real não faz a linha aparecer nem some nada —
 * ela já não estava lá.
 */

/**
 * SO NA LANE CROSS-SERVICE. Esta suite faz `go build` + spawn de subprocesso e boota o backend COM
 * `services`, e a lei de um-backend-por-processo a torna incompativel com a suite padrao. O
 * `pathIgnorePatterns` do `bunfig.toml` existia para isso e e INERTE (medido: bun 1.3.4 no Windows,
 * nenhum padrao exclui nada) — ver o docblock de `RUNNING_CROSS_SERVICE_LANE`. A guarda declarada
 * vale igual nos dois SOs; `scripts/test-cross-service.ts` e quem liga a flag, um processo por arquivo.
 */
describe.skipIf(!RUNNING_CROSS_SERVICE_LANE)('SetupChecklist — services: apiGo (T9) — channelDone contra o gateway subprocess real', () => {
	let backend: IntegrationBackend
	let mounted: MountedRouter | null = null

	beforeAll(async () => {
		backend = await useIntegrationBackend({ services: ['apiGo'], identity: 'double' })
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

	async function mount(): Promise<MountedRouter> {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		mounted = await mountRouter(
			<QueryClientProvider client={queryClient}>
				<SetupChecklist />
			</QueryClientProvider>,
			{ extraPaths: ['/dashboard', '/onboarding', '/channels', '/workspaces', '/attach'] },
		)
		await mounted.settled(() => mounted?.host.querySelector('[data-slot="skeleton"]') === null, 'o skeleton sair')
		return mounted
	}

	// Timeout explícito: um seed via givenConnectedGatewayChannel (AutoPairAfter 2s do cenário e2e) —
	// T10 deixou o default de 5000ms do bun:test com margem apertada (observado ~4.3-4.5s). 15s dá
	// folga real sem mascarar uma regressão de verdade.
	it('canal pareado de verdade (mock do gateway): CHANNEL não é mais candidato deste painel — nenhuma linha de canal aparece', async () => {
		await givenConnectedGatewayChannel(backend, { name: 'setup-checklist-services-test-channel' })

		await mount()

		// `CHANNEL` saiu de `DEFERRABLE_SETUP_IDS` (2026-08-26, docblock acima) — a linha não existe
		// mais, conectado ou não. `WORKSPACE` (o único candidato que sobrou) segue pendente.
		expect(mounted?.host.textContent).not.toContain(i18n.t('home.setupChannelTitle'))
		const rows = [...(mounted?.host.querySelectorAll('[data-slot="setup-step"]') ?? [])] as HTMLElement[]
		const rowFor = (key: string) => rows.find(r => r.textContent?.includes(i18n.t(key)))
		expect(rowFor('home.setupWorkspaceTitle')?.dataset.done).toBe('false')
	}, 15_000)
})
