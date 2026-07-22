import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowUp } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { getSessionChatQueryKey, useSendDirectMessage, useSteerThread } from '@codedm/client-typescript/typescript'
import type { ThreadMode } from '@codedm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const MODES: { value: ThreadMode; labelKey: string }[] = [
	{ value: 'STEER', labelKey: 'session.modeWhisper' },
	{ value: 'DIRECT', labelKey: 'session.modeDirect' },
]

/**
 * Mode-aware composer (T09). Whisper (STEER) reaches agents only via SteerThread;
 * Direct (DIRECT) sends the operator's own reply to the channel via SendDirectMessage.
 * Seeded from the read's `composerMode` but the operator can switch either way.
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

	return (
		<div className="sticky bottom-0 z-10 flex flex-col gap-2 bg-route-background pb-2 pt-4">
			<div className="inline-flex w-fit items-center gap-1 rounded-full bg-secondary p-1">
				{MODES.map(m => (
					<button
						key={m.value}
						type="button"
						onClick={() => setMode(m.value)}
						className={cn(
							'rounded-full px-3 py-1 text-sm font-medium transition-colors',
							mode === m.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
						)}
					>
						{t(m.labelKey)}
					</button>
				))}
			</div>
			<div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2">
				<Textarea
					value={text}
					onChange={e => setText(e.target.value)}
					onKeyDown={e => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault()
							send()
						}
					}}
					placeholder={mode === 'STEER' ? t('session.composerPlaceholderSteer') : t('session.composerPlaceholderDirect')}
					className="min-h-10 flex-1 resize-none border-0 bg-transparent focus-visible:ring-0"
				/>
				<Button size="icon" aria-label={t('session.send')} disabled={!text.trim() || pending} onClick={send}>
					<IconArrowUp />
				</Button>
			</div>
			<p className="px-1 text-xs text-muted-foreground">
				{mode === 'STEER' ? t('session.composerSteerHint') : t('session.composerDirectHint')}
			</p>
		</div>
	)
}
