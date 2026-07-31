import type { ComponentProps } from 'react'
import { IconAsterisk, IconChevronRight } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import type { IssueStatus } from '@codm/client-typescript/typescript'
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
export function IssueRow({ item, className }: { item: IssueRowItem } & Pick<ComponentProps<'a'>, 'className'>) {
	return (
		<Link
			to="/threads/$threadId/issues/$issueId"
			params={{ threadId: item.threadId, issueId: item.issueId }}
			className={cn('flex items-center gap-2 rounded-2xl px-2 py-3 transition-colors hover:bg-muted', className)}
		>
			<span className="flex w-5 shrink-0 justify-center text-muted-foreground">
				{item.status === 'NEEDS_INPUT' ? <IconAsterisk className="size-4" /> : <Dot className={issueStatusDot[item.status]} />}
			</span>
			{item.threadDisplayName && (
				// `shrink-0`: without it flexbox splits the shortfall between this pill and the title, so a
				// long issue name ate the CONVERSATION's name instead of its own. The issue name is the one
				// that should give way — it is the field this row is already devoting its width to.
				<span className="hidden shrink-0 items-center gap-2 rounded-full border border-border px-2.5 py-1 sm:inline-flex">
					<ThreadAvatar name={item.threadDisplayName} size="sm" />
					<span className="max-w-32 truncate text-sm text-foreground">{item.threadDisplayName}</span>
				</span>
			)}
			<div className="flex min-w-0 flex-1 flex-col">
				{/* `title` keeps the full sentence reachable on hover — an issue title is dictated prose and
				    is regularly longer than the row it has to fit in. */}
				<span
					className={cn('truncate font-semibold text-foreground', item.status === 'COMPLETED' && 'text-muted-foreground')}
					title={item.title}
				>
					{item.title}
				</span>
				<span className="truncate font-mono text-xs text-muted-foreground">{item.key}</span>
			</div>
			{/* `meta` is the agent's COMPLETION SUMMARY — a paragraph, ~340 chars in practice, not a label.
			    It used to be `shrink-0` with no truncate, so it demanded its full intrinsic width: the
			    title column (`flex-1 min-w-0`) collapsed to ZERO and the row still burst out of the page.
			    That is why a long summary made the issue name vanish AND the list scroll sideways — one
			    cause, two symptoms. Capped and truncated, it is now the last thing to get space. */}
			{item.meta && (
				<span className="hidden min-w-0 max-w-48 shrink truncate font-mono text-xs text-muted-foreground md:block" title={item.meta}>
					{item.meta}
				</span>
			)}
			<IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
		</Link>
	)
}
