import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { getSessionChatQueryOptions } from '@codm/client-typescript/typescript'
import { connected, mockQuery } from '@/storybook'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'
import { OnboardingFinalStep } from '.'

const THREAD_ID = '019e4d24-6524-7041-9e1c-8108180cddae'

/**
 * VISUAL-ONLY (storybook skill's own ruling — MSW does not intercept under `bun test`): these two
 * variants exist for the Storybook BROWSER to show both closing states side by side. `completedThreadId`
 * has no route/search channel to seed it through (it's a Zustand field on `useOnboardingSetupStore`,
 * populated by `OnboardingFlow`'s own `completeOnboarding.onSuccess` in the real app — see that
 * store field's docblock), so each variant seeds the store directly on mount, same technique
 * `onboarding.stories.tsx`'s `withOnboardingState` already uses for its sibling stores.
 *
 * The actual branch logic (mention CTA shown iff `completedThreadId` resolves through
 * `useGetSessionChat` to a thread with `mentionGate.enabled`, degrading to the generic body
 * otherwise — including the `threadId: null` idempotent path) is proven against the REAL backend in
 * `index.test.tsx` (harness lane, SB-04's sanctioned exception for behavior a mocked `play` cannot
 * reach under bun).
 */
function withCompletedThreadId(threadId: string | null | undefined) {
	return function Harness() {
		useState(() => {
			useOnboardingSetupStore.getState().reset()
			useOnboardingSetupStore.getState().setCompletedThreadId(threadId)
			return true
		})
		return <OnboardingFinalStep />
	}
}

const meta = {
	title: 'Onboarding/OnboardingFinalStep',
	component: OnboardingFinalStep,
	parameters: connected({ route: { id: '/onboarding/' } }),
} satisfies Meta<typeof OnboardingFinalStep>
export default meta

type Story = StoryObj<typeof meta>

/** Sem `completedThreadId` (visita nunca concluiu, ou o wizard nem chegou lá ainda) — corpo genérico. */
export const CorpoGenerico: Story = {
	render: withCompletedThreadId(undefined),
}

/**
 * `completedThreadId` presente e `mentionGate.enabled` — o CTA "mencione o agente" com a tag real e o
 * botão de copiar.
 */
export const MencaoAoAgente: Story = {
	parameters: {
		msw: {
			handlers: [mockQuery(getSessionChatQueryOptions(THREAD_ID), { mentionGate: { enabled: true, tag: '@codm' } })],
		},
	},
	render: withCompletedThreadId(THREAD_ID),
}

/** `threadId: null` — o caminho idempotente "já concluído" sem contactRef resolvível (`CompleteOnboarding`'s
 *  own docblock). Degrada para o corpo genérico, nunca uma falha. */
export const RascunhoInconclusivo: Story = {
	render: withCompletedThreadId(null),
}
