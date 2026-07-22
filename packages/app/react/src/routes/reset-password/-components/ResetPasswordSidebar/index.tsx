import * as React from 'react'
import { cn } from '@/lib/utils'

export function ResetPasswordSidebar({ className, ...props }: React.ComponentProps<'aside'>) {
	return (
		<aside className={cn('hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-8 lg:p-12', className)} {...props}>
			<div className="text-white/70 text-sm text-right mt-auto">© 2026 Medscall</div>
		</aside>
	)
}
