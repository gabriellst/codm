import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { IconX } from '@tabler/icons-react'

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
	return (
		<DialogPrimitive.Backdrop
			data-slot="dialog-overlay"
			className={cn(
				'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/20 dark:bg-black/40 duration-200 ease-in-out supports-backdrop-filter:backdrop-blur-sm fixed inset-0 isolate z-50',
				className,
			)}
			{...props}
		/>
	)
}

function DialogContent({
	className,
	children,
	showCloseButton = true,
	...props
}: DialogPrimitive.Popup.Props & {
	showCloseButton?: boolean
}) {
	const { t } = useTranslation()
	return (
		<DialogPortal>
			<DialogOverlay />
			<DialogPrimitive.Popup
				data-slot="dialog-content"
				className={cn(
					'bg-background data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-98 data-open:zoom-in-100 data-closed:slide-out-to-top-2 data-open:slide-in-from-top-2 border border-border shadow-[0_16px_48px_-12px_rgb(0_0_0/0.22)] grid max-w-[calc(100%-2rem)] gap-4 rounded-2xl p-6 text-sm duration-150 ease-out sm:max-w-md fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none',
					className,
				)}
				{...props}
			>
				{children}
				{showCloseButton && (
					<DialogPrimitive.Close
						data-slot="dialog-close"
						// Circular, per the design — the whole system is pill-heavy (999px is its dominant radius),
						// and a squared close button was the one control that read as a different vocabulary.
						render={<Button variant="secondary" className="absolute top-4 right-4 rounded-full" size="icon" />}
					>
						<IconX />
						<span className="sr-only">{t('common.close')}</span>
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Popup>
		</DialogPortal>
	)
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="dialog-header" className={cn('gap-2 flex flex-col', className)} {...props} />
}

function DialogFooter({
	className,
	showCloseButton = false,
	children,
	...props
}: React.ComponentProps<'div'> & {
	showCloseButton?: boolean
}) {
	const { t } = useTranslation()
	return (
		<div
			data-slot="dialog-footer"
			className={cn(
				'bg-muted/40 -mx-6 -mb-6 rounded-b-2xl border-t border-border p-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
				className,
			)}
			{...props}
		>
			{children}
			{showCloseButton && <DialogPrimitive.Close render={<Button variant="outline" />}>{t('common.close')}</DialogPrimitive.Close>}
		</div>
	)
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
	return <DialogPrimitive.Title data-slot="dialog-title" className={cn('text-lg leading-snug font-semibold', className)} {...props} />
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
	return (
		<DialogPrimitive.Description
			data-slot="dialog-description"
			className={cn('text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3', className)}
			{...props}
		/>
	)
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
}
