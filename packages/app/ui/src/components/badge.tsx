import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../lib/cn'

// CODM badges are monochrome pills. Status lives in a small colored leading dot
// (a `before:` pseudo, spaced by the flex `gap`), never in the fill — the pill itself
// stays neutral gray/hairline. `default` is the dominant soft-gray tag
// (git · Detected · Connected · 3 files).
//
// THE DOT'S GEOMETRY BELONGS TO THE STATUS VARIANTS, NOT THE BASE. Tailwind injects
// `content: var(--tw-content, "")` into every `before:*` utility, so keeping
// `before:size-1.5 before:rounded-full` on the base GENERATED the pseudo-element on
// EVERY badge — including `default`/`secondary`/`outline`, which have no dot to show.
// The result was an invisible 6px box plus its `gap` in front of the label of every
// non-status badge in the app (visible in devtools as a `::before` under the span).
// Now only the variants that set a `before:bg-*` carry the geometry, so a badge with
// no status renders nothing but its text.

// D2 — badges switch from a full pill to the asymmetric ladder. Pills (999px) stay reserved for
// segmented controls, which the reference keeps visually distinct from status tags (buttons left
// the pill shape in the D3 merge, decision 6B — every button size rides the asymmetric ladder now).
//
// D3 (R9) — the ladder step moved off the base and onto `size`. The D2 pass put every badge at
// the ladder's smallest step (`3xs`, 9px) reading six status chips in the reference; the D3
// canvas measures the MAJORITY of chips (workspace tags, channel status, project chips — 10×) at
// the next step up (`2xs`, 12px) and reserves `3xs` for a specific minority (the session-loop
// interval/day chips). `size="default"` is now 2xs; `size="compact"` is the old 3xs — pass it
// explicitly on the loop chips (`ThreadSettingsDialog/LoopsSection.tsx`) to keep their shape,
// nowhere else defaults to it.
const badgeVariants = cva(
	'h-5 gap-1.5 border border-transparent px-2.5 py-0.5 text-xs font-medium transition-all has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&>svg]:size-3! inline-flex items-center justify-center w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[0.1875rem] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive overflow-hidden group/badge',
	{
		variants: {
			// The leading dot, spelled out per status variant: content + geometry + color travel
			// together, so a variant either draws a dot or generates no pseudo-element at all.
			variant: {
				default: 'bg-muted text-foreground [a]:hover:bg-secondary',
				secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
				solid: 'bg-primary text-primary-foreground [a]:hover:bg-primary/90',
				destructive:
					"bg-muted text-foreground before:content-[''] before:shrink-0 before:size-1.5 before:rounded-full before:bg-destructive",
				outline: 'border-border text-foreground [a]:hover:bg-muted',
				ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
				link: 'text-foreground underline-offset-4 hover:underline',
				success: "bg-muted text-foreground before:content-[''] before:shrink-0 before:size-1.5 before:rounded-full before:bg-success",
				info: "bg-muted text-foreground before:content-[''] before:shrink-0 before:size-1.5 before:rounded-full before:bg-info",
				warning: "bg-muted text-foreground before:content-[''] before:shrink-0 before:size-1.5 before:rounded-full before:bg-warning",
				error: "bg-muted text-foreground before:content-[''] before:shrink-0 before:size-1.5 before:rounded-full before:bg-destructive",
			},
			size: {
				default: 'rounded-asymmetric-2xs',
				compact: 'rounded-asymmetric-3xs',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

function Badge({
	className,
	variant = 'default',
	size = 'default',
	render,
	...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: 'span',
		props: mergeProps<'span'>(
			{
				className: cn(badgeVariants({ className, variant, size })),
			},
			props,
		),
		render,
		state: {
			slot: 'badge',
			variant,
		},
	})
}

export { Badge, badgeVariants }
