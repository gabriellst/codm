import { useState } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowUp } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { getSessionChatQueryKey, useSendDirectMessage, useSteerThread } from '@codm/client-typescript/typescript'
import type { ThreadMode } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * The composer (T09). Whisper (STEER) reaches agents only, via `SteerThread`; Direct (DIRECT) sends
 * the operator's own reply to the channel, via `SendDirectMessage`.
 *
 * ### F4 — THE SELECTOR IS GONE, and the state decides
 * There used to be a two-way toggle here, seeded from `composerMode` and flippable per message. It
 * asked the operator to answer, every time, a question the app already knew the answer to — and
 * because it was local state seeded once, it could also drift out of step with a thread that paused
 * or resumed underneath it, so Enter did one thing while the header said another.
 *
 * `composerMode` is now the whole decision, computed server-side in `GetSessionChat`: **paused →
 * STEER, running → DIRECT**. A paused thread answers nobody, so what you type is instruction for the
 * agents; a running thread is a live conversation, so what you type is for the people in it. The
 * hint line under the box says which, in words, on every render — the state is still visible, it
 * just is not a control any more.
 */
export function Composer({
	threadId,
	composerMode,
	className,
	...props
}: ComponentProps<'div'> & { threadId: string; composerMode: ThreadMode }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const [text, setText] = useState('')
	const steer = useSteerThread()
	const direct = useSendDirectMessage()
	// Read straight from the prop — no `useState` seed. The thread pausing while this box is focused
	// must change what Enter does, and a seeded copy is exactly what stopped that from happening.
	const mode = composerMode

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
		<div
			{...props}
			data-testid="composer"
			data-mode={mode}
			className={cn('sticky bottom-0 z-10 flex flex-col gap-2 bg-route-background pb-2 pt-4', className)}
		>
			{/* Shape owned by the CLI's `composer` block: bun cli component <route> <Name> --mutation=<Hook> */}
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
