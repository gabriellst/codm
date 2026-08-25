import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../lib/cn'

function Empty({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="empty"
			className={cn(
				'gap-4 rounded-asymmetric-lg border-dashed p-6 flex w-full min-w-0 flex-1 flex-col items-center justify-center text-center text-balance',
				className,
			)}
			{...props}
		/>
	)
}

function EmptyHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="empty-header" className={cn('gap-2 flex max-w-sm flex-col items-center', className)} {...props} />
}

const emptyMediaVariants = cva('mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0', {
	variants: {
		variant: {
			default: 'bg-transparent',
			// D2 — height-tier derivation (size-8 → xs), matching Button's own icon-default mapping.
			icon: "bg-muted flex size-8 shrink-0 items-center justify-center rounded-asymmetric-xs [&_svg:not([class*='size-'])]:size-4",
		},
	},
	defaultVariants: {
		variant: 'default',
	},
})

function EmptyMedia({ className, variant = 'default', ...props }: React.ComponentProps<'div'> & VariantProps<typeof emptyMediaVariants>) {
	return <div data-slot="empty-icon" data-variant={variant} className={cn(emptyMediaVariants({ variant, className }))} {...props} />
}

function EmptyTitle({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="empty-title" className={cn('text-sm font-medium tracking-tight', className)} {...props} />
}

function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>) {
	return (
		<div
			data-slot="empty-description"
			// D2 — link rest color follows the reference's link rule (`--secondary-foreground`); hover
			// DARKENS to `--foreground`, replacing the old hover-to-`primary` (brighten) direction.
			className={cn(
				'text-sm/relaxed text-muted-foreground [&>a]:text-secondary-foreground [&>a:hover]:text-foreground [&>a]:underline [&>a]:underline-offset-4',
				className,
			)}
			{...props}
		/>
	)
}

function EmptyContent({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="empty-content"
			className={cn('gap-2.5 text-sm flex w-full max-w-sm min-w-0 flex-col items-center text-balance', className)}
			{...props}
		/>
	)
}

export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia }
