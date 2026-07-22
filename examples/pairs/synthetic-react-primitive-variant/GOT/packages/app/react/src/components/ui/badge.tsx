// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-react-primitive-variant
// task:        synthetic-react-primitive-variant
// stamp:       agent-wave1-38ff876
// docTreeHash: 213519a54e23
// model:       sonnet
// graded:      2026-07-21T23:33:24.162Z
// source:      packages/app/react/src/components/ui/badge.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'
import { IconX } from '@tabler/icons-react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
	'rounded-4xl border border-transparent font-medium transition-all inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[0.1875rem] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-colors overflow-hidden group/badge',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
				secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
				destructive:
					'bg-destructive/10 [a]:hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive dark:bg-destructive/20 border-destructive/30',
				outline: 'border-border [a]:hover:bg-muted [a]:hover:text-muted-foreground',
				ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
				link: 'text-primary underline-offset-4 hover:underline',
				success: 'bg-success/10 text-success border-success/30 [a]:hover:bg-success/20',
				info: 'bg-info/10 text-info border-info/30 [a]:hover:bg-info/20',
				warning: 'bg-warning/10 text-warning border-warning/30 [a]:hover:bg-warning/20',
				error:
					'bg-destructive/10 [a]:hover:bg-destructive/20 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 text-destructive dark:bg-destructive/20 border-destructive/30',
			},
			size: {
				sm: 'h-4 gap-0.5 px-1.5 py-0 text-xs has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&>svg]:size-2.5!',
				default: 'h-5 gap-1 px-2 py-0.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:size-3!',
				lg: 'h-6 gap-1.5 px-2.5 py-1 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&>svg]:size-3.5!',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

// Dismissal is caller state (see onDismiss) — dismissLabel is required alongside it so the
// control always has an accessible name; the primitive never invents one (see info-hint.tsx).
type BadgeDismissProps = { onDismiss?: undefined; dismissLabel?: never } | { onDismiss: () => void; dismissLabel: string }

type BadgeProps = useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & BadgeDismissProps

function Badge({ className, variant = 'default', size = 'default', render, onDismiss, dismissLabel, children, ...props }: BadgeProps) {
	return useRender({
		defaultTagName: 'span',
		props: mergeProps<'span'>(
			{
				className: cn(badgeVariants({ className, variant, size })),
				children: (
					<>
						{children}
						{onDismiss ? (
							<button
								type="button"
								data-slot="badge-dismiss"
								aria-label={dismissLabel}
								onClick={onDismiss}
								onKeyDown={event => {
									if (event.key === 'Delete' || event.key === 'Backspace') {
										event.preventDefault()
										onDismiss()
									}
								}}
								className="-mr-0.5 ml-0.5 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full p-0.5 text-current/70 outline-none transition-colors hover:bg-current/10 hover:text-current focus-visible:text-current focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
							>
								<IconX aria-hidden="true" className="size-3" />
							</button>
						) : null}
					</>
				),
			},
			props,
		),
		render,
		state: {
			slot: 'badge',
			variant,
			size,
		},
	})
}

export { Badge, badgeVariants }
