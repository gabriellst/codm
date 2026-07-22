import * as React from 'react'

import { cn } from '@/lib/utils'
import type { IconComponent } from '@/components/ui/icons'

interface GradientIconProps extends React.ComponentProps<'span'> {
	icon: IconComponent
	/** SVG property the gradient paints: 'fill' for the app's filled icons (default), 'stroke' for line icons. */
	paint?: 'fill' | 'stroke'
	/** Gradient stop opacities, top -> bottom. */
	from?: number
	to?: number
}

/**
 * GradientIcon — paints an icon with a vertical currentColor gradient (opacity `from`->`to`).
 * Tint via a text color on the element (e.g. text-primary-foreground). The icon fills its box
 * (size via className) and is centered. `paint` selects fill vs stroke so it works for both the
 * app's fill-based custom icons and stroke-based line icons.
 *
 * The gradient is applied to the icon's `<path>`s via a CSS rule (`[&_path]:fill-…`), not just an
 * inline style on the `<svg>`: the app's icons set `fill="currentColor"` directly on their paths,
 * and a path's presentation attribute beats an inherited svg style — only a CSS declaration on the
 * path overrides it. The svg-level style stays as a fallback for icons whose shapes inherit it.
 */
export function GradientIcon({ icon: Icon, className, paint = 'fill', from = 1, to = 0.55, ...spanProps }: GradientIconProps) {
	const id = `gi-${React.useId().replace(/:/g, '')}`
	const RenderIcon = Icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>
	const paintClass = paint === 'fill' ? '[&_path]:fill-[var(--gi-paint)]' : '[&_path]:stroke-[var(--gi-paint)]'
	return (
		<span className={cn('relative inline-flex shrink-0 items-center justify-center', className)} {...spanProps}>
			{/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative 0×0 gradient definition, aria-hidden */}
			<svg width="0" height="0" className="absolute" aria-hidden>
				<defs>
					<linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor="currentColor" stopOpacity={from} />
						<stop offset="100%" stopColor="currentColor" stopOpacity={to} />
					</linearGradient>
				</defs>
			</svg>
			<RenderIcon
				className={cn('size-4', paintClass)}
				style={{ '--gi-paint': `url(#${id})`, [paint]: `url(#${id})` } as React.CSSProperties}
			/>
		</span>
	)
}
