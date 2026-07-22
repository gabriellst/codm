import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { router } from 'expo-router'
import type { GetSessionChatQueryResponse } from '@codedm/client-typescript/typescript'
import { providerLabelKey } from './glyphs'
import { Dot } from './StatusDot'

type Entry = GetSessionChatQueryResponse['transcript'][number]

/**
 * One transcript line, shared by the thread session and the issue drill-down.
 * CONTACT sits left in a soft bubble; AGENT / OPERATOR_DIRECT sit right in a
 * black bubble; WHISPER is a right-aligned agents-only aside; ACTION is a
 * full-width system line (classifications, edits, test runs).
 */
export function TranscriptBubble({ entry }: { entry: Entry }) {
	const { t } = useTranslation()

	if (entry.kind === 'ACTION') {
		return (
			<View className="flex-row items-start gap-2 py-0.5">
				<Dot className="mt-1.5 bg-muted-foreground" />
				<Text className="flex-1 font-sans text-sm text-muted-foreground">{entry.text}</Text>
			</View>
		)
	}

	if (entry.kind === 'CONTACT') {
		return (
			<View className="max-w-[85%] items-start gap-1 self-start">
				<View className="rounded-xl bg-secondary px-4 py-2.5">
					<Text className="font-sans text-sm text-foreground">{entry.text}</Text>
				</View>
				<Text className="px-1 font-sans text-[11px] text-muted-foreground">{entry.at}</Text>
			</View>
		)
	}

	const isWhisper = entry.kind === 'WHISPER'
	const caption =
		entry.kind === 'AGENT'
			? entry.provider
				? t(providerLabelKey(entry.provider))
				: t('session.agentCaption')
			: isWhisper
				? t('session.whisperCaption')
				: t('session.youCaption')

	return (
		<View className="max-w-[85%] items-end gap-1 self-end">
			<View className="flex-row items-center gap-2 px-1">
				{entry.issueId ? (
					<Pressable
						onPress={() => router.push(`/issue/${entry.issueId}`)}
						className="flex-row items-center gap-1 rounded-pill border border-border px-2 py-0.5"
					>
						<Dot className="bg-info" />
						<Text className="font-mono text-[11px] text-muted-foreground">{t('session.issueRef')}</Text>
					</Pressable>
				) : null}
				<Text className="font-sans text-[11px] text-muted-foreground">{caption}</Text>
			</View>
			<View className={isWhisper ? 'rounded-xl border border-dashed border-border bg-muted px-4 py-2.5' : 'rounded-xl bg-primary px-4 py-2.5'}>
				<Text className={isWhisper ? 'font-sans text-sm italic text-muted-foreground' : 'font-sans text-sm text-primary-foreground'}>
					{entry.text}
				</Text>
			</View>
			<Text className="px-1 font-sans text-[11px] text-muted-foreground">{entry.at}</Text>
		</View>
	)
}
