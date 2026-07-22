import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { getSettingsQueryKey, useGetSettings, useUpdateStopCriteria } from '@codedm/client-typescript/typescript'
import type { GetSettingsQueryResponse } from '@codedm/client-typescript/typescript'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'

type Criteria = GetSettingsQueryResponse['stopCriteria']
type CriteriaKey = keyof Criteria

const CRITERIA: { key: CriteriaKey; label: string; description: string }[] = [
	{ key: 'serverErrors', label: 'Server errors', description: 'The provider CLI errors out (429s, crashes, timeouts).' },
	{ key: 'blockedByClassification', label: 'Blocked by classification', description: 'A drafted reply is flagged before it is sent.' },
	{ key: 'humanRequested', label: 'Human requested', description: 'The contact explicitly asks for a person.' },
	{ key: 'approvalNeeded', label: 'Approval needed', description: 'The agent wants to run a command that needs sign-off.' },
]

/**
 * Stop criteria (T08): the conditions that pause an agent and flag the thread
 * "Needs you". Each toggle persists the full criteria object via UpdateStopCriteria.
 */
export function StopCriteriaSection() {
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
		<section className="flex flex-col gap-3">
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
							<div className="flex flex-1 flex-col">
								<span className="font-medium text-foreground">{item.label}</span>
								<span className="text-sm text-muted-foreground">{item.description}</span>
							</div>
							<Switch checked={criteria[item.key]} onCheckedChange={value => toggle(item.key, value)} />
						</label>
					))}
				</div>
			)}
		</section>
	)
}
