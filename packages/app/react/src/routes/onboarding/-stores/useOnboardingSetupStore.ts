// packages/app/react/src/routes/onboarding/-stores/useOnboardingSetupStore.ts — COMPLETE final file.
import { create } from 'zustand'
import type { AgentsStepData } from '@/routes/(app)/attach/-components/AgentsStep'
import type { ContactStepData } from '@/routes/(app)/attach/-components/ContactStep'

/**
 * Cross-mount accumulator for the onboarding CONTACT/AGENTS/WORKSPACE/REVIEW steps (spec Decision
 * 4/11). `/attach`'s equivalents share ONE persistent `useForm()` owned by `AttachThreadWizard` — the
 * parent never unmounts while the operator moves between its steps. The onboarding wizard has no such
 * parent for its siblings: `STEP_COMPONENTS` is a static `Record<StepId, ReactNode>` dispatched by
 * `OnboardingFlow`, which wraps the active step in a `key={stepId}` div — every navigation fully
 * unmounts the step that was showing. A `useForm()` local to a step would lose its value on the very
 * next "Voltar"/"Avançar". This store holds PLAIN DATA (not a form instance — hooks cannot survive an
 * unmount) across exactly those remounts; `OnboardingReviewStep` seeds a fresh local form from this
 * snapshot when it mounts.
 */
interface OnboardingSetupState {
	contactRef?: ContactStepData['contactRef']
	providers?: AgentsStepData['providers']
	workspaceId?: string
}

interface OnboardingSetupActions {
	setContactRef: (contactRef: ContactStepData['contactRef']) => void
	setProviders: (providers: AgentsStepData['providers']) => void
	setWorkspaceId: (workspaceId: string) => void
	reset: () => void
}

type OnboardingSetupStore = OnboardingSetupState & OnboardingSetupActions

const initialState: OnboardingSetupState = {
	contactRef: undefined,
	providers: undefined,
	workspaceId: undefined,
}

export const useOnboardingSetupStore = create<OnboardingSetupStore>()(set => ({
	...initialState,
	setContactRef: contactRef => set({ contactRef }),
	setProviders: providers => set({ providers }),
	setWorkspaceId: workspaceId => set({ workspaceId }),
	reset: () => set(initialState),
}))
