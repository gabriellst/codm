// packages/app/react/src/routes/(app)/dashboard/-components/MentionCta/index.services.test.tsx
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { givenChannel } from '@codm/api-typescript/testing'
import {
	completeOnboarding,
	configureMentionGate,
	ContactKindEnum,
	ProviderKindEnum,
	saveOnboardingStep,
} from '@codm/client-typescript/typescript'
import i18n from '@/lib/i18n'
import { useIntegrationBackend, type IntegrationBackend } from '../../../../../../tests/support/integration-harness'
import { MentionCta } from '.'

/**
 * `.services.test.tsx` (`import-direction#R5`) — this suite imports `givenChannel` straight from
 * `@codm/api-typescript/testing` (a static import, not the `loadBackendGivens()` dynamic-import
 * seam `SetupChecklist/index.test.tsx` uses) so it can drive a REAL `completeOnboarding` the same
 * way `OnboardingGate.services.test.tsx` does: `GetHomeDashboard` sits behind `OnboardingMiddleware`
 * (`/ui/home` 403s with `ONBOARDING_NOT_COMPLETED` otherwise), so there is no way to observe
 * `mentionCta` at all — present OR absent — without a genuinely completed onboarding underneath it.
 * Runs via `bun run test:cross-service`, not the default `bun test`.
 *
 * Completing onboarding also happens to be the CHEAPEST way to produce a thread this CTA can react
 * to: `CompleteOnboarding` calls `AttachThread` for real, which creates a thread with its mention
 * gate ON and zero transcript entries — exactly the state `GetHomeDashboard.mentionCta`'s own
 * docblock names as the qualifying one. No separate `givenThread` needed.
 */
describe('MentionCta — contra o backend real', () => {
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
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
	})

	/** Same recipe as `OnboardingGate.services.test.tsx`'s `givenOnboardingDraftComplete` — a full draft, committed for real. */
	async function completeOnboardingWithFreshThread(): Promise<{ threadId: string }> {
		const { channelId } = await givenChannel(backend.asTestBed())
		await saveOnboardingStep({
			state: {
				contactRef: { channelId, externalId: 'mention-cta-test', displayName: 'Mention CTA Test', kind: ContactKindEnum.USER },
				workspace: { path: '/tmp/mention-cta-test-workspace' },
				providers: [ProviderKindEnum.CLAUDE_CODE],
			},
		})
		const { threadId } = await completeOnboarding({})
		if (!threadId) throw new Error('completeOnboarding did not materialize a thread')
		return { threadId }
	}

	async function mount(): Promise<QueryClient> {
		host = document.createElement('div')
		document.body.appendChild(host)
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		const element = host
		await act(async () => {
			root = createRoot(element)
			root.render(
				<QueryClientProvider client={queryClient}>
					<MentionCta />
				</QueryClientProvider>,
			)
		})
		return queryClient
	}

	/** Espera POR CONDIÇÃO, nunca sleep fixo — o CTA só chega depois do round-trip real de `useGetHomeDashboard`. */
	async function settled(predicate: () => boolean, label = 'condição'): Promise<void> {
		for (let attempt = 0; attempt < 100; attempt++) {
			if (predicate()) return
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
			})
		}
		throw new Error(`MentionCta: ${label} nunca aconteceu`)
	}

	it('thread recém-anexada pelo onboarding, gate ligado por padrão: mostra o CTA com a mensagem interpolada', async () => {
		await completeOnboardingWithFreshThread()

		await mount()

		await settled(() => (host?.textContent ?? '').includes(i18n.t('dashboard.mentionCtaTitle')), 'o título do CTA aparecer')
		// A mensagem é a INTERPOLADA (com a tag real), nunca o template com o placeholder literal.
		expect(host?.textContent).toContain('@mention-cta-test-workspace')
		expect(host?.textContent).not.toContain('{{mention}}')
	})

	it('gate desligado pelo operador: o CTA não aparece', async () => {
		const { threadId } = await completeOnboardingWithFreshThread()
		await configureMentionGate(threadId, { mentionGate: { enabled: false } })

		const queryClient = await mount()

		// Espera o round-trip REALMENTE terminar antes de assertar ausência — `isFetching()` no attempt
		// 0 pode ler "0" um instante antes do fetch sequer ter começado (mesma armadilha documentada em
		// `OnboardingGate.services.test.tsx`'s `mount`), daí exigir mais de uma volta do polling.
		let attempts = 0
		await settled(() => {
			attempts++
			return attempts > 1 && queryClient.isFetching() === 0
		}, 'o fetch do dashboard assentar')
		expect(host?.textContent).toBe('')
	})
})
