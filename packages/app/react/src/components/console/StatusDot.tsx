import { cn } from '@/lib/utils'
import type { ThreadStatus } from '@codedm/client-typescript/typescript'

const threadStatusDot: Record<ThreadStatus, string> = {
	RUNNING: 'bg-success',
	IDLE: 'bg-muted-foreground/40',
	NEEDS_ATTENTION: 'bg-warning',
	PAUSED: 'bg-muted-foreground/40',
}

export const threadStatusLabel: Record<ThreadStatus, string> = {
	RUNNING: 'Running',
	IDLE: 'Idle',
	NEEDS_ATTENTION: 'Needs attention',
	PAUSED: 'Paused',
}

export function Dot({ className }: { className?: string }) {
	return <span className={cn('inline-block size-2 shrink-0 rounded-full', className)} />
}

export function ThreadStatusDot({ status, className }: { status: ThreadStatus; className?: string }) {
	return <Dot className={cn(threadStatusDot[status], className)} />
}
