import * as React from 'react'
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// CodeDM buttons are flat, fully-rounded pills. Black is the sole action color
// (`default`); everything else is monochrome (hairline outline, soft-gray, ghost,
// underline link). Sentence case — labels are NOT uppercased (that voice is reserved
// for display headings). Icon sizes become perfect circles via the rounded-full base.

const buttonVariants = cva(
	"focus-visible:ring-ring/40 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 rounded-full text-sm font-medium focus-visible:ring-2 aria-invalid:ring-2 [&_svg:not([class*='size-'])]:size-4 inline-flex items-center justify-center whitespace-nowrap transition-all duration-150 ease-out cursor-pointer disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 outline-none group/button select-none",
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85 font-semibold',
				primaryAlt: 'bg-foreground text-background hover:bg-foreground/90 font-semibold',
				secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70 active:bg-secondary/60',
				outline: 'border border-border bg-background text-foreground hover:bg-muted active:bg-muted/70',
				ghost: 'border border-transparent text-foreground hover:bg-muted aria-expanded:bg-muted',
				destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 font-semibold',
				warning: 'border border-warning/40 text-warning hover:bg-warning/10 aria-expanded:bg-warning/10',
				link: 'text-foreground underline-offset-4 hover:underline aria-expanded:underline',
			},
			size: {
				default: 'h-8 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
				xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1 px-3 text-sm has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
				lg: 'h-9 gap-1.5 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4',
				icon: 'size-8',
				'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
				'icon-sm': 'size-7',
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
