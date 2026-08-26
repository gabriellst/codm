import * as React from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '../lib/cn'

// CODM input — flat, on the asymmetric ladder like every other control (D3: the settings
// modal's field measures "14px 14px 14px 5px" = `asymmetric-xs`, with the `--input` control
// outline, not the section hairline). The fully-rounded pill this used to be died with the
// button pills in decision 6B. Border darkens toward near-black on focus. No gloss.
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(function Input({ className, type, ...props }, ref) {
	return (
		<InputPrimitive
			ref={ref}
			type={type}
			data-slot="input"
			className={cn(
				'flex h-8 w-full min-w-0 rounded-asymmetric-xs border border-input bg-background px-3.5 py-1 text-sm text-foreground',
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
