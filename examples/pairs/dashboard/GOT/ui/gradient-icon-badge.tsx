// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-ORIGIN · want→got corpus · examples/pairs/dashboard
// repo:    template-fullstack
// branch:  feat/template-polyglot
// source:  packages/app/react/src/components/ui/gradient-icon-badge.tsx
// role:    Primitive — the 'purple coin': gradient glyph in two concentric circles
// Verbatim copy kept as corpus reference — NOT a live module. Do not import it.
// ─────────────────────────────────────────────────────────────────────────────
import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { GradientIcon } from '@/components/ui/gradient-icon'
import type { IconComponent } from '@/components/ui/icons'

const halo = cva('relative inline-flex shrink-0 items-center justify-center rounded-full', {
	variants: { onColor: { false: 'bg-template-purple/15', true: 'bg-current/15' } },
	defaultVariants: { onColor: false },
})

const disc = cva('inline-flex items-center justify-center rounded-full', {
	variants: {
		onColor: {
			false:
				'bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--template-purple),white_14%),var(--template-purple))] text-primary-foreground',
			true: 'bg-current/25 text-current',
		},
	},
	defaultVariants: { onColor: false },
})

interface GradientIconBadgeProps extends ComponentProps<'span'>, VariantProps<typeof halo> {
	icon: IconComponent
}

/**
 * GradientIconBadge — the template "purple coin": a gradient-painted glyph centered in two
 * concentric circles. The disc sets the text color that drives GradientIcon's currentColor
 * gradient. `onColor` inverts the coin for a tinted surface (the highlighted StatCard).
 */
export function GradientIconBadge({ icon, onColor, className, ...props }: GradientIconBadgeProps) {
	return (
		<span className={cn(halo({ onColor }), 'size-12', className)} aria-hidden {...props}>
			<span className={cn(disc({ onColor }), 'size-9')}>
				<GradientIcon icon={icon} className="size-5" />
			</span>
		</span>
	)
}
