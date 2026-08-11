import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getAttachThreadWizard } from '@codm/client-typescript/typescript'
import { givenConnectedGatewayChannel } from '@codm/api-typescript/testing'
import i18n from '@/lib/i18n'
import { useIntegrationBackend, type IntegrationBackend } from '../../../../../tests/support/integration-harness'
import { ContactStep } from '.'

/**
 * T9 (AC-7, item 1) — ContactStep contra o GATEWAY SUBPROCESS real (`services: ['apiGo']`), não mais
 * o backend TS sozinho (esse continua em `index.test.tsx`).
 *
 * O QUE ESTE ARQUIVO PROVA, E O QUE NÃO — leia antes de estender:
 *
 * O plano (T9) assumia que o roteiro do mock (`defaultE2eScenario`, `Contacts: [Ada, Alan]`)
 * chegaria a `gateway_remotes` "pelo sync real", e que `ContactStep` renderizaria esses dois contatos.
 * MEDIDO, não assumido: não chega. `MockChannel.StreamContactSnapshot` (services/gateway/mock/channel.go)
 * serve `scenario.Contacts` verbatim, mas NADA no lado do evento a chama — os únicos handlers que
 * escutam `channel.gateway_connected` (`SyncStartedHandler`/`SyncProgressHandler`/`SyncCompletedHandler`,
 * internal/channel/handlers/channel_sync_handler.go) só emitem eventos de progresso de UI, nenhum lê
 * `StreamContactSnapshot` ou escreve `gateway_remotes`. Essa escrita hoje só acontece em
 * `WhatsmeowChannel.projectContactSnapshot` (services/gateway/whatsapp/whatsmeow_channel.go),
 * exclusiva do adaptador real — o `MockChannel` não tem equivalente. `StreamContactSnapshot` só é
 * exercitado por um teste unitário direto (`mock/channel_test.go`), nunca pelo caminho de produção.
 * Consertar isso é mudança de PRODUÇÃO no Go (fora da lista de arquivos desta task — ver relato T9).
 *
 * Dado isso, o que É real e falseável aqui: o CANAL pareia de verdade, pelo pipeline de produção do
 * gateway (Connect → runPairingClock → mapper.MapEvent(*events.Connected{}) → outbox → handler →
 * projeção CONNECTED — o MESMO caminho que `cross-service.spike.test.ts` já provou do lado TS). A
 * asserção de diagnóstico abaixo (`wizard.noChannelConnected`/`wizard.channels`) muda de valor
 * conforme esse pipeline real roda ou não — É o falseador. A asserção de produto (`ContactStep`
 * renderiza vazio) permanece constante com ou sem conexão — não é, sozinha, uma prova de pipeline; por
 * isso ela nunca aparece desacompanhada da de diagnóstico.
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
 * FALSEADO (T9): comentando a chamada a `givenConnectedGatewayChannel` — sem canal, `channelId` nunca
 * é atribuído e o poll por `!wizard.noChannelConnected` nunca satisfaz → RED. Restaurado → GREEN.
 * Números no relato da Task T9.
 */

describe('ContactStep — services: apiGo (T9) — contra o gateway subprocess real', () => {
	let backend: IntegrationBackend
	let root: Root | null = null
	let host: HTMLDivElement | null = null

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
		for (let attempt = 0; attempt < 100; attempt++) {
			if (!host.textContent?.includes(i18n.t('common.loading'))) return
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		throw new Error('ContactStep nunca saiu do carregando')
	}

	it('o canal pareia de verdade pelo mock do gateway — mas os contatos continuam vazios (StreamContactSnapshot não é consumido)', async () => {
		const { channelId } = await givenConnectedGatewayChannel(backend, { name: 'contact-step-services-test-channel' })

		// O FALSEADOR: esta leitura muda de CONNECTED→ausente se o pipeline real quebrar (ver docblock).
		const wizard = await getAttachThreadWizard()
		expect(wizard.noChannelConnected).toBe(false)
		expect(wizard.channels.map(c => c.channelId)).toContain(channelId)

		// O gap documentado, provado (não assumido): remotes nunca chega a existir para este canal.
		expect(wizard.contacts).toHaveLength(0)

		await mount()
		expect(host?.textContent).toContain(i18n.t('attach.noContacts'))
		expect(host?.querySelectorAll('button[type="button"]')).toHaveLength(0)
	})
})
