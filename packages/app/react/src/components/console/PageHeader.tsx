import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The recurring page masthead, D3 shape: a heavy display title with an optional status line
 * directly beneath it, and a right-aligned action slot.
 *
 * Two things this component USED to have are gone by design (D3, founder 11/08/2026):
 * - The circular back button — no screen in the design carries one; the rail is the only "up".
 * - The generic subtitle-as-decoration. `subtitle` stays as a prop but it is the HOME status
 *   line ("3 agentes trabalhando agora") glued under the title — the one place the design keeps
 *   text there. Where a subtitle carried DATA (the issues stats line), it moved into the page
 *   body as its first line instead — don't route it back through here.
 */
export function PageHeader({
	title,
	subtitle,
	action,
	className,
	...props
}: ComponentProps<'div'> & {
	title: ReactNode
	subtitle?: ReactNode
	action?: ReactNode
}) {
	return (
		<div className={cn('flex items-start justify-between gap-4', className)} {...props}>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<h1 className="heading-display text-3xl text-foreground">{title}</h1>
				{subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
			</div>
			{action && <div className="shrink-0">{action}</div>}
		</div>
	)
}
