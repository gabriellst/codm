import { cn } from '@/lib/utils'
import type { ThreadStatus } from '@codedm/client-typescript/typescript'

// Style map only — the human ThreadStatus label lives in the typed i18n catalog
// (`enums.ThreadStatus.<VALUE>`), rendered via `enumLabel(...)` at the call site (bp-23).
const threadStatusDot: Record<ThreadStatus, string> = {
	RUNNING: 'bg-success',
	IDLE: 'bg-muted-foreground/40',
	NEEDS_ATTENTION: 'bg-warning',
	PAUSED: 'bg-muted-foreground/40',
}

export function Dot({ className }: { className?: string }) {
	return <span className={cn('inline-block size-2 shrink-0 rounded-full', className)} />
}

export function ThreadStatusDot({ status, className }: { status: ThreadStatus; className?: string }) {
	return <Dot className={cn(threadStatusDot[status], className)} />
}
