import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { z } from 'zod'
import { Asterisk, ChevronRight } from 'lucide-react-native'
import { useGetIssuesOverview } from '@codedm/client-typescript/typescript'
import type { GetIssuesOverviewQueryResponse, IssueStatus } from '@codedm/client-typescript/typescript'
import {
	ConsoleButton,
	Dot,
	EmptyBlock,
	ISSUE_STATUS_ORDER,
	PageHeader,
	ScrollScreen,
	issueStatusDotClass,
} from '@/components/console'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { useTypedSearchParams } from '@/lib/typed-route'
import { LIVE_REFETCH_MS } from '@/lib/live'
import { fg } from '@/lib/tokens'

type IssueItem = GetIssuesOverviewQueryResponse['groups'][number]['items'][number]

const searchSchema = z.object({ archived: z.enum(['0', '1']).default('0') })

/** Every issue across every thread, grouped by status, with an archived reveal. */
export function IssuesOverviewSection() {
	const { t } = useTranslation()
	const [{ archived }, setParams] = useTypedSearchParams(searchSchema)
	const showArchived = archived === '1'
	const { data, isLoading } = useGetIssuesOverview(
		{ includeArchived: showArchived },
		{ query: { refetchInterval: LIVE_REFETCH_MS } },
	)

	const stats = data?.statsLine
	const orderedGroups = ISSUE_STATUS_ORDER.map(status => data?.groups.find(g => g.status === status)).filter(
		(g): g is NonNullable<typeof g> => !!g && g.items.length > 0,
	)
	const nothing = orderedGroups.length === 0 && (!data || data.archived.length === 0)

	return (
		<ScrollScreen>
			<PageHeader
				title={t('issues.title')}
				subtitle={
					stats ? (
						<Text className="font-sans text-sm text-muted-foreground">
							{t('issues.stats', {
								awaiting: stats.awaitingInput,
								working: stats.working,
								completed: stats.completed,
								archived: stats.archived,
							})}
						</Text>
					) : undefined
				}
				action={
					<ConsoleButton
						size="sm"
						variant="outline"
						label={showArchived ? t('issues.hideArchived') : t('issues.showArchived')}
						onPress={() => setParams({ archived: showArchived ? '0' : '1' })}
					/>
				}
			/>

			{isLoading && !data ? (
				<View className="items-center py-16">
					<ActivityIndicator color={fg.fg0} />
				</View>
			) : nothing ? (
				<EmptyBlock title={t('issues.emptyTitle')} body={t('issues.emptyBody')} />
			) : (
				<View className="gap-8">
					{orderedGroups.map(group => (
						<View key={group.status} className="gap-1">
							<StatusGroupLabel status={group.status} />
							{group.items.map(item => (
								<IssueRow key={item.issueId} item={item} />
							))}
						</View>
					))}

					{showArchived && data && data.archived.length > 0 ? (
						<View className="gap-1">
							<Eyebrow>{t('issues.archived')}</Eyebrow>
							{data.archived.map(item => (
								<IssueRow key={item.issueId} item={item} />
							))}
						</View>
					) : null}
				</View>
			)}
		</ScrollScreen>
	)
}

function StatusGroupLabel({ status }: { status: IssueStatus }) {
	const { t } = useTranslation()
	const labelKey = `enums.issueStatus.${status}` as const
	return <Eyebrow>{t(labelKey)}</Eyebrow>
}

function IssueRow({ item }: { item: IssueItem }) {
	const completed = item.status === 'COMPLETED'
	return (
		<Pressable
			onPress={() => router.push(`/issue/${item.issueId}`)}
			style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
			className="flex-row items-center gap-3 rounded-xl px-2 py-3"
		>
			<View className="w-5 items-center">
				{item.status === 'NEEDS_INPUT' ? (
					<Asterisk size={16} color={fg.fg2} strokeWidth={2} />
				) : (
					<Dot className={issueStatusDotClass[item.status]} />
				)}
			</View>
			<View className="min-w-0 flex-1">
				<Text numberOfLines={1} className={completed ? 'font-sans-semi text-sm text-muted-foreground' : 'font-sans-semi text-sm text-foreground'}>
					{item.title}
				</Text>
				<Text numberOfLines={1} className="font-mono text-xs text-muted-foreground">
					{item.key}
				</Text>
			</View>
			<View className="max-w-[110px] rounded-pill border border-border px-2.5 py-1">
				<Text numberOfLines={1} className="font-sans text-xs text-foreground">
					{item.threadDisplayName}
				</Text>
			</View>
			<ChevronRight size={16} color={fg.fg2} strokeWidth={2} />
		</Pressable>
	)
}
