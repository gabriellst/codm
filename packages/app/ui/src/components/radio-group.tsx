import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'

import { cn } from '../lib/cn'
import { IconCircle } from '@tabler/icons-react'

// Same gradient as the card surface (subtle elevation), with a tweakable border.
const radioBg = 'gradient-bg-[var(--background)_-20%,color-mix(in_oklab,var(--background),var(--foreground)_8%)_100%]'
const radioBorder = 'gradient-border-[oklch(from_var(--border)_l_c_h_/_0.2)_0%,oklch(from_var(--border)_l_c_h_/_0.035)_86%]'

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
	return <RadioGroupPrimitive data-slot="radio-group" className={cn('grid gap-2 w-full', className)} {...props} />
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
	return (
		<RadioPrimitive.Root
			data-slot="radio-group-item"
			className={cn(
				'gradient-box',
				radioBg,
				radioBorder,
				'cursor-pointer text-primary focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 flex size-4 rounded-full focus-visible:ring-[0.1875rem] aria-invalid:ring-[0.1875rem] group/radio-group-item peer relative aspect-square shrink-0 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			{...props}
		>
			<RadioPrimitive.Indicator
				data-slot="radio-group-indicator"
				className="group-aria-invalid/radio-group-item:text-destructive text-primary flex size-4 items-center justify-center"
			>
				<IconCircle className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 fill-current" />
			</RadioPrimitive.Indicator>
		</RadioPrimitive.Root>
	)
}

export { RadioGroup, RadioGroupItem }
