// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-react-onboarding-composed-form
// task:        synthetic-react-onboarding-composed-form
// stamp:       agent-wave1-38ff876
// docTreeHash: 213519a54e23
// model:       sonnet
// graded:      2026-07-21T23:05:55.662Z
// source:      packages/app/react/src/routes/onboarding/-stores/useOnboardingStore.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { create } from 'zustand'
import type { ConnectionMode, IntegrationPlatform } from '@codedm/client-typescript/typescript'

// The connect union only carries CREDENTIALS/MANUAL members — OAUTH is a valid ConnectionMode
// elsewhere in the product, but the ConnectionModeStep never offers it here (unionVariantValues
// over the connect union excludes it), so the nav-selected mode is narrowed accordingly.
type WizardConnectionMode = Exclude<ConnectionMode, 'OAUTH'>

interface OnboardingState {
	currentStepIndex: number
	direction: 1 | -1
	selectedMode: WizardConnectionMode | undefined
	selectedPlatform: IntegrationPlatform | undefined
}

interface OnboardingActions {
	setCurrentStepIndex: (currentStepIndex: number) => void
	setDirection: (direction: 1 | -1) => void
	setSelectedMode: (selectedMode: WizardConnectionMode | undefined) => void
	setSelectedPlatform: (selectedPlatform: IntegrationPlatform | undefined) => void
	reset: () => void
}

type OnboardingStore = OnboardingState & OnboardingActions

const initialState: OnboardingState = {
	currentStepIndex: 0,
	direction: 1,
	selectedMode: undefined,
	selectedPlatform: undefined,
}

export const useOnboardingStore = create<OnboardingStore>()(set => ({
	...initialState,
	setCurrentStepIndex: currentStepIndex => set({ currentStepIndex }),
	setDirection: direction => set({ direction }),
	setSelectedMode: selectedMode => set({ selectedMode }),
	setSelectedPlatform: selectedPlatform => set({ selectedPlatform }),
	reset: () => set(initialState),
}))
