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
 * `channelDone` NÃO é produzível: `channels`/`remotes` são tabelas do gateway Go sem given exposto
 * em `@codm/api-typescript/testing` (mesmo gap documentado em `ContactStep`, T9) — o caso "tudo
 * feito" (que exige os três) fica SÓ-VISUAL em `index.stories.tsx`.
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

	it('nada feito: os três passos aparecem', async () => {
		await mount()

		expect(mounted?.host.textContent).toContain(i18n.t('home.setupChannelTitle'))
		expect(mounted?.host.textContent).toContain(i18n.t('home.setupWorkspaceTitle'))
		expect(mounted?.host.textContent).toContain(i18n.t('home.setupThreadTitle'))
	})

	it('workspace feito de verdade (addWorkspace real): a linha some, os outros dois ficam', async () => {
		await addWorkspace({ path: '/tmp/setup-checklist-fixture' })
		await mount()

		expect(mounted?.host.textContent).not.toContain(i18n.t('home.setupWorkspaceTitle'))
		expect(mounted?.host.textContent).toContain(i18n.t('home.setupChannelTitle'))
		expect(mounted?.host.textContent).toContain(i18n.t('home.setupThreadTitle'))
	})

	/**
	 * `givenThread` ANINHA `givenWorkspace` (uma thread não pode existir sem workspace — ver
	 * `tests/support/given/threads.ts`), então este caso derruba as DUAS linhas de uma vez —
	 * medido, não assumido: a primeira versão deste teste esperava só a linha de thread sumir e
	 * quebrou porque `workspaceDone` também virava `true`. Só o canal (improduzível) sobra.
	 */
	it('thread feita de verdade (givenThread, que também cria o workspace que ela referencia): só o canal sobra', async () => {
		const { givenThread } = await loadBackendGivens()
		await givenThread(backend.asTestBed(), {})
		await mount()

		expect(mounted?.host.textContent).not.toContain(i18n.t('home.setupThreadTitle'))
		expect(mounted?.host.textContent).not.toContain(i18n.t('home.setupWorkspaceTitle'))
		expect(mounted?.host.textContent).toContain(i18n.t('home.setupChannelTitle'))
	})
})
