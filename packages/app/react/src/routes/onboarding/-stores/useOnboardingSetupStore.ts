// packages/app/react/src/routes/onboarding/-stores/useOnboardingSetupStore.ts — COMPLETE final file.
import { create } from 'zustand'
import type { AgentsStepData } from '@/routes/(app)/attach/-components/AgentsStep'
import type { ContactStepData } from '@/routes/(app)/attach/-components/ContactStep'

/**
 * Cross-mount accumulator for the onboarding CONTACT/AGENTS/WORKSPACE/REVIEW steps (spec Decision
 * 4/11). `STEP_COMPONENTS` is a static `Record<StepId, ReactNode>` dispatched by `OnboardingFlow`,
 * which wraps the active step in a `key={stepId}` div — every navigation fully unmounts the step that
 * was showing, so any state local to a step would lose its value on the very next "Voltar"/"Avançar".
 * This store holds that selection across exactly those remounts; `OnboardingReviewStep` reads this
 * snapshot straight through to `ReviewStep` as plain props.
 *
 * `/attach`'s `useAttachWizardStore` holds the SAME three fields, for a related but distinct reason —
 * its steps don't unmount (one continuous `AttachThreadWizard`), but its footer needs to read "does
 * the CURRENT step have a selection?" reactively without depending on a step's own local form. Two
 * stores, not one shared store, because the two wizards have entirely separate navigation/step
 * lifecycles — but the same shape, on purpose: `ReviewStep` (shared by both) reads plain
 * `contactRef`/`workspaceId`/`providers` props either way, never a `form` instance.
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
