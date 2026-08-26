// packages/app/react/src/routes/onboarding/-components/OnboardingContactStep/index.tsx — COMPLETE final file.
import { type ComponentProps, useMemo } from 'react'
import type { ChannelKind } from '@codm/client-typescript/typescript'
import { useGetAttachThreadWizard, useSaveOnboardingStep } from '@codm/client-typescript/typescript'
import { ContactStep, type ContactStepData } from '@/routes/(app)/attach/-components/ContactStep'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'

/**
 * Adapter for the onboarding CONTACT step (spec Decision 11) — `ContactStep` is `/attach`'s, reused
 * UNMODIFIED. It owns its own read (`useGetAttachThreadWizard`) for `channelKindById`, the same way
 * `AttachThreadWizard` derives it, and threads its slice of the accumulated selection through
 * `useOnboardingSetupStore` (see that store's docblock for why a plain `useForm()` cannot survive
 * navigating away from this step and back — `ContactStep` itself has no `onBack`: it is always FIRST
 * among the three, by construction, same as in `/attach`).
 *
 * 2026-08-26 — draft/atomic-commit rewrite: a row click PATCHes `state.contactRef` into the server
 * draft IMMEDIATELY, the same gesture that already records it locally. No `confirmStep` needed here
 * (unlike `OnboardingWorkspaceStep`'s typed-path case) — a click both selects AND persists in one
 * shot, nothing pending to submit later. `AttachThread` no longer fires from this step at all; only
 * `CompleteOnboarding` materializes the thread, atomically, once every group is in.
 */
export function OnboardingContactStep(props: Omit<ComponentProps<'form'>, 'onSubmit'>) {
	const contactRef = useOnboardingSetupStore(state => state.contactRef)
	const setContactRef = useOnboardingSetupStore(state => state.setContactRef)
	const { data } = useGetAttachThreadWizard()
	const channelKindById = useMemo(() => new Map<string, ChannelKind>((data?.channels ?? []).map(c => [c.channelId, c.kind])), [data])
	// Fire-and-forget background sync (no `stepError` mirror, no `suppressToast`): a failure here is
	// surfaced by the default global toast — the selection itself already advanced locally, and
	// `CompleteOnboarding`'s own `ONBOARDING_DRAFT_INCOMPLETE` is the backstop if it never lands.
	const saveOnboardingStep = useSaveOnboardingStep()

	const handleSubmit = (d: ContactStepData) => {
		setContactRef(d.contactRef)
		saveOnboardingStep.mutate({ data: { state: { contactRef: d.contactRef } } })
	}

	return <ContactStep channelKindById={channelKindById} defaultValues={{ contactRef }} onSubmit={handleSubmit} {...props} />
}
