import type { ComponentProps } from 'react'
import { IconTrash } from '@tabler/icons-react'
import { DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

// `children`/`showCloseButton` are owned by this component — the body is fixed (title/description/
// footer) and the close button is force-hidden (dismissal is the two explicit buttons, not an X).
export interface ConfirmDialogProps extends Omit<ComponentProps<typeof DialogContent>, 'children' | 'showCloseButton'> {
	title: string
	description?: string
	actionLabel?: string
	cancelLabel?: string
	pendingLabel?: string
	isPending?: boolean
	variant?: 'default' | 'destructive'
	onConfirm: () => void
	onCancel: () => void
}

export function ConfirmDialog({
	title,
	description,
	actionLabel = 'Confirmar',
	cancelLabel = 'Cancelar',
	pendingLabel,
	isPending = false,
	variant = 'default',
	onConfirm,
	onCancel,
	...props
}: ConfirmDialogProps) {
	return (
		<DialogContent {...props} showCloseButton={false}>
			<DialogHeader>
				{/* D3 (R2/R18) — every destructive confirm in the reference (delete-project,
				    delete-thread, delete-loop, delete-account) leads with the same danger badge:
				    a trash glyph on the low-chroma `attention-surface` tint. `variant==='default'`
				    confirms (nothing in this app uses one yet, but the type allows it) get no badge —
				    the badge IS the destructive signal, not decoration every confirm should carry. */}
				{variant === 'destructive' && (
					<span
						data-slot="confirm-dialog-icon"
						className="flex size-11 items-center justify-center rounded-asymmetric-sm bg-attention-surface text-destructive"
					>
						<IconTrash className="size-5" />
					</span>
				)}
				<DialogTitle>{title}</DialogTitle>
				{description && <DialogDescription>{description}</DialogDescription>}
			</DialogHeader>
			<DialogFooter>
				<Button variant="outline" onClick={onCancel} disabled={isPending}>
					{cancelLabel}
				</Button>
				<Button variant={variant} onClick={onConfirm} disabled={isPending}>
					{isPending && <Spinner className="mr-2" />}
					{isPending && pendingLabel ? pendingLabel : actionLabel}
				</Button>
			</DialogFooter>
		</DialogContent>
	)
}
