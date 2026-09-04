// packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.test.tsx
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { addWorkspace } from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { mountRouter, type MountedRouter } from '../../../../../../tests/support/mountRouter'
import {
	loadBackendGivens,
	useIntegrationBackend,
	type IntegrationBackend,
	INTEGRATION_BOOT_TIMEOUT_MS,
} from '../../../../../../tests/support/integration-harness'
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
 * 2026-08-26 — REESCRITO: `CHANNEL`/`CONTACT`/`AGENTS`/`REVIEW` viraram `REQUIRED` no
 * `STEP_TAXONOMY` do wizard (`/onboarding/-components/steps.ts`, founder override do bug "Próximo
 * avança sem conectar/escolher nada") — `DEFERRABLE_SETUP_IDS` (`index.tsx`) deriva DESSA MESMA
 * tabela, então `WORKSPACE` é o ÚNICO `StepId` que ainda sobra como candidato deste painel. Um
 * passo `REQUIRED` bloqueia "Concluir" no wizard — não existe mais um operador no `/dashboard` com
 * canal/contato/provider/revisão pendentes para "adiar" aqui (a exceção — quem já tinha
 * `completedAt` gravado ANTES desta mudança — é uma migração de dado fora do escopo deste front).
 * Os três casos abaixo passam a testar exatamente UM candidato (`WORKSPACE`) em vez de três.
 */
describe('SetupChecklist — contra o backend real', () => {
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

	it('nada feito: só a linha de WORKSPACE aparece, pendente e com CTA — CHANNEL/THREAD não são mais candidatos', async () => {
		await mount()

		expect(stepRow('home.setupWorkspaceTitle')).toEqual({ done: false, hasCta: true })
		const rows = [...(mounted?.host.querySelectorAll('[data-slot="setup-step"]') ?? [])]
		expect(rows).toHaveLength(1)
		expect(mounted?.host.textContent).not.toContain(i18n.t('home.setupChannelTitle'))
		expect(mounted?.host.textContent).not.toContain(i18n.t('home.setupThreadTitle'))
	})

	// Founder, 2026-08-25: um passo DEFERRABLE satisfeito não some mais — fica marcado concluído. Mas
	// `WORKSPACE` é o ÚNICO candidato deste painel desde 2026-08-26 (docblock acima), então satisfazê-lo
	// esvazia `steps` por completo (`steps.every(done)` com um array de um item) — o painel INTEIRO
	// some, não sobra uma linha "concluída" para mostrar.
	it('workspace feito de verdade (addWorkspace real): era o único candidato — o painel inteiro some', async () => {
		await addWorkspace({ path: '/tmp/setup-checklist-fixture' })
		await mount()

		expect(mounted?.host.querySelector('[data-slot="setup-step"]')).toBeNull()
	})

	/**
	 * `givenThread` ANINHA `givenWorkspace` (uma thread não pode existir sem workspace — ver
	 * `tests/support/given/threads.ts`), então `workspaceDone` também vira `true` aqui — MESMO
	 * resultado do caso acima por um caminho diferente: `WORKSPACE` (o único candidato) fica
	 * satisfeito, o painel some. `REVIEW`/`threadDone` não têm mais linha própria para checar (não é
	 * mais candidato deste painel).
	 */
	it('thread feita de verdade (givenThread, que também cria o workspace que ela referencia): mesmo resultado — o painel some', async () => {
		const { givenThread } = await loadBackendGivens()
		await givenThread(backend.asTestBed(), {})
		await mount()

		expect(mounted?.host.querySelector('[data-slot="setup-step"]')).toBeNull()
	})
})
