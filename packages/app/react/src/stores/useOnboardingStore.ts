// packages/app/react/src/stores/useOnboardingStore.ts — COMPLETE final file.
// MANTENHA a forma do scaffold: interfaces State/Actions separadas, `initialState` nomeado, e o
// `create<Store>()(set => ({...}))`.
import { create } from 'zustand'

interface OnboardingState {
	/**
	 * O BACKEND recusou uma rota por onboarding incompleto.
	 *
	 * Distinto do `completedAt` que o `OnboardingGate` lê: aquele vem de uma LEITURA bem-sucedida, e
	 * este é o que sobra quando a leitura nem chega — o operador tinha 403 em tudo, inclusive no
	 * `GetOnboarding`, e o gate renderizava o app porque `data` era `undefined`. O resultado era um
	 * toast vermelho dizendo "conclua o onboarding" numa tela que não levava a lugar nenhum.
	 */
	required: boolean
}

interface OnboardingActions {
	markRequired: () => void
	reset: () => void
}

type OnboardingStore = OnboardingState & OnboardingActions

const initialState: OnboardingState = {
	required: false,
}

export const useOnboardingStore = create<OnboardingStore>()(set => ({
	...initialState,
	markRequired: () => set({ required: true }),
	reset: () => set(initialState),
}))
