import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import http from 'node:http'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { addWorkspace, attachThread, ContactKindEnum, ProviderKindEnum } from '@codm/client-typescript/typescript'
import type { Client, RequestConfig, ResponseConfig } from '@codm/client-typescript/typescript/_http'
import { givenConnectedGatewayChannel } from '@codm/api-typescript/testing'
import i18n from '@/lib/i18n'
import {
	useIntegrationBackend,
	type IntegrationBackend,
	INTEGRATION_BOOT_TIMEOUT_MS,
	RUNNING_CROSS_SERVICE_LANE,
} from '../../../../../../../tests/support/integration-harness'
import { SessionChatSection } from '.'

/**
 * T9 (AC-7, item 2) — SessionChatSection contra o GATEWAY SUBPROCESS real (`services: ['apiGo']`).
 *
 * O QUE ESTE ARQUIVO PROVA, E O QUE NÃO — leia antes de estender:
 *
 * O plano (T9) pedia "volume de transcript real via mensagens roteirizadas" (`Scenario.InboundMessages`
 * atravessando o ingest real). MEDIDO, não assumido: `defaultE2eScenario()` — a ÚNICA rota disponível
 * para `services: ['apiGo']`, fixa no boot (`internal/channel/overlay.go`, fora da lista de arquivos
 * desta task) — declara `QRFrames` + `AutoPairAfter` + `Contacts`, e ZERO `InboundMessages`. Sem
 * mensagens roteirizadas, não há volume de transcript real para provar por este caminho — reportado
 * como gap (relato da Task T9), não contornado.
 *
 * A CAMADA MAIS FORTE ALCANÇÁVEL: `AttachThread` (thread/usecases/AttachThread.ts) NÃO valida
 * `contactRef.externalId` contra `gateway_remotes` — a ÚNICA invariante de servidor que checa é
 * `ChannelConnectivity.isConnected(channelId)`, lida da MESMA `gateway_channels.status` que o
 * pareamento do mock escreve pelo pipeline real (idêntico ao que `ContactStep`'s
 * `index.services.test.tsx` já prova). Isso torna um `threadId` REAL — que só existe porque um canal
 * do gateway pareou de verdade — produzível pela primeira vez (antes desta task, `SessionChatSection`
 * era só-visual exatamente porque não havia produtor gateway-owned no harness). A seção monta contra
 * esse `threadId` real e lê `GetSessionChat` de verdade — transcript vazio, honestamente, não porque
 * o teste finge, mas porque não há como semear uma mensagem sem tocar Go (fora do escopo).
 *
 * O TESTE DE VOLUME COM 1000 MENSAGENS (`index.test.tsx`, `spyOn(fetch)`) fica INTOCADO — ele prova a
 * virtualização em si, um comportamento que este arquivo não tenta reproduzir (não há como sintetizar
 * 1000 linhas pelo pipeline real). As duas suítes são complementares, não sobrepostas.
 *
 * O CANAL É SEMEADO PELO CATÁLOGO, NÃO POR ESCOLHA LOCAL (founder correction, T9/T12): criar+conectar
 * um canal real contra o gateway subprocess é choreography repetida em TODOS os 4 arquivos
 * `.services.test.tsx` — então virou um GIVEN congelado, `givenConnectedGatewayChannel(backend,
 * overrides?)` (`@codm/api-typescript/testing`), em vez de uma implementação local por arquivo. Ele
 * resolve a URL do gateway do próprio `backend.services.apiGo`, dirige create+connect pela SDK, e faz
 * deadline-poll até CONNECTED — devolvendo `{ channelId, ownerId }` só quando o pipeline real (Connect
 * → runPairingClock → mapper.MapEvent(*events.Connected{}) → outbox → handler → projeção CONNECTED)
 * já rodou de verdade.
 *
 * WORKSPACE + ATTACH (TS-side) CONTINUAM COM UM `client` OVERRIDE LOCAL — founder correction (T9): o
 * catálogo (`givenConnectedGatewayChannel`) só cobre o canal; criar workspace e anexar thread são
 * operações de negócio deste teste, não choreography compartilhada, e a SDK gerada continua
 * obrigatória (CLAUDE.md, não-negociável #2) — `fetch` direto nunca é a saída. `ky` (o transporte por
 * trás de toda função gerada) sempre normaliza a chamada numa instância de `Request` e invoca
 * `fetch(request, extra)`; o patch `nodeHttpFetch` do harness (`integration-harness.ts`, congelado por
 * esta task) só lê method/headers/body de um SEGUNDO argumento `init` — nunca de `input` quando
 * `input` É o `Request` — então uma mutation da SDK em modo `services`, sem mais, degradaria
 * silenciosamente para um GET sem corpo e sem headers (`patchFetchForServices` troca `globalThis.fetch`
 * para o PROCESSO inteiro, não só para o `go`). A saída é a extensão OFICIAL que toda função gerada
 * aceita — `config: Partial<RequestConfig> & { client?: Client }`
 * (`packages/client/dist/typescript/src/typescript/client/*.ts`) — substituindo só o TRANSPORTE,
 * nunca a chamada. `rawNodeClient` (abaixo, o ÚNICO seam manual deste arquivo) fala `node:http` direto
 * contra o `RequestConfig` ESTRUTURADO que a função gerada já montou — method/url/data/headers chegam
 * como CAMPOS, nunca dentro de um `Request` opaco, então o bug do `ky` nunca se manifesta.
 *
 * FALSEADO (T9): comentando a chamada a `givenConnectedGatewayChannel` — sem canal conectado, o
 * `POST /threads` (attach) responde `CHANNEL_NOT_CONNECTED` (a invariante real de
 * `AttachThread.handle`) e a arrange lança → RED. Restaurado → GREEN. Números no relato da Task T9.
 */

/**
 * O SEAM ÚNICO deste arquivo (ver docblock acima): `Client` é o tipo que toda função gerada de
 * `@codm/client-typescript/typescript` aceita em `config.client` — substitui o transporte `ky` inteiro
 * por `node:http` falado direto contra o `RequestConfig` já montado (method/url/data/headers como
 * CAMPOS), contornando o gap do `nodeHttpFetch` do harness com um `Request` opaco do `ky`. Lança no
 * mesmo formato `{code, status}` que o cliente `ky` real lança, para o `catch`/asserção do chamador
 * continuar funcionando igual. Usado só para workspace/attach — o canal vem do catálogo.
 */
const rawNodeClient: Client = <TData, _TError = unknown, TVariables = unknown>(
	config: RequestConfig<TVariables>,
): Promise<ResponseConfig<TData>> => {
	const url = `${config.baseURL ?? ''}${config.url}`
	const body = config.data !== undefined ? JSON.stringify(config.data) : undefined
	const headers: Record<string, string> = { ...(config.headers as Record<string, string> | undefined) }
	if (body !== undefined) headers['Content-Type'] = 'application/json'
	return new Promise((resolve, reject) => {
		const req = http.request(url, { method: config.method, headers }, res => {
			const chunks: Buffer[] = []
			res.on('data', (chunk: Buffer) => chunks.push(chunk))
			res.on('end', () => {
				const raw = Buffer.concat(chunks).toString('utf-8')
				const status = res.statusCode ?? 0
				const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : undefined
				if (status >= 200 && status < 300) {
					resolve({ data: parsed as TData, status, statusText: res.statusMessage ?? '' })
					return
				}
				const message = (parsed?.message as string) || (parsed?.error as string) || res.statusMessage || `HTTP ${status}`
				const error = new Error(message) as Error & { code?: string; status?: number }
				error.code = (parsed?.code as string) ?? 'UNKNOWN_ERROR'
				error.status = status
				reject(error)
			})
		})
		req.on('error', reject)
		if (body !== undefined) req.write(body)
		req.end()
	})
}

/**
 * SO NA LANE CROSS-SERVICE. Esta suite faz `go build` + spawn de subprocesso e boota o backend COM
 * `services`, e a lei de um-backend-por-processo a torna incompativel com a suite padrao. O
 * `pathIgnorePatterns` do `bunfig.toml` existia para isso e e INERTE (medido: bun 1.3.4 no Windows,
 * nenhum padrao exclui nada) — ver o docblock de `RUNNING_CROSS_SERVICE_LANE`. A guarda declarada
 * vale igual nos dois SOs; `scripts/test-cross-service.ts` e quem liga a flag, um processo por arquivo.
 */
describe.skipIf(!RUNNING_CROSS_SERVICE_LANE)(
	'SessionChatSection — services: apiGo (T9) — contra um thread real, nascido de um canal real',
	() => {
		let backend: IntegrationBackend
		let root: Root | null = null
		let host: HTMLDivElement | null = null

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
			act(() => root?.unmount())
			root = null
			host?.remove()
			host = null
		})

		async function mount(threadId: string): Promise<HTMLDivElement> {
			host = document.createElement('div')
			document.body.appendChild(host)
			const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
			const element = host
			await act(async () => {
				root = createRoot(element)
				root.render(
					<QueryClientProvider client={queryClient}>
						<SessionChatSection threadId={threadId} />
					</QueryClientProvider>,
				)
			})
			// PRAZO DE PARADE DE RELOGIO, e nao contagem de tentativas. A versao anterior girava 200 vezes
			// com um `setTimeout(10)` dentro — o que NAO da 2 segundos: cada volta paga tambem o custo do
			// `act`, do render e da consulta, entao o "limite" valia uma duracao diferente em cada maquina.
			// E o mesmo defeito que este repo ja nomeou uma vez ("o limite do settled era contagem de
			// tentativas fingindo ser tempo"): num host mais lento a consulta contra o gateway real ainda
			// estava em voo quando as tentativas acabaram, e a falha dizia "nunca saiu do skeleton" — uma
			// frase que acusa o componente de estar quebrado quando quem acabou foi o orcamento.
			const deadline = Date.now() + 30_000
			while (Date.now() < deadline) {
				if (host.querySelector('[data-slot="skeleton"]') === null) return host
				await act(async () => {
					await new Promise(resolve => setTimeout(resolve, 10))
				})
			}
			throw new Error('SessionChatSection nunca saiu do skeleton em 30s')
		}

		// Timeout explícito: um seed via givenConnectedGatewayChannel (AutoPairAfter 2s do cenário e2e) —
		// T10 deixou o default de 5000ms do bun:test com margem apertada (observado até ~4.93s, quase no
		// limite). 15s dá folga real sem mascarar uma regressão de verdade.
		it('monta contra um threadId real — anexado só porque um canal do gateway pareou de verdade — e lê o transcript vazio real', async () => {
			const { channelId } = await givenConnectedGatewayChannel(backend, { name: 'session-chat-services-test-channel' })

			// UM DIRETORIO REAL, criado agora — nunca o literal `/tmp/...`. `AddWorkspace` faz stat do
			// caminho e recusa um inexistente, e `/tmp` so existe no mac e no Linux: no Windows o Node
			// resolve isso para `C:\tmp\...`, que nao esta la. E o mesmo motivo pelo qual
			// `packages/e2e/utils/given/thread.ts` ja usa `mkdtempSync` em vez de um caminho fixo.
			const workspacePath = mkdtempSync(join(tmpdir(), 'session-chat-services-'))
			const workspace = await addWorkspace({ path: workspacePath }, { client: rawNodeClient, baseURL: backend.url })

			const attached = await attachThread(
				{
					contactRef: {
						channelId,
						externalId: 'session-chat-services-test-contact',
						displayName: 'Session Chat Services Test',
						kind: ContactKindEnum.USER,
					},
					workspaceId: workspace.workspaceId,
					providers: [ProviderKindEnum.CLAUDE_CODE],
				},
				{ client: rawNodeClient, baseURL: backend.url },
			)

			const el = await mount(attached.threadId)

			expect(el.querySelector('[data-slot="virtual-list"]')).toBeNull()
			expect(el.querySelector('[data-slot="empty"]')).not.toBeNull()
			expect(el.textContent).toContain(i18n.t('session.chatEmptyTitle'))
		}, 15_000)
	},
)
