import * as React from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '@/lib/utils'

// CODM input — flat, fully-rounded pill with a hairline border that darkens to
// near-black on focus. No gloss. Matches the search fields in the product shots.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(function Input({ className, type, ...props }, ref) {
	return (
		<InputPrimitive
			ref={ref}
			type={type}
			data-slot="input"
			className={cn(
				'flex h-8 w-full min-w-0 rounded-full border border-border bg-background px-3.5 py-1 text-sm text-foreground',
				'placeholder:text-muted-foreground',
				'transition-colors duration-150 ease-out outline-none',
				'hover:border-foreground/25 focus-visible:border-foreground/40 focus-visible:ring-0',
				'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20',
				'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			{...props}
		/>
	)
})

export { Input }
