import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarStore {
	isExpanded: boolean
	setIsExpanded: (isExpanded: boolean) => void
}

export const useSidebarStore = create<SidebarStore>()(
	persist(
		set => ({
			isExpanded: false,
			setIsExpanded: (isExpanded: boolean) => set({ isExpanded }),
		}),
		{
			name: 'sidebar-storage',
		},
	),
)
