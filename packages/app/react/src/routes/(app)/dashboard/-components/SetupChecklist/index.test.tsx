// packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.test.tsx
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { addWorkspace } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { mountRouter, type MountedRouter } from '../../../../../../tests/support/mountRouter'
import { loadBackendGivens, useIntegrationBackend, type IntegrationBackend } from '../../../../../../tests/support/integration-harness'
import { SetupChecklist } from '.'

/**
 * REDUZIDO (T11, onda B) — comportamento contra o backend REAL, sem `globalThis.fetch` manual.
 *
 * `workspaceDone` e `threadDone` são PRODUZÍVEIS pelo harness: `addWorkspace({ path })` é a
 * mutation REAL (não um given) e resolve determinística sob `integration` — o binding do
 * `WorkspaceDetector` ali é o `MockWorkspaceDetector` ("never touches the filesystem", canned
 * `{ exists: true, isDirectory: true }`), o mesmo tipo de determinismo que `ProvidersSection` (T9)
 * já provou para `MockProviderDetector`. `threadDone` vem de `givenThread` (tooling congelado).
 *
 * `channelDone` NÃO é produzível AQUI (harness sem `services`): `channels`/`remotes` são tabelas do
 * gateway Go, e este arquivo sobe o backend TS sozinho, sem o gateway subprocess. ATUALIZADO (T9/T12):
 * `channelDone` isolado TEM cobertura real — `index.services.test.tsx` (`services: ['apiGo']`) semeia
 * um canal de verdade via `givenConnectedGatewayChannel` e prova a linha do canal sumindo. O que
 * continua SÓ-VISUAL em `index.stories.tsx` é só o caso "tudo feito" (os três ao mesmo tempo) — nenhum
 * arquivo hoje combina canal conectado + workspace + thread na mesma seed.
 */
describe('SetupChecklist — contra o backend real', () => {
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

	/** A linha do passo pelo título — e o estado que ela declara (`data-done`), nunca só o texto. */
	function stepRow(titleKey: string): { done: boolean; hasCta: boolean } {
		const rows = [...(mounted?.host.querySelectorAll('[data-slot="setup-step"]') ?? [])] as HTMLElement[]
		const row = rows.find(r => r.textContent?.includes(i18n.t(titleKey)))
		if (!row) throw new Error(`linha "${i18n.t(titleKey)}" não renderizada`)
		return { done: row.dataset.done === 'true', hasCta: !!row.querySelector('a') }
	}

	it('nada feito: os três passos aparecem, todos pendentes e com CTA', async () => {
		await mount()

		expect(stepRow('home.setupChannelTitle')).toEqual({ done: false, hasCta: true })
		expect(stepRow('home.setupWorkspaceTitle')).toEqual({ done: false, hasCta: true })
		expect(stepRow('home.setupThreadTitle')).toEqual({ done: false, hasCta: true })
	})

	// Founder, 2026-08-25: um passo satisfeito NÃO some mais — fica na lista marcado como concluído
	// (check no lugar do CTA), senão "2 · 3" sem o "1" lê como buraco, não como progresso.
	it('workspace feito de verdade (addWorkspace real): a linha fica, marcada concluída e sem CTA; os outros dois seguem pendentes', async () => {
		await addWorkspace({ path: '/tmp/setup-checklist-fixture' })
		await mount()

		expect(stepRow('home.setupWorkspaceTitle')).toEqual({ done: true, hasCta: false })
		expect(mounted?.host.querySelector(`[aria-label="${i18n.t('home.setupDone')}"]`)).not.toBeNull()
		expect(stepRow('home.setupChannelTitle')).toEqual({ done: false, hasCta: true })
		expect(stepRow('home.setupThreadTitle')).toEqual({ done: false, hasCta: true })
	})

	/**
	 * `givenThread` ANINHA `givenWorkspace` (uma thread não pode existir sem workspace — ver
	 * `tests/support/given/threads.ts`), então este caso derruba as DUAS linhas de uma vez —
	 * medido, não assumido: a primeira versão deste teste esperava só a linha de thread sumir e
	 * quebrou porque `workspaceDone` também virava `true`. Só o canal (improduzível) sobra.
	 */
	it('thread feita de verdade (givenThread, que também cria o workspace que ela referencia): duas linhas concluídas, só o canal pendente', async () => {
		const { givenThread } = await loadBackendGivens()
		await givenThread(backend.asTestBed(), {})
		await mount()

		expect(stepRow('home.setupThreadTitle')).toEqual({ done: true, hasCta: false })
		expect(stepRow('home.setupWorkspaceTitle')).toEqual({ done: true, hasCta: false })
		expect(stepRow('home.setupChannelTitle')).toEqual({ done: false, hasCta: true })
	})
})
