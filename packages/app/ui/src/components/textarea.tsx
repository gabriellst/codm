import * as React from 'react'

import { cn } from '../lib/cn'

// Flat CODM surface — same language as <Input>, but a rounded rectangle (a
// pill can't hold multiple lines). Border darkens on hover/focus.
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(function Textarea({ className, ...props }, ref) {
	return (
		<textarea
			ref={ref}
			data-slot="textarea"
			className={cn(
				// D3 — the settings modal's textarea measures "18px 18px 18px 6px" (`asymmetric-md`,
				// was 2xl) with the `--input` control outline, matching <Input>.
				'rounded-asymmetric-md border border-input bg-background px-3.5 py-2.5 text-base md:text-sm text-foreground placeholder:text-muted-foreground',
				'field-sizing-content min-h-16 w-full outline-none transition-colors duration-150 ease-out',
				'hover:border-foreground/25 focus-visible:border-foreground/40 focus-visible:ring-0',
				'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20',
				'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			{...props}
		/>
	)
})

export { Textarea }
