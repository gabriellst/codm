import type { ComponentProps } from 'react'
import { IconChevronRight } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import type { IssueStatus } from '@codm/client-typescript/typescript'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { row } from '@/components/ui/surfaces'
import { Badge } from '@/components/ui/badge'
import { Dot } from './StatusDot'
import { ThreadAvatar } from './ThreadAvatar'
import { issueStatusChipClass, issueStatusDot } from './glyphs'

export interface IssueRowItem {
	issueId: string
	key: string
	title: string
	status: IssueStatus
	meta?: string
	/** Drives the row SHAPE (D3): archived items render the identity row (avatar + result),
	 *  active ones render the status row (dot + chip). Present on both overview endpoints. */
	archived: boolean
	threadId: string
	/** Present on the cross-thread overview (T04); omitted on the per-thread list (T11). */
	threadDisplayName?: string
}

/**
 * One issue row — TWO shapes, switched on `item.archived` (D3, JcWnl group). Neither shape shows
 * a per-row timestamp: the design's active-row "há 6 min" has no backing field on either
 * `GetIssuesOverview`/`GetSessionIssues` (no createdAt/updatedAt on the wire) — flagged as a
 * pending backend gap rather than invented client-side, per "NADA de SDK/contratos" for this pass.
 *
 * - ACTIVE (status-grouped sections): leading colored dot (`issueStatusDot`) + key (bold mono) +
 *   description (muted) + a trailing status chip (`issueStatusChipClass`). No avatar, no chevron —
 *   matches the "Tarefas" grouped sections exactly (wJXCG in the design).
 * - ARCHIVED: leading thread avatar + small thread-name label + bold title + mono key + the
 *   agent's completion summary (`meta`, right-aligned) + chevron (GC09s in the design). The avatar
 *   column only renders when `threadDisplayName` is present — the per-thread list (T11) never sets
 *   it, so that consumer keeps a plain identity-less row instead of an empty gap.
 */
export function IssueRow({ item, className }: { item: IssueRowItem } & Pick<ComponentProps<'a'>, 'className'>) {
	if (item.archived) {
		return (
			<Link
				to="/threads/$threadId/issues/$issueId"
				params={{ threadId: item.threadId, issueId: item.issueId }}
				className={cn('group flex items-center gap-3.5 rounded-asymmetric-sm bg-background p-3.5', row, className)}
			>
				{item.threadDisplayName && (
					<div className="flex shrink-0 flex-col items-center gap-0.5">
						<ThreadAvatar name={item.threadDisplayName} size="sm" />
					</div>
				)}
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					{item.threadDisplayName && (
						<span className="truncate text-xs font-semibold text-caption-foreground">{item.threadDisplayName}</span>
					)}
					{/* `title` keeps the full sentence reachable on hover — an issue title is dictated prose and
					    is regularly longer than the row it has to fit in. */}
					<span className="truncate font-bold text-foreground" title={item.title}>
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
				<IconChevronRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
			</Link>
		)
	}

	return (
		<Link
			to="/threads/$threadId/issues/$issueId"
			params={{ threadId: item.threadId, issueId: item.issueId }}
			className={cn('group flex items-center gap-3 rounded-asymmetric-sm bg-background p-3.5', row, className)}
		>
			<span className="flex w-4 shrink-0 justify-center">
				<Dot className={issueStatusDot[item.status]} />
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate font-mono text-sm font-bold text-foreground">{item.key}</span>
				{/* `title` doubles as the row's DESCRIPTION here (D3 swaps the two fields' visual weight —
				    key leads bold+mono, title/description trails muted+regular). Kept on `title` reachable
				    on hover for the same reason as the archived shape: dictated prose, regularly longer
				    than the row. */}
				<span className="truncate text-sm text-muted-foreground" title={item.title}>
					{item.title}
				</span>
			</div>
			<Badge className={cn('shrink-0', issueStatusChipClass[item.status])}>{enumLabel('IssueStatus', item.status)}</Badge>
		</Link>
	)
}
