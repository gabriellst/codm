import type { ReactNode } from 'react'
import { create } from 'zustand'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export interface ConfirmOptions {
	title: string
	description?: string
	actionLabel?: string
	cancelLabel?: string
	variant?: 'default' | 'destructive'
}

interface DialogState {
	content: ReactNode | null
	open: boolean
}

interface DialogActions {
	show: (content: ReactNode) => void
	hide: () => void
	confirm: (options: ConfirmOptions) => Promise<boolean>
}

type DialogStore = DialogState & DialogActions

const CLOSE_ANIMATION_MS = 250

export const useDialogStore = create<DialogStore>(set => ({
	content: null,
	open: false,
	show: content => set({ content, open: true }),
	hide: () => {
		set({ open: false })
		setTimeout(() => {
			if (!useDialogStore.getState().open) {
				set({ content: null })
			}
		}, CLOSE_ANIMATION_MS)
	},
	confirm: (options: ConfirmOptions) =>
		new Promise<boolean>(resolve => {
			const close = (result: boolean) => {
				resolve(result)
				set({ open: false })
				setTimeout(() => {
					if (!useDialogStore.getState().open) {
						set({ content: null })
					}
				}, CLOSE_ANIMATION_MS)
			}
			set({
				open: true,
				content: (
					<ConfirmDialog
						title={options.title}
						description={options.description}
						actionLabel={options.actionLabel}
						cancelLabel={options.cancelLabel}
						variant={options.variant}
						onConfirm={() => close(true)}
						onCancel={() => close(false)}
					/>
				),
			})
		}),
}))
