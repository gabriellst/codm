// packages/app/react/src/components/console/OnboardingGate.services.test.tsx
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { givenChannel } from '@codm/api-typescript/testing'
import { completeOnboarding, ContactKindEnum, ProviderKindEnum, saveOnboardingStep } from '@codm/client-typescript/typescript'
import { mountRouter, type MountedRouter } from '../../../tests/support/mountRouter'
import { useIntegrationBackend, type IntegrationBackend } from '../../../tests/support/integration-harness'
import { useSystemPreconditionsStore } from '@/stores/useSystemPreconditionsStore'
import { OnboardingGate, resetOnboardingGateForTests } from './OnboardingGate'

/**
 * A GUARDA — a única coisa que decide "isso pede /onboarding" (spec Decision 14). Duas regras, dois
 * fatos diferentes:
 *
 *   · sem `completedAt` (fato do SERVIDOR) → SEMPRE navega, todo render.
 *   · com `completedAt` E algo pendente no store (fato do HOST) → navega UMA VEZ POR EXECUÇÃO
 *     (AC-11) — provado montando a guarda DUAS VEZES na mesma "execução" (o marcador é módulo,
 *     nunca resetado em produção) e checando que a segunda não bate no `/onboarding`.
 *
 * Cada caso monta um router de verdade (via o helper canônico `mountRouter`) e assevera a
 * LOCALIZAÇÃO — nunca um spy de `navigate`.
 *
 * A FRONTEIRA DE REDE É O BACKEND DE INTEGRAÇÃO, não um stub manual de fetch: o app é
 * single-operator (spec `auth/operator.ts` — sem sign-up, toda requisição É o operador), então
 * `backend.reset()` sozinho já produz o estado "onboarding nunca começou" (computado pelo
 * `GET /ui/onboarding` real), e `completeOnboarding({})` grava o `completedAt` pelo caminho de
 * produção — nada aqui é dublado.
 *
 * `.services.test.tsx` (`import-direction#R5`) — RENOMEADO de `OnboardingGate.test.tsx` em
 * 2026-08-26 (draft/atomic-commit rewrite): `CompleteOnboarding` passou a exigir um rascunho
 * completo para materializar, e produzir um de VERDADE (`givenOnboardingDraftComplete`, abaixo)
 * precisa de `givenChannel` — um import de pacote de backend (`@codm/api-typescript/testing`) que o
 * app nunca faz fora deste sufixo sancionado (mesma convenção de `AttachThreadWizard/
 * index.services.test.tsx`). Roda via `bun run test:cross-service`, não no `bun test` default.
 */
describe('OnboardingGate', () => {
	let backend: IntegrationBackend
	let mounted: MountedRouter | null = null

	beforeAll(async () => {
		backend = await useIntegrationBackend()
	})

	afterAll(async () => {
		await backend.stop()
	})

	beforeEach(async () => {
		await backend.reset()
		useSystemPreconditionsStore.getState().reset()
		resetOnboardingGateForTests()
	})

	afterEach(() => {
		mounted?.unmount()
		mounted = null
	})

	/**
	 * `CompleteOnboarding` now COMMITS a rascunho (2026-08-26, draft/atomic-commit) instead of just
	 * flipping `completedAt` — `completeOnboarding({})` alone against a fresh backend 422s with
	 * `ONBOARDING_DRAFT_INCOMPLETE` (nothing to materialize). This seeds a full draft — a REAL
	 * connected channel (`givenChannel`, defaults `status: CONNECTED`) so `AttachThread`'s own
	 * connectivity gate passes, `CLAUDE_CODE` because `MockProviderDetector` (the `integration` env's
	 * binding) reports it `DETECTED` by default, and a fresh absolute path so `AddWorkspace` creates a
	 * real workspace — via the SAME `PATCH /ui/onboarding/step` the wizard itself calls, direct through
	 * the SDK (the `given*` canon applied to a wire-level fact instead of a repository, since there is
	 * no `OnboardingRepository` reachable from this test — see `OnboardingFlow/index.test.tsx`'s own
	 * `givenSetupFactsSatisfied` for the identical pattern).
	 */
	async function givenOnboardingDraftComplete(): Promise<void> {
		const { channelId } = await givenChannel(backend.asTestBed())
		await saveOnboardingStep({
			state: {
				contactRef: { channelId, externalId: 'onboarding-gate-test', displayName: 'Onboarding Gate Test', kind: ContactKindEnum.USER },
				workspace: { path: '/tmp/onboarding-gate-test-workspace' },
				providers: [ProviderKindEnum.CLAUDE_CODE],
			},
		})
	}

	/** `/dashboard` and `/onboarding` are `mountRouter`'s own defaults — exactly the two this gate chooses between. */
	async function mount(pathname: string): Promise<MountedRouter> {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		mounted = await mountRouter(
			<QueryClientProvider client={queryClient}>
				<OnboardingGate>
					<div data-testid="console">console</div>
				</OnboardingGate>
			</QueryClientProvider>,
			{ path: pathname },
		)
		// Duas condições, nunca um sleep fixo — mas `queryClient.isFetching()` é um contador que o
		// QueryClient mantém por FORA do React, então checá-lo no attempt 0 (antes de qualquer volta
		// real pelo event loop) pode ler "0" um instante antes de React sequer ter re-renderizado com
		// o novo `data` — medido como flakiness. Por isso a checagem exige pelo menos UMA volta real
		// (attempt > 0) antes de aceitar "concluído": o helper `settled` já faz o resto do polling.
		let pass1Attempts = 0
		await mounted.settled(() => {
			pass1Attempts++
			return pass1Attempts > 1 && queryClient.isFetching() === 0
		}, 'a leitura de onboarding concluir')
		// (2) com a leitura concluída, o gate já reagiu — navegou para /onboarding ou liberou os
		// children — mas o redirect do router e o re-render que ele dispara ainda podem levar mais um
		// passo de assentamento além do attempt imediato.
		let pass2Attempts = 0
		await mounted.settled(() => {
			pass2Attempts++
			return (
				pass2Attempts > 1 &&
				(mounted!.router.state.location.pathname === '/onboarding' || mounted!.host.querySelector('[data-testid="console"]') !== null)
			)
		}, 'OnboardingGate reagir (navegar ou liberar os children)')
		return mounted
	}

	it('AC-1: sem completedAt, leva SEMPRE ao /onboarding — fato do servidor, sem flag', async () => {
		// backend.reset() sozinho já é "onboarding nunca começou" — nada a semear.
		const { router } = await mount('/dashboard')

		expect(router.state.location.pathname).toBe('/onboarding')
	})

	it('com completedAt e nada pendente, não navega — console abre normalmente', async () => {
		await givenOnboardingDraftComplete()
		await completeOnboarding({})
		const { router, host } = await mount('/dashboard')

		expect(router.state.location.pathname).toBe('/dashboard')
		expect(host.querySelector('[data-testid="console"]')).not.toBeNull()
	})

	it('AC-11: com completedAt e algo pendente, leva ao /onboarding UMA VEZ por execução', async () => {
		await givenOnboardingDraftComplete()
		await completeOnboarding({})
		useSystemPreconditionsStore.getState().apply([{ id: 'FULL_DISK_ACCESS', satisfied: false, repair: 'AVAILABLE' }])

		const first = await mount('/dashboard')
		expect(first.router.state.location.pathname).toBe('/onboarding')

		first.unmount()
		mounted = null

		// Mesma execução (o marcador de módulo NÃO foi resetado) — o operador voltou para /dashboard
		// (ex.: concluiu o wizard) e a MESMA pendência do host continua lá. Uma segunda guarda fresca
		// não pode bater de volta no /onboarding.
		const second = await mount('/dashboard')
		expect(second.router.state.location.pathname).toBe('/dashboard')
	})
})
