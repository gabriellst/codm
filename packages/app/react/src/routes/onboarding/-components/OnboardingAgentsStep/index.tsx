// packages/app/react/src/routes/onboarding/-components/OnboardingAgentsStep/index.tsx — COMPLETE final file.
import type { ComponentProps } from 'react'
import { useGetAttachThreadWizard } from '@codm/client-typescript/typescript'
import { AgentsStep, type AgentsStepData } from '@/routes/(app)/attach/-components/AgentsStep'
import { useOnboardingSetupStore } from '../../-stores/useOnboardingSetupStore'

/**
 * Adapter for the onboarding AGENTS step (spec Decision 11) — `AgentsStep` is `/attach`'s, reused
 * UNMODIFIED. No `onBack` passed: `OnboardingFlow` already renders its own "Voltar" button below every
 * step, and `StepHeading` (inside `AgentsStep`) only renders its own back arrow when `onBack` is given
 * — see `OnboardingContactStep`'s and `useOnboardingSetupStore`'s docblocks for why plain data, not a
 * form instance, carries the selection across this step's remounts.
 */
export function OnboardingAgentsStep(props: Omit<ComponentProps<'form'>, 'onSubmit'>) {
	const providers = useOnboardingSetupStore(state => state.providers)
	const setProviders = useOnboardingSetupStore(state => state.setProviders)
	const { data } = useGetAttachThreadWizard()

	const handleSubmit = (d: AgentsStepData) => setProviders(d.providers)

	return <AgentsStep providers={data?.providers ?? []} defaultValues={{ providers }} onSubmit={handleSubmit} {...props} />
}
