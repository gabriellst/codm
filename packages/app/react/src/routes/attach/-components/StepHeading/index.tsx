import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Centered title + subtitle shared by every attach step (the pair's per-step heading). */
export function StepHeading({ title, subtitle, className, ...props }: ComponentProps<'div'> & { title: string; subtitle: string }) {
	return (
		<div className={cn('flex flex-col items-center gap-2 pb-6 text-center', className)} {...props}>
			<h1 className="heading-display text-3xl text-foreground md:text-4xl">{title}</h1>
			<p className="text-muted-foreground">{subtitle}</p>
		</div>
	)
}
