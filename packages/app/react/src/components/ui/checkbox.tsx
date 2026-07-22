import * as React from 'react'
import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'

import { cn } from '@/lib/utils'
import { IconCheck } from '@tabler/icons-react'

// Base (unchecked): subtle elevation over bg.
const checkboxBg =
	'gradient-bg-[color-mix(in_oklab,var(--background),var(--foreground)_2%)_0%,color-mix(in_oklab,var(--background),var(--foreground)_75%)_700%]'
const checkboxBorder = 'gradient-border-[oklch(from_var(--border)_l_c_h_/_0.2)_0%,oklch(from_var(--border)_l_c_h_/_0)_100%]'

// Checked: flip both layers — fill becomes solid --primary, border becomes a primary-foreground highlight.
const checkboxCheckedBg = 'data-checked:gradient-bg-[var(--primary),var(--primary)]'
const checkboxCheckedBorder =
	'data-checked:gradient-border-[oklch(from_var(--primary-foreground)_l_c_h_/_0.25)_0%,oklch(from_var(--primary-foreground)_l_c_h_/_0.08)_100%]'

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxPrimitive.Root.Props>(function Checkbox({ className, ...props }, ref) {
	return (
		<CheckboxPrimitive.Root
			ref={ref}
			data-slot="checkbox"
			className={cn(
				'gradient-box',
				checkboxBg,
				checkboxBorder,
				checkboxCheckedBg,
				checkboxCheckedBorder,
				'cursor-pointer flex size-5 items-center justify-center rounded-sm data-checked:text-primary-foreground focus-visible:ring-ring/50 focus-visible:ring-[0.1875rem] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:ring-[0.1875rem] peer relative shrink-0 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50 group-has-disabled/field:opacity-50',
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="[&>svg]:size-3.5 grid place-content-center text-current transition-none"
			>
				<IconCheck />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	)
})

export { Checkbox }
