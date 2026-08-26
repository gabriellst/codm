import { useEffect } from 'react'
import type { ComponentProps } from 'react'
import { useGetOnboarding } from '@codm/client-typescript/typescript'
import { Skeleton } from '@codm/app-ui/skeleton'
import { cn } from '@/lib/utils'
import { useAnalytics } from '@/services'
import { SetupChecklist } from '../SetupChecklist'
import { HomeDashboard } from '../HomeDashboard'

/**
 * Home is a fork: until the operator has attached at least one thread it shows the
 * three-step setup checklist (T02); once a thread exists it becomes the operating
 * dashboard (T03). The checklist read owns that decision.
 */
export function HomeSection({ className, ...props }: ComponentProps<'div'>) {
	const { data, isLoading } = useGetOnboarding()
	const analytics = useAnalytics()

	// SP4 — the activation funnel "for free": no bespoke "onboarding step completed" event, just
	// the SAME checklist this section already reads folded onto the identified person as
	// properties. Re-running on every resolve is fine — `setPersonProperties` is a merge/set, not
	// an event, so it is idempotent.
	useEffect(() => {
		if (!data) return
		analytics.setPersonProperties({
			channelDone: data.channelDone,
			workspaceDone: data.workspaceDone,
			threadDone: data.threadDone,
		})
	}, [data, analytics])

	if (isLoading || !data) {
		return (
			<div className={cn('mx-auto flex w-full flex-col items-center gap-4 px-6 pt-24', className)} {...props}>
				<Skeleton className="h-10 w-72" />
				<Skeleton className="h-64 w-full max-w-xl rounded-2xl" />
			</div>
		)
	}

	return data.threadDone ? <HomeDashboard className={className} {...props} /> : <SetupChecklist className={className} {...props} />
}
