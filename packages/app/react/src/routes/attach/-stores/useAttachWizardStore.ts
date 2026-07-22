import { create } from 'zustand'

/**
 * Navigation-only store for the attach wizard (per the approved composed-form pair's
 * `-stores/useOnboardingStore`). It holds ONLY where we are and which way we're moving — the step
 * DATA lives in the parent's accumulated TanStack Form, never here. `direction` drives the slide
 * transition (1 = forward/enter-from-right, -1 = back/enter-from-left).
 */
interface AttachWizardState {
	currentStepIndex: number
	direction: 1 | -1
}

interface AttachWizardActions {
	setCurrentStepIndex: (currentStepIndex: number) => void
	setDirection: (direction: 1 | -1) => void
	reset: () => void
}

type AttachWizardStore = AttachWizardState & AttachWizardActions

const initialState: AttachWizardState = {
	currentStepIndex: 0,
	direction: 1,
}

export const useAttachWizardStore = create<AttachWizardStore>()(set => ({
	...initialState,
	setCurrentStepIndex: currentStepIndex => set({ currentStepIndex }),
	setDirection: direction => set({ direction }),
	reset: () => set(initialState),
}))
