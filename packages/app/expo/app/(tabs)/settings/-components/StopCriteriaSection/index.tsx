import { useEffect, useState } from 'react'
import { Switch, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { getSettingsQueryKey, useGetSettings, useUpdateStopCriteria } from '@codedm/client-typescript/typescript'
import type { GetSettingsQueryResponse } from '@codedm/client-typescript/typescript'
import { ListCard } from '@/components/console'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { action } from '@/lib/tokens'

type Criteria = GetSettingsQueryResponse['stopCriteria']
type CriteriaKey = keyof Criteria

const CRITERIA: { key: CriteriaKey; labelKey: string; hintKey: string }[] = [
	{ key: 'serverErrors', labelKey: 'settings.criteria.serverErrors', hintKey: 'settings.criteria.serverErrorsHint' },
	{
		key: 'blockedByClassification',
		labelKey: 'settings.criteria.blockedByClassification',
		hintKey: 'settings.criteria.blockedByClassificationHint',
	},
	{ key: 'humanRequested', labelKey: 'settings.criteria.humanRequested', hintKey: 'settings.criteria.humanRequestedHint' },
	{ key: 'approvalNeeded', labelKey: 'settings.criteria.approvalNeeded', hintKey: 'settings.criteria.approvalNeededHint' },
] as const

/**
 * Stop criteria: the conditions that pause an agent and flag the thread
 * "Needs you". Each toggle persists the full criteria object via
 * UpdateStopCriteria (optimistic local mirror, then invalidate the read).
 */
export function StopCriteriaSection() {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data } = useGetSettings()
	const update = useUpdateStopCriteria()
	const [criteria, setCriteria] = useState<Criteria | null>(null)

	useEffect(() => {
		if (data) setCriteria(data.stopCriteria)
	}, [data])

	const toggle = (key: CriteriaKey, value: boolean) => {
		if (!criteria) return
		const next = { ...criteria, [key]: value }
		setCriteria(next)
		update.mutate(
			{ data: { stopCriteria: next } },
			{ onSuccess: () => queryClient.invalidateQueries({ queryKey: getSettingsQueryKey() }) },
		)
	}

	return (
		<View className="gap-3">
			<View className="gap-1">
				<Eyebrow>{t('settings.stopCriteria')}</Eyebrow>
				<Text className="font-sans text-sm text-muted-foreground">{t('settings.stopCriteriaDescription')}</Text>
			</View>
			<ListCard>
				{CRITERIA.map((item, i) => (
					<View key={item.key} className={`flex-row items-center gap-4 p-4 ${i === 0 ? '' : 'border-t border-border'}`}>
						<View className="flex-1">
							<Text className="font-sans-medium text-sm text-foreground">{t(item.labelKey as never)}</Text>
							<Text className="font-sans text-xs text-muted-foreground">{t(item.hintKey as never)}</Text>
						</View>
						<Switch
							value={criteria ? criteria[item.key] : false}
							onValueChange={value => toggle(item.key, value)}
							disabled={!criteria}
							trackColor={{ true: action.primary, false: undefined }}
						/>
					</View>
				))}
			</ListCard>
		</View>
	)
}
