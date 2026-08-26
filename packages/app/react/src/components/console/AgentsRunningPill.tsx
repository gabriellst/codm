import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { getHomeDashboardQueryKey, useGetHomeDashboard } from '@codm/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { useServerEvents } from '@/hooks'
import { Dot } from './StatusDot'

/**
 * The persistent operating pulse in the top-right of every console page: how many
 * agents are running right now. Owns its own data and stays live — invalidates the
 * dashboard read (never hand-mutate the cache) on the raw facts that change it: an
 * issue starting or finishing work, or a stop raising/clearing NEEDS_ATTENTION.
 * Direct wire events since B5 — the synthesized `browser.thread_status_changed`
 * frame (and the `BrowserFrameEnricher` that computed it) are gone.
 *
 * Renders NOTHING while no agent is running (visual audit finding: the reference design
 * has no equivalent chrome and "0 agente em execução" is pure noise). The signal — an agent
 * IS running — still surfaces the moment the count goes above zero; only the zero-state chip
 * is gone.
 */
export function AgentsRunningPill({ className, ...props }: ComponentProps<'span'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data } = useGetHomeDashboard()

	useServerEvents(
		['integration.issue.opened', 'integration.issue.completed', 'integration.thread.stop_raised', 'integration.thread.stop_resolved'],
		() => {
			queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
		},
	)

	const count = data?.agentsRunningNow ?? 0
	if (count === 0) return null

	return (
		<span
			className={cn(
				'inline-flex items-center gap-2 rounded-full bg-secondary px-3.5 py-1.5 text-sm font-medium text-secondary-foreground shadow-sm',
				className,
			)}
			{...props}
		>
			<Dot className="bg-success" />
			{t('console.agentsRunning', { count })}
		</span>
	)
}
