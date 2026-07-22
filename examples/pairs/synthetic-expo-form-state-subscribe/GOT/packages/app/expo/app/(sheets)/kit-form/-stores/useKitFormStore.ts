// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-form-state-subscribe
// task:        synthetic-expo-form-state-subscribe
// stamp:       expo-formsub-iter7
// docTreeHash: 46468161d9ca
// model:       sonnet
// graded:      2026-06-12T17:35:14.911Z
// source:      packages/app/expo/app/(sheets)/kit-form/-stores/useKitFormStore.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { create } from 'zustand'

interface KitFormState {
	pickerOpen: boolean
}

interface KitFormActions {
	setPickerOpen: (open: boolean) => void
	reset: () => void
}

type KitFormStore = KitFormState & KitFormActions

const initialState: KitFormState = {
	pickerOpen: false,
}

export const useKitFormStore = create<KitFormStore>((set) => ({
	...initialState,
	setPickerOpen: (open) => set({ pickerOpen: open }),
	reset: () => set(initialState),
}))
