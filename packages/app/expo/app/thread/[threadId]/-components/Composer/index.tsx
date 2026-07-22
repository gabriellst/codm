import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUp } from 'lucide-react-native'
import { getSessionChatQueryKey, useSendDirectMessage, useSteerThread } from '@codedm/client-typescript/typescript'
import type { ThreadMode } from '@codedm/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { action, border, fg } from '@/lib/tokens'

const MODES: { value: ThreadMode; labelKey: 'session.whisper' | 'session.direct' }[] = [
	{ value: 'STEER', labelKey: 'session.whisper' },
	{ value: 'DIRECT', labelKey: 'session.direct' },
]

/**
 * Mode-aware composer. Whisper (STEER) reaches agents only via SteerThread;
 * Direct (DIRECT) sends the operator's own reply to the channel via
 * SendDirectMessage. Seeded from the read's `composerMode`, switchable either way.
 */
export function Composer({ threadId, composerMode }: { threadId: string; composerMode: ThreadMode }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const [mode, setMode] = useState<ThreadMode>(composerMode)
	const [text, setText] = useState('')
	const steer = useSteerThread()
	const direct = useSendDirectMessage()

	const pending = steer.isPending || direct.isPending

	const send = () => {
		const trimmed = text.trim()
		if (!trimmed || pending) return
		const onSuccess = () => {
			setText('')
			queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) })
		}
		if (mode === 'STEER') steer.mutate({ threadId, data: { text: trimmed } }, { onSuccess })
		else direct.mutate({ threadId, data: { text: trimmed } }, { onSuccess })
	}

	const canSend = !!text.trim() && !pending

	return (
		<View className="gap-2 border-t border-border bg-route-background px-5 pb-2 pt-3">
			<View className="flex-row items-center gap-1 self-start rounded-pill bg-secondary p-1">
				{MODES.map(m => (
					<Pressable
						key={m.value}
						onPress={() => setMode(m.value)}
						className={cn('rounded-pill px-3 py-1', mode === m.value ? 'bg-card' : 'bg-transparent')}
					>
						<Text className={cn('font-sans-medium text-sm', mode === m.value ? 'text-foreground' : 'text-muted-foreground')}>
							{t(m.labelKey)}
						</Text>
					</Pressable>
				))}
			</View>

			<View className="flex-row items-end gap-2 rounded-xl border bg-card p-2" style={{ borderColor: border.border }}>
				<TextInput
					value={text}
					onChangeText={setText}
					placeholder={mode === 'STEER' ? t('session.whisperPlaceholder') : t('session.directPlaceholder')}
					placeholderTextColor={fg.fg3}
					multiline
					className="min-h-9 flex-1 px-2 py-1.5 font-sans text-sm text-foreground"
				/>
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={t('session.send')}
					disabled={!canSend}
					onPress={send}
					className={cn('h-9 w-9 items-center justify-center rounded-pill', canSend ? 'bg-primary' : 'bg-muted')}
				>
					<ArrowUp size={18} color={canSend ? action.onPrimary : fg.fg3} strokeWidth={2.5} />
				</Pressable>
			</View>

			<Text className="px-1 font-sans text-[11px] text-muted-foreground">
				{mode === 'STEER' ? t('session.whisperHint') : t('session.directHint')}
			</Text>
		</View>
	)
}
