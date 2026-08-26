// packages/app/react/src/routes/onboarding/-components/OnboardingFinalStep/index.test.tsx
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/lib/i18n'
import { loadBackendGivens, useIntegrationBackend, type IntegrationBackend } from '../../../../../tests/support/integration-harness'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'
import { OnboardingFinalStep } from '.'

/**
 * Harness lane (SB-04's sanctioned exception, storybook skill) — `OnboardingFinalStep` is connected
 * (`useGetSessionChat`), and the branch under test (mention CTA vs. generic body, keyed off a REAL
 * thread's `mentionGate`) needs an actual round-trip: MSW doesn't intercept under `bun test`
 * (measured — storybook skill's own ruling), so `index.stories.tsx`'s two variants are VISUAL-ONLY,
 * for the Storybook browser. This file proves the decision itself against `useIntegrationBackend()`.
 *
 * 2026-08-26 — regression follow-up. `completedThreadId` (`useOnboardingSetupStore`) is what
 * `OnboardingFlow`'s `completeOnboarding.onSuccess` stashes from `CompleteOnboarding`'s
 * `{ threadId: string | null }` response — this suite seeds it directly (the store, not the mutation)
 * since driving the mutation would immediately navigate away in the real flow (`OnboardingFlow`'s own
 * `onSuccess` awaits `navigate({ to: '/dashboard' })` right after), which would tear this component
 * down before an assertion could run.
 */
describe('OnboardingFinalStep — contra o backend real', () => {
	let backend: IntegrationBackend
	let root: Root | null = null
	let host: HTMLDivElement | null = null

	beforeAll(async () => {
		backend = await useIntegrationBackend()
	})

	afterAll(async () => {
		await backend.stop()
	})

	beforeEach(async () => {
		await i18n.changeLanguage('pt')
		await backend.reset()
		useOnboardingSetupStore.getState().reset()
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
					<OnboardingFinalStep />
				</QueryClientProvider>,
			)
		})
	}

	/** Espera POR CONDIÇÃO, nunca sleep fixo — o CTA só chega depois do round-trip real de `useGetSessionChat`. */
	async function settled(predicate: () => boolean, label = 'condição'): Promise<void> {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (predicate()) return
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		throw new Error(`OnboardingFinalStep: ${label} nunca aconteceu`)
	}

	it('sem completedThreadId (visita que ainda não concluiu) mostra o corpo genérico, sem tocar a rede', async () => {
		await mount()

		expect(host?.textContent).toContain(i18n.t('onboarding.finalBody'))
		expect(host?.textContent).not.toContain(i18n.t('onboarding.finalMentionIntro'))
	})

	/**
	 * O caminho idempotente "já concluído" de `CompleteOnboarding` pode devolver `threadId: null`
	 * (rascunho pós-conclusão sem `contactRef` resolvível — ver aquele use case) — o contrato modela a
	 * incerteza, e este componente degrada para o corpo genérico, nunca uma falha.
	 */
	it('completedThreadId: null degrada para o corpo genérico', async () => {
		useOnboardingSetupStore.getState().setCompletedThreadId(null)

		await mount()

		expect(host?.textContent).toContain(i18n.t('onboarding.finalBody'))
		expect(host?.textContent).not.toContain(i18n.t('onboarding.finalMentionIntro'))
	})

	it('completedThreadId de uma thread real com mentionGate habilitado mostra o CTA com a tag real', async () => {
		const { givenThread, GIVEN_MENTION_TAG } = await loadBackendGivens()
		const thread = await givenThread(backend.asTestBed(), {})
		useOnboardingSetupStore.getState().setCompletedThreadId(thread.id.value)

		await mount()

		await settled(() => (host?.textContent ?? '').includes(i18n.t('onboarding.finalMentionIntro')), 'a intro da menção aparecer')
		expect(host?.textContent).toContain(GIVEN_MENTION_TAG)
		expect(host?.textContent).not.toContain(i18n.t('onboarding.finalBody'))
	})
})
