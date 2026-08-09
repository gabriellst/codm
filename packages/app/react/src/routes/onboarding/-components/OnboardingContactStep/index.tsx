// packages/app/react/src/routes/onboarding/-components/OnboardingContactStep/index.tsx — COMPLETE final file.
import { type ComponentProps, useMemo } from 'react'
import type { ChannelKind } from '@codm/client-typescript/typescript'
import { useGetAttachThreadWizard } from '@codm/client-typescript/typescript'
import { ContactStep, type ContactStepData } from '@/routes/attach/-components/ContactStep'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'

/**
 * Adapter for the onboarding CONTACT step (spec Decision 11) — `ContactStep` is `/attach`'s, reused
 * UNMODIFIED. It owns its own read (`useGetAttachThreadWizard`) for `channelKindById`, the same way
 * `AttachThreadWizard` derives it, and threads its slice of the accumulated selection through
 * `useOnboardingSetupStore` (see that store's docblock for why a plain `useForm()` cannot survive
 * navigating away from this step and back — `ContactStep` itself has no `onBack`: it is always FIRST
 * among the three, by construction, same as in `/attach`).
 */
export function OnboardingContactStep(props: Omit<ComponentProps<'form'>, 'onSubmit'>) {
	const contactRef = useOnboardingSetupStore(state => state.contactRef)
	const setContactRef = useOnboardingSetupStore(state => state.setContactRef)
	const { data } = useGetAttachThreadWizard()
	const channelKindById = useMemo(() => new Map<string, ChannelKind>((data?.channels ?? []).map(c => [c.channelId, c.kind])), [data])

	const handleSubmit = (d: ContactStepData) => setContactRef(d.contactRef)

	return <ContactStep channelKindById={channelKindById} defaultValues={{ contactRef }} onSubmit={handleSubmit} {...props} />
}
