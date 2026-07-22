// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-ORIGIN · want→got corpus · examples/pairs/dashboard
// repo:    template-fullstack
// branch:  feat/template-polyglot
// source:  packages/app/react/src/components/ui/button.tsx
// role:    Primitive — gradient-box button variants (default/outline/destructive via gradient-bg/border utilities)
// Verbatim copy kept as corpus reference — NOT a live module. Do not import it.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from 'react'
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { trigger } from './surfaces'

// Per-variant gradients local to this file. `secondary` uses the shared `trigger`
// preset (see surfaces.ts); everything else has variant-specific colors that don't
// repeat across the system.

const primaryBg = 'gradient-bg-[var(--primary),var(--primary)]'
const primaryBorder =
	'gradient-border-[oklch(from_var(--primary-foreground)_l_c_h_/_0.2)_0%,oklch(from_var(--primary-foreground)_l_c_h_/_0.035)_86%]'

const primaryAltBg = 'gradient-bg-[var(--foreground)_0%,var(--background)_200%]'
// const primaryAltBorder = '' — primaryAlt intentionally has no gradient border

const outlineBg = 'gradient-bg-[var(--background)_-20%,color-mix(in_oklab,var(--background),var(--foreground)_6%)_160%]'
const outlineBorder = 'gradient-border-[oklch(from_var(--border)_l_c_h_/_0.2)_0%,oklch(from_var(--border)_l_c_h_/_0.05)_100%]'

const destructiveBg = 'gradient-bg-[var(--destructive),var(--destructive)]'
const destructiveBorder =
	'gradient-border-[oklch(from_var(--destructive-foreground)_l_c_h_/_0.3)_0%,oklch(from_var(--destructive-foreground)_l_c_h_/_0.035)_86%]'

const buttonVariants = cva(
	"focus-visible:border-ring focus-visible:ring-ring/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-lg text-sm font-medium focus-visible:ring-2 aria-invalid:ring-2 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all duration-200 ease-in-out cursor-pointer disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
	{
		variants: {
			variant: {
				default: `gradient-box ${primaryBg} ${primaryBorder} hover:brightness-90 text-primary-foreground font-semibold`,
				primaryAlt: `gradient-box ${primaryAltBg} hover:brightness-90 text-secondary-foreground font-semibold`,
				secondary: `${trigger}`,
				outline: `gradient-box ${outlineBg} ${outlineBorder} hover:brightness-90`,
				ghost: 'border border-transparent hover:bg-hover hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
				destructive: `gradient-box ${destructiveBg} ${destructiveBorder} hover:brightness-90 text-destructive-foreground font-semibold`,
				warning:
					'bg-warning/10 hover:bg-warning/20 active:bg-warning/25 focus-visible:ring-warning/20 dark:bg-warning/15 text-warning border border-warning/30 hover:border-warning/50 focus-visible:border-warning/40 disabled:text-muted-foreground',
				link: 'text-primary underline-offset-4 hover:underline hover:text-primary/80',
			},
			size: {
				default: 'h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
				xs: "h-6 gap-1 rounded-lg px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1 rounded-lg px-2.5 text-sm in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
				icon: 'size-8',
				'icon-xs': "size-6 rounded-lg in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
				'icon-sm': 'size-7 rounded-lg in-data-[slot=button-group]:rounded-lg',
				'icon-lg': 'size-9',
				none: '',
			},
		},
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
