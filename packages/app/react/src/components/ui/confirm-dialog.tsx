import type { ComponentProps } from 'react'
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
