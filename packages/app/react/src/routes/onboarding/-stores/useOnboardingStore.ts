import { create } from 'zustand'

/**
 * Navigation-only store for the first-run onboarding (per the approved pair's
 * `-stores/useOnboardingStore`). Holds only the current slide and the travel direction that drives
 * the slide transition (1 = forward/enter-from-right, -1 = back/enter-from-left). There is no data
 * to accumulate — onboarding is a read-only intro.
 */
interface OnboardingState {
	currentSlide: number
	direction: 1 | -1
}

interface OnboardingActions {
	setCurrentSlide: (currentSlide: number) => void
	setDirection: (direction: 1 | -1) => void
	reset: () => void
}

type OnboardingStore = OnboardingState & OnboardingActions

const initialState: OnboardingState = {
	currentSlide: 0,
	direction: 1,
}

export const useOnboardingStore = create<OnboardingStore>()(set => ({
	...initialState,
	setCurrentSlide: currentSlide => set({ currentSlide }),
	setDirection: direction => set({ direction }),
	reset: () => set(initialState),
}))
