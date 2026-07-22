import { IconAsterisk, IconChevronRight } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import type { IssueStatus } from '@codedm/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { Dot } from './StatusDot'
import { ThreadAvatar } from './ThreadAvatar'
import { issueStatusDot } from './glyphs'

export interface IssueRowItem {
	issueId: string
	key: string
	title: string
	status: IssueStatus
	meta?: string
	threadId: string
	/** Present on the cross-thread overview (T04); omitted on the per-thread list (T11). */
	threadDisplayName?: string
}

/**
 * One issue in a status-grouped list. NEEDS_INPUT gets the asterisk glyph; the other
 * statuses get a colored dot. Links into the issue drill-down under its thread.
 */
export function IssueRow({ item }: { item: IssueRowItem }) {
	return (
		<Link
			to="/threads/$threadId/issues/$issueId"
			params={{ threadId: item.threadId, issueId: item.issueId }}
			className="flex items-center gap-4 rounded-2xl px-2 py-3 transition-colors hover:bg-muted"
		>
			<span className="flex w-5 shrink-0 justify-center text-muted-foreground">
				{item.status === 'NEEDS_INPUT' ? <IconAsterisk className="size-4" /> : <Dot className={issueStatusDot[item.status]} />}
			</span>
			<div className="flex min-w-0 flex-1 flex-col">
				<span className={cn('truncate font-semibold text-foreground', item.status === 'COMPLETED' && 'text-muted-foreground')}>
					{item.title}
				</span>
				<span className="truncate font-mono text-xs text-muted-foreground">{item.key}</span>
			</div>
			{item.threadDisplayName && (
				<span className="hidden items-center gap-2 rounded-full border border-border px-2.5 py-1 sm:inline-flex">
					<ThreadAvatar name={item.threadDisplayName} size="sm" />
					<span className="max-w-32 truncate text-sm text-foreground">{item.threadDisplayName}</span>
				</span>
			)}
			{item.meta && <span className="hidden shrink-0 font-mono text-xs text-muted-foreground md:inline">{item.meta}</span>}
			<IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
		</Link>
	)
}
