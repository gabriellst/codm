import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useGetHomeDashboard } from '@codedm/client-typescript/typescript'
import type { GetHomeDashboardQueryResponse } from '@codedm/client-typescript/typescript'
import {
	AgentsRunningPill,
	ConsoleButton,
	ConsoleCard,
	Dot,
	ListCard,
	ListRow,
	ScrollScreen,
	StatusChip,
	ThreadAvatar,
	channelGlyph,
	channelLabelKey,
	greeting,
	stopLabelKey,
} from '@/components/console'
import { DisplayTitle } from '@/components/ui/DisplayTitle'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { LIVE_REFETCH_MS } from '@/lib/live'
import { action, fg } from '@/lib/tokens'

type Dashboard = GetHomeDashboardQueryResponse

/** The operating overview: agents live, who needs you, active sessions, today's numbers, channel health. */
export function HomeDashboard() {
	const { t } = useTranslation()
	const { data } = useGetHomeDashboard({ query: { refetchInterval: LIVE_REFETCH_MS } })

	const running = data?.agentsRunningNow ?? 0
	const headline =
		running === 0 ? t('dashboard.noAgents') : running === 1 ? t('dashboard.oneAgent') : t('dashboard.manyAgents', { count: running })

	return (
		<ScrollScreen>
			<View className="flex-row justify-end pt-1">
				<AgentsRunningPill />
			</View>

			<View className="gap-2">
				<Eyebrow>{greeting()}</Eyebrow>
				<DisplayTitle fontSize={38}>{headline}</DisplayTitle>
			</View>

			{data?.needsYou ? <NeedsYouCallout needsYou={data.needsYou} /> : null}

			<ActiveSessions sessions={data?.activeSessions ?? []} />

			{data && data.latestActivity.length > 0 ? <LatestActivity items={data.latestActivity} /> : null}

			{data ? <TodayCard today={data.today} /> : null}

			{data && data.channels.length > 0 ? <ChannelsCard channels={data.channels} /> : null}
		</ScrollScreen>
	)
}

function NeedsYouCallout({ needsYou }: { needsYou: NonNullable<Dashboard['needsYou']> }) {
	const { t } = useTranslation()
	const detail = needsYou.stopKinds.map(k => t(stopLabelKey(k))).join(' · ') || t('session.agentStopped')
	return (
		<ConsoleCard className="border-warning-border">
			<View className="flex-row items-center gap-4">
				<View className="h-12 w-12 items-center justify-center rounded-pill" style={{ backgroundColor: action.primary }}>
					<Text className="font-sans-black text-lg" style={{ color: action.onPrimary }}>
						!
					</Text>
				</View>
				<View className="flex-1">
					<Text className="font-sans-semi text-sm text-foreground">
						{t('dashboard.needsYouName', { name: needsYou.threadDisplayName })}
					</Text>
					<Text className="font-sans text-xs text-muted-foreground">{detail}</Text>
				</View>
				<ConsoleButton
					size="sm"
					label={t('dashboard.openSession')}
					onPress={() => router.push(`/thread/${needsYou.threadId}`)}
				/>
			</View>
		</ConsoleCard>
	)
}

function ActiveSessions({ sessions }: { sessions: Dashboard['activeSessions'] }) {
	const { t } = useTranslation()
	return (
		<View className="gap-3">
			<Text className="font-sans-semi text-base text-foreground">{t('dashboard.activeSessions')}</Text>
			{sessions.length === 0 ? (
				<Text className="font-sans text-sm text-muted-foreground">{t('dashboard.noActiveSessions')}</Text>
			) : (
				<ListCard>
					{sessions.map((session, i) => (
						<Pressable
							key={session.threadId}
							onPress={() => router.push(`/thread/${session.threadId}`)}
							style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
						>
							<ListRow first={i === 0}>
								<ThreadAvatar name={session.displayName} channelKind={session.channelKind} />
								<View className="min-w-0 flex-1">
									<Text numberOfLines={1} className="font-sans-medium text-sm text-foreground">
										{session.displayName}
									</Text>
									<Text numberOfLines={1} className="font-sans text-xs text-muted-foreground">
										{session.lastActivity}
									</Text>
								</View>
								<StatusChip status={session.status} />
							</ListRow>
						</Pressable>
					))}
				</ListCard>
			)}
		</View>
	)
}

function LatestActivity({ items }: { items: Dashboard['latestActivity'] }) {
	const { t } = useTranslation()
	return (
		<View className="gap-3">
			<Text className="font-sans-semi text-base text-foreground">{t('dashboard.latestActivity')}</Text>
			<View className="gap-3">
				{items.map(item => (
					<Pressable
						key={`${item.threadId}-${item.at}`}
						onPress={() => router.push(`/thread/${item.threadId}`)}
						className="flex-row items-start gap-3"
					>
						<Dot className="mt-1.5 bg-muted-foreground" />
						<Text className="flex-1 font-sans text-sm text-foreground">
							<Text className="font-sans-medium text-foreground">{item.title}</Text>{' '}
							<Text className="text-muted-foreground">{item.subtitle}</Text>
						</Text>
					</Pressable>
				))}
			</View>
		</View>
	)
}

function TodayCard({ today }: { today: Dashboard['today'] }) {
	const { t } = useTranslation()
	const rows = [
		{ label: t('dashboard.issuesOpened'), value: String(today.issuesOpened) },
		{ label: t('dashboard.issuesClosed'), value: String(today.issuesClosed) },
		{ label: t('dashboard.medianResponse'), value: `${Math.round(today.medianResponseSeconds)}s` },
	]
	return (
		<ConsoleCard padding="lg" className="gap-5">
			<Text className="font-sans-semi text-base text-foreground">{t('dashboard.today')}</Text>
			<View className="gap-5">
				{rows.map(row => (
					<View key={row.label} className="gap-1">
						<Eyebrow>{row.label}</Eyebrow>
						<Text className="font-sans-bold text-2xl text-foreground">{row.value}</Text>
					</View>
				))}
			</View>
		</ConsoleCard>
	)
}

function ChannelsCard({ channels }: { channels: Dashboard['channels'] }) {
	const { t } = useTranslation()
	return (
		<ConsoleCard padding="lg" className="gap-4">
			<Text className="font-sans-semi text-base text-foreground">{t('dashboard.channels')}</Text>
			<View className="gap-3">
				{channels.map(channel => {
					const Glyph = channelGlyph[channel.kind]
					const connected = channel.status === 'CONNECTED'
					return (
						<View key={channel.kind} className="flex-row items-center gap-3">
							<View className="h-9 w-9 items-center justify-center rounded-pill bg-secondary">
								<Glyph size={16} color={fg.fg0} strokeWidth={2} />
							</View>
							<Text className="flex-1 font-sans-medium text-sm text-foreground">{t(channelLabelKey(channel.kind))}</Text>
							<View className="flex-row items-center gap-2">
								<Dot className={connected ? 'bg-success' : 'bg-muted-foreground'} />
								<Text className="font-sans text-xs text-muted-foreground">
									{connected ? t('channels.connected') : t('channels.notConnected')}
								</Text>
							</View>
						</View>
					)
				})}
			</View>
		</ConsoleCard>
	)
}
