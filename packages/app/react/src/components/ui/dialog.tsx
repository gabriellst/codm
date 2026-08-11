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
				// D3 (R3) — the reference measures every modal scrim at a SOLID `#161616B8`
				// (foreground at 72%), never a blurred translucent black. `foreground/70` is the
				// theme-aware approximation (dark mode inverts for free, same pattern as the
				// alpha-derived neutrals in tokens.css); no `backdrop-blur` — the reference has none.
				'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-foreground/70 duration-200 ease-in-out fixed inset-0 isolate z-50',
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
					// D3 (R3) — was `rounded-asymmetric-2xl` (28px, the D2 measurement); the D3 canvas
					// measures every one of its four modals at "24px 24px 24px 8px" = `rounded-asymmetric-xl`
					// instead. Shadow now reads the shared `--shadow-modal` token (Fase 1) instead of a
					// hand-rolled value — same elevation, one declaration. `overflow-hidden` stays so
					// `DialogFooter`'s flush background bar clips to this exact asymmetric shape.
					'bg-background data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-98 data-open:zoom-in-100 data-closed:slide-out-to-top-2 data-open:slide-in-from-top-2 border border-border shadow-modal grid max-w-[calc(100%-2rem)] gap-4 rounded-asymmetric-xl overflow-hidden p-6 text-sm duration-150 ease-out sm:max-w-md fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none',
					className,
				)}
				{...props}
			>
				{children}
				{showCloseButton && (
					<DialogPrimitive.Close
						data-slot="dialog-close"
						// D2 — no longer forced circular: the reference's modal close button measures
						// "13px 13px 13px 4px" (asymmetric), matching the `icon` size's own default radius now
						// that Button gives icon-only sizes the asymmetric ladder instead of a circle.
						render={<Button variant="ghost" className="absolute top-4 right-4" size="icon" />}
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
			className={cn(
				// D2 — the reference's global link rule is `a{color:#3D660A} a:hover{color:#161616}`:
				// links rest at `--secondary-foreground` (documented as doubling for the link color) and
				// DARKEN to `--foreground` on hover — the existing hover target was already right, the
				// rest-state color was missing (inherited the paragraph's muted-foreground instead).
				'text-muted-foreground *:[a]:text-secondary-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3',
				className,
			)}
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
