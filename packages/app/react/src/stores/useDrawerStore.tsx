import type { ReactNode } from 'react'
import { create } from 'zustand'

/**
 * Imperative drawer store — the Sheet/side-panel counterpart of {@link useDialogStore}.
 *
 * Any component, anywhere, can open a drawer with `useDrawerStore.getState().show(<SomeDrawer />)`
 * (or `const show = useDrawerStore(s => s.show)`). The drawer content owns its own `<Sheet>` and reads
 * `open`/`hide` from this store; the `(app)` layout just mounts `content` once. Keeping drawers on a
 * separate store from dialogs lets a drawer and a dialog coexist without fighting over one slot.
 */
interface DrawerState {
	content: ReactNode | null
	open: boolean
}

interface DrawerActions {
	show: (content: ReactNode) => void
	hide: () => void
}

type DrawerStore = DrawerState & DrawerActions

// Keep content mounted until the close animation finishes, then drop it (matches useDialogStore).
const CLOSE_ANIMATION_MS = 250

export const useDrawerStore = create<DrawerStore>(set => ({
	content: null,
	open: false,
	show: content => set({ content, open: true }),
	hide: () => {
		set({ open: false })
		setTimeout(() => {
			if (!useDrawerStore.getState().open) {
				set({ content: null })
			}
		}, CLOSE_ANIMATION_MS)
	},
}))
