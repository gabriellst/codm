import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import type { ThreadStatus } from '@codm/client-typescript/typescript'

// Style map only — the human ThreadStatus label lives in the typed i18n catalog
// (`enums.ThreadStatus.<VALUE>`), rendered via `enumLabel(...)` at the call site (bp-23).
const threadStatusDot: Record<ThreadStatus, string> = {
	RUNNING: 'bg-success',
	IDLE: 'bg-muted-foreground/40',
	NEEDS_ATTENTION: 'bg-warning',
	PAUSED: 'bg-muted-foreground/40',
}

export function Dot({ className, ...props }: ComponentProps<'span'>) {
	return <span className={cn('inline-block size-2 shrink-0 rounded-full', className)} {...props} />
}

export function ThreadStatusDot({ status, className, ...props }: ComponentProps<typeof Dot> & { status: ThreadStatus }) {
	return <Dot className={cn(threadStatusDot[status], className)} {...props} />
}
