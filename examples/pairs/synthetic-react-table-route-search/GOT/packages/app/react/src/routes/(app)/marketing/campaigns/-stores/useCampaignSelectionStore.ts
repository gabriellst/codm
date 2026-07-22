// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-react-table-route-search
// task:        synthetic-react-table-route-search
// stamp:       agent-wave1-38ff876
// docTreeHash: 213519a54e23
// model:       sonnet
// graded:      2026-07-22T00:18:07.921Z
// source:      packages/app/react/src/routes/(app)/marketing/campaigns/-stores/useCampaignSelectionStore.ts (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { create } from 'zustand'

interface CampaignSelectionState {
	selectedIds: string[]
}

interface CampaignSelectionActions {
	toggleSelection: (id: string) => void
	selectAll: (ids: string[]) => void
	clearSelection: () => void
}

type CampaignSelectionStore = CampaignSelectionState & CampaignSelectionActions

export const useCampaignSelectionStore = create<CampaignSelectionStore>()(set => ({
	selectedIds: [],

	toggleSelection: id =>
		set(state => ({
			selectedIds: state.selectedIds.includes(id) ? state.selectedIds.filter(i => i !== id) : [...state.selectedIds, id],
		})),
	selectAll: ids => set({ selectedIds: ids }),
	clearSelection: () => set({ selectedIds: [] }),
}))
