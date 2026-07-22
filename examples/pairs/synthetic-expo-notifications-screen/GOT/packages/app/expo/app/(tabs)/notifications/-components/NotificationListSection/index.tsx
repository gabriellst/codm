// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-notifications-screen
// task:        synthetic-expo-notifications-screen
// stamp:       expo-notif-iter4s
// docTreeHash: c2250fc48222
// model:       sonnet
// graded:      2026-06-12T08:22:02.295Z
// source:      packages/app/expo/app/(tabs)/notifications/-components/NotificationListSection/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { useMemo } from 'react'
import { FlatList, Pressable, ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useListNotifications, NotificationCategoryEnum } from '@codedm/client-typescript/typescript'
import type { NotificationCategory } from '@codedm/client-typescript/typescript'
import { Text } from '@/components/ui/Text'
import { EmptyState } from '@/components/ui/EmptyState'
import { ScreenError } from '@/components/ui/ScreenError'
import { useTypedSearchParams } from '@/lib/typed-route'
import { accent, border, fg, fs, surfaces } from '@/lib/tokens'
import { NotificationRow } from '../NotificationRow'

const FILTER_ALL = 'ALL' as const

type CategoryFilter = NotificationCategory | typeof FILTER_ALL

const CATEGORY_VALUES = [
	FILTER_ALL,
	NotificationCategoryEnum.ORDER_RECEIVED,
	NotificationCategoryEnum.SYNC_ERROR,
	NotificationCategoryEnum.FEATURE_ANNOUNCEMENT,
	NotificationCategoryEnum.DAILY_DIGEST,
	NotificationCategoryEnum.INTEGRATION_DISCONNECTED,
	NotificationCategoryEnum.INVITATION,
	NotificationCategoryEnum.OTHER,
] as const

const notificationsParamsSchema = z.object({
	category: z.enum(CATEGORY_VALUES).default(FILTER_ALL),
	unreadOnly: z.string().optional().default('false').transform(v => v === 'true'),
})

function SkeletonRows() {
	return (
		<View style={{ paddingHorizontal: 20, gap: 12, paddingTop: 8 }}>
			{[1, 2, 3, 4, 5].map(key => (
				<View
					key={key}
					style={{
						height: 80,
						borderRadius: 12,
						backgroundColor: `${surfaces.surface1}99`,
					}}
				/>
			))}
		</View>
	)
}

interface ChipProps {
	label: string
	active: boolean
	onPress: () => void
}

function FilterChip({ label, active, onPress }: ChipProps) {
	return (
		<Pressable
			onPress={onPress}
			style={{
				paddingHorizontal: 12,
				paddingVertical: 6,
				borderRadius: 99,
				borderWidth: 1,
				borderColor: active ? border.borderStrong : border.border,
				backgroundColor: active ? surfaces.surface2 : 'transparent',
			}}
			accessibilityRole="button"
		>
			<Text
				style={{
					fontFamily: 'Montserrat_700Bold',
					fontSize: fs.xs,
					letterSpacing: 0.5,
					color: active ? fg.fg0 : fg.fg2,
					textTransform: 'uppercase',
				}}
			>
				{label}
			</Text>
		</Pressable>
	)
}

export function NotificationListSection() {
	const { t } = useTranslation()
	const [{ category, unreadOnly }, setParams] = useTypedSearchParams(notificationsParamsSchema)

	const { data, isLoading, error, refetch } = useListNotifications(
		unreadOnly ? { unreadOnly: true } : undefined,
	)

	const items = useMemo(() => {
		const all = data?.items ?? []
		if (category === FILTER_ALL) return all
		return all.filter(n => n.category === (category as NotificationCategory))
	}, [data, category])

	return (
		<View className="flex-1">
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12, gap: 8 }}
				style={{ flexGrow: 0 }}
			>
				<FilterChip
					label={t('notifications.filterAll')}
					active={category === FILTER_ALL}
					onPress={() => setParams({ category: FILTER_ALL })}
				/>
				{(Object.values(NotificationCategoryEnum) as NotificationCategory[]).map(cat => (
					<FilterChip
						key={cat}
						label={t(`enums.NotificationCategory.${cat}`)}
						active={category === cat}
						onPress={() => setParams({ category: cat })}
					/>
				))}
			</ScrollView>

			<View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
				<Pressable
					onPress={() => setParams({ unreadOnly: !unreadOnly })}
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						gap: 8,
						alignSelf: 'flex-start',
						paddingHorizontal: 12,
						paddingVertical: 6,
						borderRadius: 99,
						borderWidth: 1,
						borderColor: unreadOnly ? border.borderStrong : border.border,
						backgroundColor: unreadOnly ? surfaces.surface2 : 'transparent',
					}}
					accessibilityRole="switch"
					accessibilityState={{ checked: unreadOnly }}
				>
					<View
						style={{
							width: 8,
							height: 8,
							borderRadius: 4,
							backgroundColor: unreadOnly ? accent.pulse : fg.fg2,
						}}
					/>
					<Text
						style={{
							fontFamily: 'Montserrat_700Bold',
							fontSize: fs.xs,
							color: unreadOnly ? fg.fg0 : fg.fg2,
						}}
					>
						{t('notifications.unreadOnly')}
					</Text>
				</Pressable>
			</View>

			{isLoading ? (
				<SkeletonRows />
			) : error ? (
				<ScreenError onRetry={() => void refetch()} />
			) : (
				<FlatList
					data={items}
					keyExtractor={item => item.id}
					contentInsetAdjustmentBehavior="automatic"
					contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110, gap: 8 }}
					showsVerticalScrollIndicator={false}
					renderItem={({ item }) => <NotificationRow notification={item} />}
					ListEmptyComponent={
						<EmptyState
							title={t('notifications.empty.title')}
							body={t('notifications.empty.body')}
						/>
					}
				/>
			)}
		</View>
	)
}
