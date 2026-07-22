import { ActivityIndicator, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useGetHomeDashboard } from '@codedm/client-typescript/typescript'
import type { ChannelKind, ChannelStatus } from '@codedm/client-typescript/typescript'
import {
	CHANNEL_KINDS,
	Chip,
	Dot,
	ListCard,
	ListRow,
	PageHeader,
	ScrollScreen,
	channelGlyph,
	channelLabelKey,
	channelStatusLabelKey,
} from '@/components/console'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { LIVE_REFETCH_MS } from '@/lib/live'
import { action } from '@/lib/tokens'

/**
 * Connected channels and their health. The daemon exposes channel status
 * through the dashboard read (there is no per-account channel read on this
 * surface yet), so all three channel kinds are listed with their live status —
 * nothing invented. Pairing itself happens on the desktop console (QR scan).
 */
export function ChannelsStatusSection() {
	const { t } = useTranslation()
	const { data, isLoading } = useGetHomeDashboard({ query: { refetchInterval: LIVE_REFETCH_MS } })
	const statusByKind = new Map<ChannelKind, ChannelStatus>((data?.channels ?? []).map(c => [c.kind, c.status]))

	return (
		<ScrollScreen>
			<PageHeader
				title={t('channels.title')}
				subtitle={<Text className="font-sans text-sm text-muted-foreground">{t('channels.routedNote')}</Text>}
			/>

			<View className="gap-2">
				<Eyebrow>{t('channels.yourChannels')}</Eyebrow>
				{isLoading && !data ? (
					<View className="items-center py-12">
						<ActivityIndicator color={action.primary} />
					</View>
				) : (
					<ListCard>
						{CHANNEL_KINDS.map((kind, i) => {
							const status = statusByKind.get(kind) ?? 'DISCONNECTED'
							const Glyph = channelGlyph[kind]
							const connected = status === 'CONNECTED'
							return (
								<ListRow key={kind} first={i === 0}>
									<View className="h-11 w-11 items-center justify-center rounded-pill" style={{ backgroundColor: action.primary }}>
										<Glyph size={20} color={action.onPrimary} strokeWidth={2} />
									</View>
									<View className="min-w-0 flex-1">
										<Text className="font-sans-semi text-sm text-foreground">{t(channelLabelKey(kind))}</Text>
										<View className="flex-row items-center gap-1.5">
											<Dot className={connected ? 'bg-success' : 'bg-muted-foreground'} />
											<Text className="font-sans text-xs text-muted-foreground">{t(channelStatusLabelKey(status))}</Text>
										</View>
									</View>
									<Chip tone={connected ? 'soft' : 'outline'} label={connected ? t('channels.connected') : t('channels.notConnected')} />
								</ListRow>
							)
						})}
					</ListCard>
				)}
				<Text className="px-1 pt-1 font-sans text-xs text-muted-foreground">{t('channels.pairingHint')}</Text>
			</View>
		</ScrollScreen>
	)
}
