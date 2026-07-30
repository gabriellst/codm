import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/*
 * "Code" + "DM" are the product name — a brand wordmark, never localized. The i18n rail doesn't
 * apply to a proper noun, so it's disabled for this one-line mark.
 */
/* eslint-disable local/no-hardcoded-jsx-text */
/** The CODM wordmark: "Code" in ink, "DM" in a black pill. */
export function Logo({ className, ...props }: ComponentProps<'span'>) {
	return (
		<span className={cn('inline-flex items-center text-xl font-bold tracking-tight text-foreground', className)} {...props}>
			Code
			<span className="ml-1 rounded-lg bg-primary px-1.5 py-0.5 text-primary-foreground">DM</span>
		</span>
	)
}
