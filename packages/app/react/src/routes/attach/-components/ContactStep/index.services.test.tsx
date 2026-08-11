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
 * T9 (AC-7, item 1) / T13 — ContactStep contra o GATEWAY SUBPROCESS real (`services: ['apiGo']`), não
 * mais o backend TS sozinho (esse continua em `index.test.tsx`).
 *
 * O QUE ESTE ARQUIVO PROVA, E O QUE NÃO — leia antes de estender:
 *
 * GAP FECHADO (T13, era aberto em T9): o plano assumia que o roteiro do mock (`defaultE2eScenario`,
 * `Contacts: [Ada, Alan]`) chegaria a `gateway_remotes` "pelo sync real", e que `ContactStep`
 * renderizaria esses dois contatos. Em T9 isso era medido como FALSO: `MockChannel.StreamContactSnapshot`
 * servia `scenario.Contacts` verbatim, mas nada no lado do evento a chamava. T13 fechou os dois lados:
 * (1) `mock/channel.go`'s `runPairingClock` agora emite `*events.AppStateSyncComplete{Name:
 * appstate.WAPatchRegular}` pelo MESMO `mapper.MapEvent`, logo após `*events.Connected{}`; (2) o mapper
 * já traduzia isso (sem mudança) para `channel.gateway.sync_complete`
 * (`mapper/app_state_sync.go`); (3) `RemoteSnapshotProjector`
 * (`projections/projectors/remote_snapshot_projector.go`) é um assinante NOVO desse evento — resolve o
 * canal vivo no `pool.ChannelPool`, consome `StreamContactSnapshot` e grava `gateway_remotes` pelas
 * MESMAS operações atômicas que o antigo `WhatsmeowChannel.projectContactSnapshot` usava (agora deletado
 * do adaptador — a contact-snapshot projection não mora mais lá). O caminho de produção agora exercita
 * `StreamContactSnapshot`, não só o teste unitário direto (`mock/channel_test.go`).
 *
 * O que ISSO prova aqui: o CANAL pareia de verdade, pelo pipeline de produção do gateway (Connect →
 * runPairingClock → mapper.MapEvent(*events.Connected{}) → outbox → handler → projeção CONNECTED — o
 * MESMO caminho que `cross-service.spike.test.ts` já provou do lado TS) E os dois contatos roteirizados
 * chegam a `gateway_remotes` PELO PIPELINE REAL (sync-complete → outbox → RemoteSnapshotProjector), não
 * por um insert direto de teste. A asserção de diagnóstico abaixo (`wizard.noChannelConnected`/
 * `wizard.channels`) prova o pareamento; a asserção de `wizard.contacts` — agora com os dois nomes reais
 * — prova a projeção. Nenhuma das duas é assumida: ambas fazem poll com deadline porque o outbox é
 * assíncrono em relação ao HTTP de connect (ver o `NotifyStrategy` do dispatcher — latência de ms, não
 * um valor síncrono no request/response).
 *
 * O CANAL É SEMEADO PELO CATÁLOGO, NÃO POR ESCOLHA LOCAL (founder correction, T9/T12): criar+conectar
 * um canal real contra o gateway subprocess é choreography repetida em TODOS os 4 arquivos
 * `.services.test.tsx` — então virou um GIVEN congelado, `givenConnectedGatewayChannel(backend,
 * overrides?)` (`@codm/api-typescript/testing`), em vez de uma implementação local por arquivo. Ele
 * resolve a URL do gateway do próprio `backend.services.apiGo`, dirige create+connect pela SDK, e
 * faz deadline-poll até CONNECTED — devolvendo só quando o pipeline real (Connect → runPairingClock →
 * mapper.MapEvent(*events.Connected{}) → outbox → handler → projeção CONNECTED) já rodou de verdade.
 * Este given NÃO espera os frames posteriores do roteiro (contatos) — por isso este arquivo faz seu
 * PRÓPRIO poll por `wizard.contacts` depois, exatamente como o docblock do given instrui.
 *
 * FALSEADO (T9, ainda válido): comentando a chamada a `givenConnectedGatewayChannel` — sem canal,
 * `channelId` nunca é atribuído e o poll por `!wizard.noChannelConnected` nunca satisfaz → RED.
 * Restaurado → GREEN. FALSEADO (T13, novo): quebrando o `Handle` de `RemoteSnapshotProjector` (early
 * return) — o poll por `wizard.contacts.length >= 2` estoura o deadline e falha → RED. Restaurado →
 * GREEN. Números no relato da Task T13 (T9 original no relato da Task T9).
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

	// ms budget for the wizard.contacts poll below — the projector's write is outbox-async relative to
	// the HTTP connect call `givenConnectedGatewayChannel` awaits, so a fixed sleep would be a race.
	const CONTACTS_DEADLINE_MS = 5_000

	// Timeout explícito: um seed via givenConnectedGatewayChannel (AutoPairAfter 2s do cenário e2e) +
	// poll próprio por wizard.contacts — T10 deixou o default de 5000ms do bun:test com margem
	// apertada (observado ~4.5-4.6s). 15s dá folga real sem mascarar uma regressão de verdade.
	it('o canal pareia de verdade pelo mock do gateway, e os dois contatos roteirizados chegam pelo pipeline real (T13)', async () => {
		const { channelId } = await givenConnectedGatewayChannel(backend, { name: 'contact-step-services-test-channel' })

		// O FALSEADOR (pareamento, T9): esta leitura muda de CONNECTED→ausente se o pipeline de conexão quebrar.
		let wizard = await getAttachThreadWizard()
		expect(wizard.noChannelConnected).toBe(false)
		expect(wizard.channels.map(c => c.channelId)).toContain(channelId)

		// O FALSEADOR (projeção, T13): o given acima resolve só até CONNECTED — não espera o frame de
		// sync-complete (ver seu próprio docblock). Os contatos chegam depois, assincronamente, pelo
		// outbox → RemoteSnapshotProjector. Poll com deadline, nunca um sleep fixo.
		const started = performance.now()
		while (wizard.contacts.length < 2) {
			if (performance.now() - started > CONTACTS_DEADLINE_MS) {
				throw new Error(`wizard.contacts nunca chegou a 2 linhas dentro de ${CONTACTS_DEADLINE_MS}ms (último: ${wizard.contacts.length})`)
			}
			await new Promise(resolve => setTimeout(resolve, 25))
			wizard = await getAttachThreadWizard()
		}

		// Os dois contatos do roteiro (overlay.go's defaultE2eScenario), casados por externalId — nunca
		// por posição, já que a ordenação do use case (lastMessageAt DESC, sem mensagens aqui) cai no
		// tie-break por remoteId, um detalhe de implementação que esta asserção não deveria travar.
		const byExternalId = new Map(wizard.contacts.map(c => [c.externalId, c]))
		const ada = byExternalId.get('5511999990001@s.whatsapp.net')
		const alan = byExternalId.get('5511999990002@s.whatsapp.net')
		expect(ada?.displayName).toBe('Ada Lovelace')
		expect(ada?.channelId).toBe(channelId)
		expect(alan?.displayName).toBe('Alan Turing')
		expect(alan?.channelId).toBe(channelId)

		await mount()
		expect(host?.textContent).not.toContain(i18n.t('attach.noContacts'))
		expect(host?.textContent).toContain('Ada Lovelace')
		expect(host?.textContent).toContain('Alan Turing')
		expect(host?.querySelectorAll('button[type="button"]')).toHaveLength(2)
	}, 15_000)
})
