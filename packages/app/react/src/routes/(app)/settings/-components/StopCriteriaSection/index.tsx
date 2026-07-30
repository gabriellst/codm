import { useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { getSettingsQueryKey, useGetSettings, useUpdateStopCriteria } from '@codm/client-typescript/typescript'
import type { GetSettingsQueryResponse } from '@codm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

type Criteria = GetSettingsQueryResponse['stopCriteria']
type CriteriaKey = keyof Criteria

const CRITERIA: { key: CriteriaKey; labelKey: string; descKey: string }[] = [
	{ key: 'serverErrors', labelKey: 'settings.criteriaServerErrors', descKey: 'settings.criteriaServerErrorsDesc' },
	{ key: 'blockedByClassification', labelKey: 'settings.criteriaBlocked', descKey: 'settings.criteriaBlockedDesc' },
	{ key: 'humanRequested', labelKey: 'settings.criteriaHumanRequested', descKey: 'settings.criteriaHumanRequestedDesc' },
	{ key: 'approvalNeeded', labelKey: 'settings.criteriaApprovalNeeded', descKey: 'settings.criteriaApprovalNeededDesc' },
]

/**
 * Stop criteria (T08): the conditions that pause an agent and flag the thread
 * "Needs you". Each toggle persists the full criteria object via UpdateStopCriteria.
 */
export function StopCriteriaSection({ className, ...props }: ComponentProps<'section'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetSettings()
	const update = useUpdateStopCriteria()
	const [criteria, setCriteria] = useState<Criteria | null>(null)

	useEffect(() => {
		if (data) setCriteria(data.stopCriteria)
	}, [data])

	const toggle = (key: CriteriaKey, value: boolean) => {
		if (!criteria) return
		const next = { ...criteria, [key]: value }
		setCriteria(next)
		update.mutate({ data: { stopCriteria: next } }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getSettingsQueryKey() }) })
	}

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<div className="flex flex-col gap-1">
				<h2 className="label-eyebrow">{t('settings.stopCriteria')}</h2>
				<p className="text-sm text-muted-foreground">{t('settings.stopCriteriaDescription')}</p>
			</div>
			{isLoading || !criteria ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-12 rounded-xl" />
					<Skeleton className="h-12 rounded-xl" />
				</div>
			) : (
				<div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
					{CRITERIA.map(item => (
						<label key={item.key} className="flex cursor-pointer items-center gap-4 p-4">
							<div className="flex flex-1 flex-col gap-0.5">
								<span className="font-medium text-foreground">{t(item.labelKey)}</span>
								<span className="text-sm text-muted-foreground">{t(item.descKey)}</span>
							</div>
							<Switch checked={criteria[item.key]} onCheckedChange={value => toggle(item.key, value)} />
						</label>
					))}
				</div>
			)}
		</section>
	)
}
