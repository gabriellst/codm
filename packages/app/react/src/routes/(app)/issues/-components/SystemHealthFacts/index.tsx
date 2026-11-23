import type * as React from 'react'
import { useTranslation } from 'react-i18next'
import { QuotaStateEnum } from '@codm/client-typescript/typescript'
import type { GetSystemHealthQueryResponse, QuotaState } from '@codm/client-typescript/typescript'
import { Badge } from '@codm/app-ui/badge'
import { useLocale } from '@/hooks'
import { enumLabel } from '@/lib'
import { formatDayAndTime, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

/** How the badge of each quota state is drawn — total over the contract's states (a new one fails `tsc` here). */
const BADGE_OF: Record<QuotaState, 'success' | 'warning' | 'error'> = {
	[QuotaStateEnum.OK]: 'success',
	[QuotaStateEnum.NEAR]: 'warning',
	[QuotaStateEnum.HOLDING]: 'warning',
	[QuotaStateEnum.REFUSED]: 'error',
}

const GIB = 1024 ** 3

interface SystemHealthFactsProps extends React.ComponentProps<'div'> {
	health: GetSystemHealthQueryResponse
}

/**
 * The health strip's facts, once measured (fase 4, item 7) — a leaf: the section owns the read and hands the health
 * down. In OBSERVATION a denial is a would-hold line, never the HOLDING badge (the backend never says HOLDING for it).
 */
export function SystemHealthFacts({ health, className, ...props }: SystemHealthFactsProps) {
	const { t } = useTranslation()
	const locale = useLocale()
	const ratio = (spent: number, ceiling: number) => formatPercent(ceiling > 0 ? spent / ceiling : 0, locale, 0)
	const wouldHold = !health.budget.enforced && !health.budget.admits

	return (
		<div className={cn('contents', className)} {...props}>
			<Badge variant={BADGE_OF[health.state]} data-state={health.state}>
				{enumLabel('QuotaState', health.state)}
			</Badge>
			<span>
				{t('issues.health.window', { percent: ratio(health.window.spent, health.window.ceiling) })}
				{health.window.resetsAt && (
					<span className="text-muted-foreground">
						{' '}
						· {t('issues.health.resets', { at: formatDayAndTime(health.window.resetsAt, locale) })}
					</span>
				)}
			</span>
			<span>{t('issues.health.week', { percent: ratio(health.week.spent, health.week.ceiling) })}</span>
			<span>
				{t('issues.health.slots', { inUse: health.slots.inUse, effective: health.slots.effective, max: health.slots.max })}
				<span className="text-muted-foreground"> · {enumLabel('SlotLimit', health.slots.limitedBy)}</span>
			</span>
			<span>
				{t('issues.health.queue', { count: health.queue.pending })}
				{health.queue.heldByBudget > 0 && (
					<span className="text-muted-foreground"> · {t('issues.health.heldByBudget', { count: health.queue.heldByBudget })}</span>
				)}
			</span>
			<span>{t('issues.health.disk', { gib: (health.diskFreeBytes / GIB).toFixed(1) })}</span>
			{wouldHold && (
				<span className="basis-full text-muted-foreground" data-testid="health-would-hold">
					{t('issues.health.wouldHold', {
						window: health.budget.heldBy ? enumLabel('ProviderLimitWindow', health.budget.heldBy) : t('issues.health.someWindow'),
					})}
				</span>
			)}
		</div>
	)
}
