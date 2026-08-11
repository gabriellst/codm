import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { givenConnectedGatewayChannel } from '@codm/api-typescript/testing'
import i18n from '@/lib/i18n'
import { mountRouter, type MountedRouter } from '../../../../../../tests/support/mountRouter'
import { useIntegrationBackend, type IntegrationBackend } from '../../../../../../tests/support/integration-harness'
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
 */

describe('SetupChecklist — services: apiGo (T9) — channelDone contra o gateway subprocess real', () => {
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

	it('canal pareado de verdade (mock do gateway): a linha do canal some, workspace/thread ficam', async () => {
		await givenConnectedGatewayChannel(backend, { name: 'setup-checklist-services-test-channel' })

		await mount()

		expect(mounted?.host.textContent).not.toContain(i18n.t('home.setupChannelTitle'))
		expect(mounted?.host.textContent).toContain(i18n.t('home.setupWorkspaceTitle'))
		expect(mounted?.host.textContent).toContain(i18n.t('home.setupThreadTitle'))
	})
})
