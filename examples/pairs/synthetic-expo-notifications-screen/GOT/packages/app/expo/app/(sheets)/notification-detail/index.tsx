// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-notifications-screen
// task:        synthetic-expo-notifications-screen
// stamp:       expo-notif-iter4s
// docTreeHash: c2250fc48222
// model:       sonnet
// graded:      2026-06-12T08:22:02.295Z
// source:      packages/app/expo/app/(sheets)/notification-detail/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { Pressable, ScrollView, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { useListNotifications } from '@template/client-typescript/typescript'
import { Protected } from '@/components/Protected'
import { Text } from '@/components/ui/Text'
import { IconClose } from '@/components/ui/Icons'
import { useTypedSearchParams } from '@/lib/typed-route'
import { formatRelativeHistoryDate } from '@/lib/format-date'
import { border, fg, fs, surfaces } from '@/lib/tokens'

const detailParamsSchema = z.object({
	id: z.string().default(''),
})

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<View
			style={{
				flexDirection: 'row',
				justifyContent: 'space-between',
				alignItems: 'center',
				paddingVertical: 12,
				borderBottomWidth: 1,
				borderBottomColor: border.borderMinimal,
			}}
		>
			<Text style={{ fontSize: fs.sm, color: fg.fg2 }}>{label}</Text>
			<Text style={{ fontSize: fs.sm, color: fg.fg1, fontFamily: 'Montserrat_500Medium' }}>
				{value}
			</Text>
		</View>
	)
}

export default function NotificationDetailSheet() {
	const { t, i18n } = useTranslation()
	const [{ id }] = useTypedSearchParams(detailParamsSchema)

	const { data, isLoading } = useListNotifications({ limit: 100 })
	const notification = id ? data?.items.find(n => n.id === id) : undefined

	return (
		<Protected>
			<View style={{ flex: 1, paddingTop: 4 }}>
				<View
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						justifyContent: 'space-between',
						paddingHorizontal: 20,
						paddingVertical: 12,
					}}
				>
					<View style={{ width: 32 }} />
					<Text
						style={{
							fontFamily: 'Montserrat_700Bold',
							fontSize: fs.headerTitle,
							color: fg.fg0,
						}}
					>
						{t('notificationDetail.title')}
					</Text>
					<Pressable
						onPress={() => router.back()}
						accessibilityRole="button"
						accessibilityLabel={t('common.close')}
						hitSlop={12}
						style={{
							width: 32,
							height: 32,
							alignItems: 'center',
							justifyContent: 'center',
						}}
					>
						<IconClose size={20} color={fg.fg1} />
					</Pressable>
				</View>

				{isLoading && !data ? (
					<View style={{ flex: 1, gap: 12, padding: 20 }}>
						{[1, 2, 3].map(key => (
							<View
								key={key}
								style={{ height: 48, borderRadius: 8, backgroundColor: surfaces.surface2 }}
							/>
						))}
					</View>
				) : !notification ? (
					<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
						<Text style={{ fontSize: fs.sm, color: fg.fg2, textAlign: 'center' }}>
							{t('notificationDetail.notFound')}
						</Text>
					</View>
				) : (
					<ScrollView
						contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
						showsVerticalScrollIndicator={false}
					>
						<Text
							style={{
								fontFamily: 'Montserrat_700Bold',
								fontSize: fs.lg,
								color: fg.fg0,
								marginBottom: 12,
								lineHeight: fs.lg * 1.3,
							}}
						>
							{notification.title}
						</Text>

						<Text
							style={{
								fontSize: fs.base,
								color: fg.fg1,
								lineHeight: fs.base * 1.55,
								marginBottom: 24,
							}}
						>
							{notification.message}
						</Text>

						<View
							style={{
								backgroundColor: surfaces.surface1,
								borderRadius: 12,
								borderWidth: 1,
								borderColor: border.border,
								overflow: 'hidden',
							}}
						>
							<InfoRow
								label={t('notificationDetail.category')}
								value={t(`enums.NotificationCategory.${notification.category}`)}
							/>
							<InfoRow
								label={t('notificationDetail.origin')}
								value={t(`enums.NotificationOrigin.${notification.origin}`)}
							/>
							<InfoRow
								label={t('notificationDetail.received')}
								value={formatRelativeHistoryDate({
									isoDate: notification.createdAt,
									t,
									language: i18n.language,
								})}
							/>
						</View>
					</ScrollView>
				)}
			</View>
		</Protected>
	)
}
