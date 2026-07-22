import { useGetSetupChecklist } from '@codedm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { SetupChecklist } from '../SetupChecklist'
import { HomeDashboard } from '../HomeDashboard'

/**
 * Home is a fork: until the operator has attached at least one thread it shows the
 * three-step setup checklist (T02); once a thread exists it becomes the operating
 * dashboard (T03). The checklist read owns that decision.
 */
export function HomeSection() {
	const { data, isLoading } = useGetSetupChecklist()

	if (isLoading || !data) {
		return (
			<div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-6 pt-24">
				<Skeleton className="h-10 w-72" />
				<Skeleton className="h-64 w-full max-w-xl rounded-2xl" />
			</div>
		)
	}

	return data.threadDone ? <HomeDashboard /> : <SetupChecklist checklist={data} />
}
