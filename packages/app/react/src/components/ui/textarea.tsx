import * as React from 'react'

import { cn } from '@/lib/utils'

// Same gradient/hover/focus pattern as <Input>. Tweak alongside input.tsx.
const textareaBg = 'gradient-bg-[var(--background)_0%,color-mix(in_oklab,var(--background),var(--foreground)_10%)_110%]'
const textareaBorder = 'gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0)_60%]'
const textareaBorderHover =
	'hover:gradient-border-[oklch(from_var(--border)_l_c_h_/_0.3)_0%,oklch(from_var(--border)_l_c_h_/_0.2)_100%]'
const textareaBorderFocus =
	'focus:gradient-border-[oklch(from_var(--border)_l_c_h_/_0.35)_0%,oklch(from_var(--border)_l_c_h_/_0.35)_100%]'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(function Textarea({ className, ...props }, ref) {
	return (
		<textarea
			ref={ref}
			data-slot="textarea"
			className={cn(
				'gradient-box',
				textareaBg,
				textareaBorder,
				textareaBorderHover,
				textareaBorderFocus,
				'rounded-lg px-2.5 py-2 text-base md:text-sm placeholder:text-muted-foreground',
				'field-sizing-content min-h-16 w-full outline-none transition-colors',
				'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:ring-[0.1875rem]',
				'focus-visible:ring-ring/50 focus-visible:ring-[0.1875rem]',
				'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			{...props}
		/>
	)
})

export { Textarea }
