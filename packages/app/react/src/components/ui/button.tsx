import * as React from 'react'
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// CODM buttons are flat. D2 — the brand green (`--primary`) is now the sole action color
// (`default`); everything else stays close to monochrome (hairline outline, soft-gray
// secondary, ghost, underline link). Sentence case — labels are NOT uppercased (that voice
// is reserved for display headings). Text-bearing sizes stay fully-rounded pills (the
// reference's CTAs — "Nova conversa", "Conectar canal" — are all 999px); icon-only sizes
// switch to the asymmetric ladder (the reference's icon-only utility buttons — back-nav,
// pause, settings gear, modal close — measure 13-16px on one matched corner + a ~1/3 bottom-
// left, never a circle), stepped by the button's own height so the shape stays proportional.
const buttonVariants = cva(
	"focus-visible:ring-ring/40 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 text-sm font-medium focus-visible:ring-2 aria-invalid:ring-2 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all duration-150 ease-out cursor-pointer disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85 font-semibold',
				primaryAlt: 'bg-foreground text-background hover:bg-foreground/90 font-semibold',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/60',
				// D2 — the reference's bordered pill toggle ("Mostrar arquivadas") hovers by darkening
				// the BORDER to primary green, not by filling the background (`border:1.5px solid #dcdcdc`
				// → hover `border-color:#76C410`); `#dcdcdc` is the measured `--input` token exactly, so
				// the rest-state border switches from the generic `--border` hairline to `--input`.
				outline: 'border border-input bg-background text-foreground hover:border-primary active:bg-muted/70',
				ghost: 'border border-transparent text-foreground hover:bg-muted aria-expanded:bg-muted',
				destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold',
				warning: 'border border-warning/40 text-warning hover:bg-warning/10 aria-expanded:bg-warning/10',
				link: 'text-foreground underline-offset-4 hover:underline aria-expanded:underline',
			},
			size: {
				default: 'h-8 gap-1.5 px-3.5 rounded-full has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
				xs: "h-6 gap-1 px-2.5 text-xs rounded-full has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1 px-3 text-sm rounded-full has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: 'h-9 gap-1.5 px-5 rounded-full has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4',
				icon: 'size-8 rounded-asymmetric-xs',
				'icon-xs': "size-6 rounded-asymmetric-3xs [&_svg:not([class*='size-'])]:size-3",
				'icon-sm': 'size-7 rounded-asymmetric-2xs',
				'icon-lg': 'size-9 rounded-asymmetric-sm',
				none: '',
			},
		},
		compoundVariants: [
			{
				// D2 — every icon-only utility button in the reference (back-nav, "+" new conversation,
				// pause, settings gear, modal close) hovers to the secondary pastel (`#EAF6D3`), never the
				// neutral gray `hover:bg-muted` that plain text/list-row hovers use. Scoped to icon sizes
				// only — a text ghost button (menu item, calendar chevron) keeps the neutral hover.
				variant: 'ghost',
				size: ['icon', 'icon-xs', 'icon-sm', 'icon-lg'],
				class: 'hover:bg-secondary aria-expanded:bg-secondary',
			},
		],
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
)

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, ...props }, ref) {
	return <ButtonPrimitive ref={ref} data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
})

export { Button, buttonVariants }
