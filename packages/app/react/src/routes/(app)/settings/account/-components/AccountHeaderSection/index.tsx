import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

interface AccountHeaderSectionProps extends ComponentProps<'div'> {
	title: string
}

/**
 * AccountHeaderSection — simple page title row for the account settings page.
 * Receives the title as a prop so the parent route can supply the translated string.
 */
export function AccountHeaderSection({ title, className, ...props }: AccountHeaderSectionProps) {
	return (
		<div className={cn('flex flex-col gap-1', className)} {...props}>
			<h1 className="text-2xl font-bold text-foreground">{title}</h1>
		</div>
	)
}
