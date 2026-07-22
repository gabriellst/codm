import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUp, ChevronLeft } from 'lucide-react-native'
import {
	getIssueDetailQueryKey,
	getIssuesOverviewQueryKey,
	useArchiveIssue,
	useGetIssueDetail,
	useSteerIssue,
} from '@codedm/client-typescript/typescript'
import type { GetIssueDetailQueryResponse } from '@codedm/client-typescript/typescript'
import { Chip, ConsoleButton, EmptyBlock, TranscriptBubble, issueStatusLabelKey } from '@/components/console'
import { DisplayTitle } from '@/components/ui/DisplayTitle'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { KeyboardAware } from '@/components/ui/KeyboardAware'
import { LIVE_REFETCH_MS } from '@/lib/live'
import { action, border, fg, surfaces } from '@/lib/tokens'

type Detail = GetIssueDetailQueryResponse

/** One issue drill-down: the dark terminal panel, routed messages, and an issue-scoped steer. */
export function IssueDetailScreen({ issueId }: { issueId: string }) {
	const { t } = useTranslation()
	const insets = useSafeAreaInsets()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetIssueDetail(issueId || undefined, {
		query: { enabled: !!issueId, refetchInterval: LIVE_REFETCH_MS },
	})
	const archive = useArchiveIssue()

	const onArchive = () => {
		archive.mutate(
			{ issueId },
			{
				onSuccess: () => {
					queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(issueId) })
					queryClient.invalidateQueries({ queryKey: getIssuesOverviewQueryKey() })
					router.back()
				},
			},
		)
	}

	return (
		<KeyboardAware dismissOnTap={false} style={{ backgroundColor: surfaces.bg0, paddingTop: insets.top }}>
			<ScrollView
				className="flex-1"
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
				contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, gap: 20 }}
			>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t('console.back')}
					hitSlop={8}
					onPress={() => router.back()}
					className="h-10 w-10 items-center justify-center rounded-pill bg-secondary"
					style={({ pressed }) => (pressed ? { opacity: 0.8 } : undefined)}
				>
					<ChevronLeft size={20} color={fg.fg0} strokeWidth={2} />
				</Pressable>

				{isLoading && !data ? (
					<View className="items-center py-24">
						<ActivityIndicator color={fg.fg0} />
					</View>
				) : !data ? (
					<EmptyBlock title={t('issues.emptyTitle')} body={t('issues.emptyBody')} />
				) : (
					<>
						<View className="flex-row items-start justify-between gap-4">
							<View className="flex-1 gap-2">
								<View className="flex-row flex-wrap items-center gap-2">
									<DisplayTitle fontSize={24}>{data.issue.title}</DisplayTitle>
									<Chip label={t(issueStatusLabelKey(data.issue.status))} />
								</View>
								<Text className="font-mono text-xs text-muted-foreground">
									{data.issue.key}
									{data.issue.meta ? ` · ${data.issue.meta}` : ''}
								</Text>
							</View>
							{!data.issue.archived ? (
								<ConsoleButton
									size="sm"
									variant="outline"
									label={t('session.archive')}
									loading={archive.isPending}
									onPress={onArchive}
								/>
							) : null}
						</View>

						<TerminalPanel lines={data.terminalLog} />

						{data.routedMessages.length > 0 ? (
							<View className="gap-3">
								<Eyebrow>{t('session.messagesRoutedHere')}</Eyebrow>
								<View className="gap-4">
									{data.routedMessages.map(entry => (
										<TranscriptBubble key={entry.entryId} entry={entry} />
									))}
								</View>
							</View>
						) : null}
					</>
				)}
			</ScrollView>

			{data ? (
				<View style={{ paddingBottom: insets.bottom }}>
					<IssueSteerComposer issueId={issueId} />
				</View>
			) : null}
		</KeyboardAware>
	)
}

/** The one dark surface in the console: a monospace terminal log on near-black. */
function TerminalPanel({ lines }: { lines: Detail['terminalLog'] }) {
	const { t } = useTranslation()
	return (
		<View className="gap-3">
			<Eyebrow>{t('session.terminalSession')}</Eyebrow>
			<View className="rounded-xl p-4" style={{ backgroundColor: surfaces.terminal }}>
				{lines.length === 0 ? (
					<Text className="font-mono text-sm" style={{ color: surfaces.terminalDim }}>
						{t('session.waitingTerminal')}
					</Text>
				) : (
					lines.map((line, i) => (
						<View key={`${line.at}-${i}`} className="flex-row gap-2">
							<Text className="font-mono text-sm" style={{ color: surfaces.terminalDim }}>
								›
							</Text>
							<Text className="flex-1 font-mono text-sm" style={{ color: surfaces.terminalText }}>
								{line.line}
							</Text>
						</View>
					))
				)}
			</View>
		</View>
	)
}

function IssueSteerComposer({ issueId }: { issueId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const [text, setText] = useState('')
	const steer = useSteerIssue()
	const canSend = !!text.trim() && !steer.isPending

	const send = () => {
		const trimmed = text.trim()
		if (!trimmed || steer.isPending) return
		steer.mutate(
			{ issueId, data: { text: trimmed } },
			{
				onSuccess: () => {
					setText('')
					queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(issueId) })
				},
			},
		)
	}

	return (
		<View className="gap-2 border-t border-border bg-route-background px-5 pb-2 pt-3">
			<View className="flex-row items-end gap-2 rounded-xl border bg-card p-2" style={{ borderColor: border.border }}>
				<TextInput
					value={text}
					onChangeText={setText}
					placeholder={t('session.steerPlaceholder')}
					placeholderTextColor={fg.fg3}
					multiline
					className="min-h-9 flex-1 px-2 py-1.5 font-sans text-sm text-foreground"
				/>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t('session.steer')}
					disabled={!canSend}
					onPress={send}
					hitSlop={8}
					className={canSend ? 'h-9 w-9 items-center justify-center rounded-pill bg-primary' : 'h-9 w-9 items-center justify-center rounded-pill bg-muted'}
				>
					<ArrowUp size={18} color={canSend ? action.onPrimary : fg.fg3} strokeWidth={2.5} />
				</Pressable>
			</View>
			<Text className="px-1 font-sans text-[11px] text-muted-foreground">{t('session.steerHint')}</Text>
		</View>
	)
}
