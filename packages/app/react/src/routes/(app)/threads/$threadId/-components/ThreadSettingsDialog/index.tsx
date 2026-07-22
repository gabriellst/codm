import { type ReactElement, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
	getThreadSettingsQueryKey,
	useConfigureContextBuffer,
	useConfigureMentionGate,
	useGetThreadSettings,
	useSetParticipantInvocation,
} from '@codedm/client-typescript/typescript'
import type { BufferSize } from '@codedm/client-typescript/typescript'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const BUFFER_SIZES: BufferSize[] = ['25', '50', '100', '200']

/** Per-thread behavior modal (T10): respond trigger, who can invoke agents, and context buffer depth. */
export function ThreadSettingsDialog({ threadId, trigger }: { threadId: string; trigger: ReactElement }) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={trigger} />
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{t('session.settingsTitle')}</DialogTitle>
					<DialogDescription>{t('session.settingsDescription')}</DialogDescription>
				</DialogHeader>
				{open && <ThreadSettingsBody threadId={threadId} />}
			</DialogContent>
		</Dialog>
	)
}

function ThreadSettingsBody({ threadId }: { threadId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetThreadSettings(threadId)
	const configureMentionGate = useConfigureMentionGate()
	const configureBuffer = useConfigureContextBuffer()
	const setInvocation = useSetParticipantInvocation()

	const [gateEnabled, setGateEnabled] = useState(false)
	const [tag, setTag] = useState('')

	useEffect(() => {
		if (!data) return
		setGateEnabled(data.mentionGate.enabled)
		setTag(data.mentionGate.enabled ? data.mentionGate.tag : '')
	}, [data])

	const invalidate = () => queryClient.invalidateQueries({ queryKey: getThreadSettingsQueryKey(threadId) })

	const saveGate = (enabled: boolean, nextTag: string) => {
		const mentionGate = enabled ? { enabled: true as const, tag: nextTag } : { enabled: false as const }
		configureMentionGate.mutate({ threadId, data: { mentionGate } }, { onSuccess: invalidate })
	}

	if (isLoading || !data) {
		return (
			<div className="flex flex-col gap-4">
				<Skeleton className="h-14 rounded-xl" />
				<Skeleton className="h-24 rounded-xl" />
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-6">
			<section className="flex flex-col gap-3">
				<h3 className="label-eyebrow">{t('session.respondTrigger')}</h3>
				<label className="flex items-center gap-4">
					<div className="flex flex-1 flex-col">
						<span className="text-sm font-medium text-foreground">{t('session.onlyWhenMentioned')}</span>
						<span className="text-sm text-muted-foreground">{t('session.onlyWhenMentionedHint')}</span>
					</div>
					<Switch
						checked={gateEnabled}
						onCheckedChange={value => {
							setGateEnabled(value)
							saveGate(value, tag)
						}}
					/>
				</label>
				{gateEnabled && (
					<Input
						aria-label={t('session.mentionTag')}
						placeholder={t('session.mentionTagPlaceholder')}
						value={tag}
						onChange={e => setTag(e.target.value)}
						onBlur={() => saveGate(true, tag)}
					/>
				)}
			</section>

			<section className="flex flex-col gap-3">
				<div className="flex items-center justify-between">
					<h3 className="label-eyebrow">{t('session.participants')}</h3>
					<span className="text-xs text-muted-foreground">{t('session.canInvoke', { count: data.invokerCount })}</span>
				</div>
				<div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border">
					{data.participants.map(participant => (
						<label key={participant.participantId} className="flex items-center gap-4 p-3">
							<div className="flex flex-1 flex-col">
								<span className="text-sm font-medium text-foreground">{participant.name}</span>
								<span className="text-xs text-muted-foreground">{participant.source}</span>
							</div>
							<Switch
								checked={participant.canInvoke}
								onCheckedChange={value =>
									setInvocation.mutate(
										{ threadId, participantId: participant.participantId, data: { canInvoke: value } },
										{ onSuccess: invalidate },
									)
								}
							/>
						</label>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<h3 className="label-eyebrow">{t('session.contextBuffer')}</h3>
				<div className="inline-flex items-center gap-1 rounded-full bg-secondary p-1">
					{BUFFER_SIZES.map(size => (
						<button
							key={size}
							type="button"
							onClick={() => configureBuffer.mutate({ threadId, data: { bufferSize: size } }, { onSuccess: invalidate })}
							className={cn(
								'rounded-full px-3.5 py-1 text-sm font-medium transition-colors',
								data.bufferSize === size ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
							)}
						>
							{String(size)}
						</button>
					))}
				</div>
				<p className="text-sm text-muted-foreground">{t('session.contextBufferHint')}</p>
			</section>
		</div>
	)
}
