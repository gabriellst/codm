import type { ComponentProps, ElementType } from 'react'
import { Link } from '@tanstack/react-router'
import { IconBellRinging, IconHourglass, IconPlayerPause } from '@tabler/icons-react'
import type { IssueLifeState } from '@codm/client-typescript/typescript'
import { IssueLifeStateEnum } from '@codm/client-typescript/typescript'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { row } from '@codm/app-ui/surfaces'
import { ProviderWaitBadge, type IssueRowItem } from './IssueRow'

export interface IssueCardItem extends IssueRowItem {
	lifeState: IssueLifeState
}

/**
 * The life states the card SPELLS OUT, with their glyph — the ones that share a column with another state
 * (REMINDED and PAUSED sit in STALLED's, WAITING_BUDGET in WAITING_PROVIDER's). `null` = the column already says it. Exhaustive by type.
 */
const LIFE_BADGE_ICON: Record<IssueLifeState, ElementType | null> = {
	[IssueLifeStateEnum.QUEUED]: null,
	[IssueLifeStateEnum.RUNNING]: null,
	[IssueLifeStateEnum.WAITING_PERSON]: null,
	[IssueLifeStateEnum.WAITING_PROVIDER]: null,
	[IssueLifeStateEnum.WAITING_BUDGET]: IconHourglass,
	[IssueLifeStateEnum.REMINDED]: IconBellRinging,
	[IssueLifeStateEnum.STALLED]: null,
	[IssueLifeStateEnum.PAUSED]: IconPlayerPause,
	[IssueLifeStateEnum.DONE]: null,
}

/**
 * One issue on the BOARD (fase 1): key, title, the group it came from, and — when it matters — why it is
 * quiet (waiting on the usage limit, or reminded to declare). The column already says the life state, so
 * the card does not repeat it except for REMINDED, which shares the "stalled" column.
 */
export function IssueCard({ item, className, ...props }: { item: IssueCardItem } & Omit<ComponentProps<'a'>, 'href'>) {
	return (
		<Link
			to="/threads/$threadId/issues/$issueId"
			params={{ threadId: item.threadId, issueId: item.issueId }}
			className={cn('group flex flex-col gap-1.5 rounded-asymmetric-sm bg-background p-3', row, className)}
			{...props}
		>
			<span className="font-mono text-xs font-bold text-foreground">{item.key}</span>
			<span className="line-clamp-2 text-sm text-foreground" title={item.title}>
				{item.title}
			</span>
			{item.threadDisplayName && <span className="truncate text-xs text-muted-foreground">{item.threadDisplayName}</span>}
			{item.waitingForProviderUntil && <ProviderWaitBadge until={item.waitingForProviderUntil} />}
			<LifeBadge lifeState={item.lifeState} />
		</Link>
	)
}

function LifeBadge({ lifeState, className, ...props }: ComponentProps<'span'> & { lifeState: IssueLifeState }) {
	const Icon = LIFE_BADGE_ICON[lifeState]
	if (!Icon) return null
	return (
		<span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)} {...props}>
			<Icon className="size-3.5" />
			{enumLabel('IssueLifeState', lifeState)}
		</span>
	)
}
