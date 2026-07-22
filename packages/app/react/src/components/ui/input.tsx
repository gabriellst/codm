import * as React from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '@/lib/utils'

// Input surface — same pattern as Card (opaque --background top → bg+foreground tint bottom).
// Border brightens on hover and brightens further on focus.
const inputBg = 'gradient-bg-[var(--background)_-85%,color-mix(in_oklab,var(--background),var(--foreground)_10%)_110%]'
const inputBorder = 'gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0)_60%]'
const inputBorderFocus = 'focus:gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.05)_100%]'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(function Input({ className, type, ...props }, ref) {
	return (
		<InputPrimitive
			ref={ref}
			type={type}
			data-slot="input"
			className={cn(
				'gradient-box',
				inputBg,
				inputBorder,
				inputBorderFocus,
				// Smooth hover: the gradient-border swap can't tween (--tw-gradient-border is syntax:"*"),
				// so animate a brightness lift instead — same trick the Button uses.
				'transition-[filter] duration-200 ease-in-out hover:brightness-125',
				'rounded-lg px-2.5 py-1 text-sm placeholder:text-muted-foreground',
				'h-8 w-full min-w-0 outline-none',
				'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
				'focus-visible:ring-0',
				className,
			)}
			{...props}
		/>
	)
})

export { Input }
