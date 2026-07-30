import type { ComponentProps } from 'react'
import { useGetSetupChecklist } from '@codm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { SetupChecklist } from '../SetupChecklist'
import { HomeDashboard } from '../HomeDashboard'

/**
 * Home is a fork: until the operator has attached at least one thread it shows the
 * three-step setup checklist (T02); once a thread exists it becomes the operating
 * dashboard (T03). The checklist read owns that decision.
 */
export function HomeSection({ className, ...props }: ComponentProps<'div'>) {
	const { data, isLoading } = useGetSetupChecklist()

	if (isLoading || !data) {
		return (
			<div className={cn('mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-6 pt-24', className)} {...props}>
				<Skeleton className="h-10 w-72" />
				<Skeleton className="h-64 w-full max-w-xl rounded-2xl" />
			</div>
		)
	}

	return data.threadDone ? (
		<HomeDashboard className={className} {...props} />
	) : (
		<SetupChecklist checklist={data} className={className} {...props} />
	)
}
