import { useIsMutating } from '@tanstack/react-query'
import { create } from 'zustand'
import {
	requestPanelActionMutationKey,
	useRequestPanelAction,
	type RequestPanelActionMutationRequest,
} from '@codm/client-typescript/typescript-cloud'
import { errorCodeOf, type ErrorCode } from './panelErrors'
import { usePanelToken } from './panelToken'

/**
 * The LAST action this device asked for, and where it stands — shared by everything that acts (the ask card
 * through the surface port, pause/resume, the steer field) and the one status line that reports it, so it is
 * cross-component client state (state placement, case 3). Server truth about the action itself is still the
 * SDK query (`GET /actions/:id`); this only remembers WHICH action to ask about, and since when.
 */
export type LastAction = { issueId: string } & (
	| { state: 'sending' }
	| { state: 'sent'; actionId: string; sentAt: number }
	| { state: 'failed'; code: ErrorCode | undefined }
)

interface PanelActionStore {
	last: LastAction | undefined
	record: (last: LastAction) => void
}

export const usePanelActionStore = create<PanelActionStore>(set => ({
	last: undefined,
	record: last => set({ last }),
}))

/**
 * `POST /panel/g/:token/actions` as the person identified on this device. The daemon carries it out within
 * ~15 s; the status line polls for the outcome. What it records rides the MUTATION's options (bp-30), so it
 * lands even when the card that asked has already left the screen. `onSent` is the caller's UI reset (a draft).
 */
export function usePanelAction({ onSent }: { onSent?: () => void } = {}) {
	const token = usePanelToken()
	const record = usePanelActionStore(state => state.record)
	const mutation = useRequestPanelAction({
		mutation: {
			onMutate: ({ data }) => {
				if (data) record({ issueId: data.issueId, state: 'sending' })
			},
			onSuccess: (sent, { data }) => {
				if (data) record({ issueId: data.issueId, state: 'sent', actionId: sent.actionId, sentAt: Date.now() })
				onSent?.()
			},
			onError: (error, { data }) => {
				if (data) record({ issueId: data.issueId, state: 'failed', code: errorCodeOf(error) })
			},
		},
	})
	return (data: RequestPanelActionMutationRequest) => mutation.mutate({ token, data })
}

/** True while ANY action of this panel is on its way — every acting control waits for it. */
export function usePanelActionPending(): boolean {
	return useIsMutating({ mutationKey: requestPanelActionMutationKey() }) > 0
}
