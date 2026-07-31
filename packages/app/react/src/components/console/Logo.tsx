import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import CodmLogoIcon from '@/components/ui/icons/codmLogo'

/** The CODM wordmark, rendered from the designed brand mark asset. */
export function Logo({ className, ...props }: ComponentProps<'span'>) {
	return (
		<span className={cn('inline-flex items-center text-foreground', className)} {...props}>
			<CodmLogoIcon className="h-7 w-auto" />
		</span>
	)
}
