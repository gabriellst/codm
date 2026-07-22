// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-notifications-screen
// task:        synthetic-expo-notifications-screen
// stamp:       expo-notif-iter4s
// docTreeHash: c2250fc48222
// model:       sonnet
// graded:      2026-06-12T08:22:02.295Z
// source:      packages/app/expo/app/(tabs)/notifications/-components/NotificationRow/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { Pressable, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { Haptics } from 'react-native-nitro-haptics'
import {
	useMarkNotificationRead,
	listNotificationsQueryKey,
	NotificationCategoryEnum,
} from '@template/client-typescript/typescript'
import type { NotificationCategory } from '@template/client-typescript/typescript'
import type { ListNotifications200 } from '@template/client-typescript/typescript'
import { Text } from '@/components/ui/Text'
import { IconBolt, IconCalendar, IconChart, IconCheck, IconFlame, IconHeart, IconTrophy } from '@/components/ui/Icons'
import type { IconProps } from '@/components/ui/Icons'
import { formatRelativeHistoryDate } from '@/lib/format-date'
import { accent, border, fg, fs, surfaces } from '@/lib/tokens'

type NotificationItem = ListNotifications200['items'][number]

type CategoryStyle = {
	icon: React.FC<IconProps>
	color: string
	bg: string
}

const CATEGORY_STYLE: Record<NotificationCategory, CategoryStyle> = {
	[NotificationCategoryEnum.ORDER_RECEIVED]: { icon: IconBolt, color: accent.success, bg: accent.successBg },
	[NotificationCategoryEnum.SYNC_ERROR]: { icon: IconFlame, color: accent.danger, bg: 'rgba(220,38,38,0.12)' },
	[NotificationCategoryEnum.FEATURE_ANNOUNCEMENT]: { icon: IconTrophy, color: fg.fg1, bg: 'rgba(244,244,245,0.10)' },
	[NotificationCategoryEnum.DAILY_DIGEST]: { icon: IconCalendar, color: accent.warning, bg: accent.warningBg },
	[NotificationCategoryEnum.INTEGRATION_DISCONNECTED]: { icon: IconChart, color: accent.danger, bg: 'rgba(220,38,38,0.12)' },
	[NotificationCategoryEnum.INVITATION]: { icon: IconHeart, color: '#818CF8', bg: 'rgba(129,140,248,0.12)' },
	[NotificationCategoryEnum.OTHER]: { icon: IconChart, color: fg.fg2, bg: 'rgba(111,111,118,0.12)' },
}

interface NotificationRowProps {
	notification: NotificationItem
}

export function NotificationRow({ notification }: NotificationRowProps) {
	const { t, i18n } = useTranslation()
	const router = useRouter()
	const queryClient = useQueryClient()
	const markRead = useMarkNotificationRead()

	const style = CATEGORY_STYLE[notification.category]
	const Icon = style.icon

	const handleMarkRead = async () => {
		if (notification.read) return
		await markRead.mutateAsync(
			{ data: { notificationDeliveryIds: [notification.id] } },
			{
				onSuccess: () => Haptics.notification('success'),
				onSettled: () =>
					queryClient.invalidateQueries({ queryKey: listNotificationsQueryKey() }),
			},
		)
	}

	const handlePress = () => {
		router.push({
			pathname: '/(sheets)/notification-detail',
			params: { id: notification.id },
		})
	}

	return (
		<Pressable
			onPress={handlePress}
			style={{
				backgroundColor: notification.read ? surfaces.surface1 : `${surfaces.surface1}`,
				borderRadius: 12,
				borderWidth: 1,
				borderColor: notification.read ? border.border : border.borderStrong,
				borderLeftWidth: notification.read ? 1 : 3,
				borderLeftColor: notification.read ? border.border : style.color,
				overflow: 'hidden',
				flexDirection: 'row',
				alignItems: 'flex-start',
				gap: 12,
				padding: 14,
			}}
			accessibilityRole="button"
			accessibilityLabel={notification.title}
		>
			<View
				style={{
					width: 36,
					height: 36,
					borderRadius: 10,
					backgroundColor: style.bg,
					alignItems: 'center',
					justifyContent: 'center',
					flexShrink: 0,
				}}
			>
				<Icon size={18} color={style.color} />
			</View>

			<View style={{ flex: 1, gap: 2 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
					{!notification.read && (
						<View
							style={{
								width: 6,
								height: 6,
								borderRadius: 3,
								backgroundColor: accent.pulse,
							}}
						/>
					)}
					<Text
						style={{
							fontFamily: notification.read ? 'Montserrat_600SemiBold' : 'Montserrat_700Bold',
							fontSize: fs.sm,
							color: notification.read ? fg.fg1 : fg.fg0,
							flex: 1,
						}}
						numberOfLines={1}
					>
						{notification.title}
					</Text>
				</View>

				<Text
					style={{ fontSize: fs.sm, color: fg.fg2, lineHeight: fs.sm * 1.4 }}
					numberOfLines={2}
				>
					{notification.message}
				</Text>

				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
					<Text style={{ fontSize: fs.xs, color: fg.fg2 }}>
						{t(`enums.NotificationCategory.${notification.category}`)}
					</Text>
					<Text style={{ fontSize: fs.xs, color: fg.fg2 }}>
						{formatRelativeHistoryDate({ isoDate: notification.createdAt, t, language: i18n.language })}
					</Text>
				</View>
			</View>

			{!notification.read && (
				<Pressable
					onPress={e => {
						e.stopPropagation()
						void handleMarkRead()
					}}
					style={{
						width: 32,
						height: 32,
						borderRadius: 8,
						backgroundColor: surfaces.surface2,
						alignItems: 'center',
						justifyContent: 'center',
						flexShrink: 0,
					}}
					accessibilityRole="button"
					accessibilityLabel={t('notifications.markRead')}
					hitSlop={8}
				>
					<IconCheck size={14} color={fg.fg1} />
				</Pressable>
			)}
		</Pressable>
	)
}
