import type * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { getSystemHealthQueryKey, useGetSystemHealth } from '@codm/client-typescript/typescript'
import { Skeleton } from '@codm/app-ui/skeleton'
import { useServerEvents } from '@/hooks'
import { cn } from '@/lib/utils'
import { SystemHealthFacts } from '../SystemHealthFacts'

/** The facts after which the dispatcher has likely moved: a turn settled, a task opened or closed. */
const HEALTH_EVENTS = [
	'integration.issue.created',
	'integration.issue.completed',
	'integration.thread.stop_raised',
	'integration.orchestrator.replied',
] as const

/**
 * The dispatcher samples on every loop and no integration fact announces it (the budget and the slots are its
 * in-memory state, not an event) — so besides the facts above, the strip re-reads on its own, every 30 s.
 */
const HEALTH_REFRESH_MS = 30_000

/**
 * THE HEALTH STRIP (fase 4, item 7) — on top of "Tarefas": the quota badge, both windows, the task slots (effective of
 * the configured maximum, and what limits them), the queue and the free disk, as the dispatcher last saw them.
 *
 * In OBSERVATION the budget holds nothing — the badge is never "holding" for it; when it would deny a task turn the
 * strip says so as a would-hold, never as a hold. Before the dispatcher's first loop there is nothing measured yet
 * (`HEALTH_NOT_SAMPLED`) and the strip says it is waiting.
 */
export function SystemHealthSection({ className, ...props }: React.ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isError } = useGetSystemHealth({ query: { refetchInterval: HEALTH_REFRESH_MS } })

	useServerEvents([...HEALTH_EVENTS], () => {
		queryClient.invalidateQueries({ queryKey: getSystemHealthQueryKey() })
	})

	return (
		<section
			aria-label={t('issues.health.title')}
			className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border px-4 py-3 text-sm', className)}
			{...props}
		>
			{data ? (
				<SystemHealthFacts health={data} />
			) : isError ? (
				<span className="text-muted-foreground">{t('issues.health.notSampled')}</span>
			) : (
				<Skeleton className="h-5 w-full" />
			)}
		</section>
	)
}
