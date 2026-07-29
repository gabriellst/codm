import { type ReactElement, type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
	getThreadSettingsQueryKey,
	useConfigureContextBuffer,
	useConfigureMentionGate,
	useGetSessionChat,
	useGetThreadSettings,
	useSetParticipantInvocation,
} from '@codedm/client-typescript/typescript'
import type { BufferSize } from '@codedm/client-typescript/typescript'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { ThreadAvatar } from '@/components/console/ThreadAvatar'
import { cn } from '@/lib/utils'

const BUFFER_SIZES: BufferSize[] = ['25', '50', '100', '200']

/**
 * A section heading in this dialog — sentence case, muted, with a hairline under it.
 *
 * Deliberately NOT `label-eyebrow`: that class is uppercase with letter-spacing, which is the
 * console's eyebrow voice for page sections. Inside a modal the design uses a quieter, plain label
 * whose job is to separate three short groups, and the rule under it does the separating.
 */
function SectionLabel({ children }: { children: ReactNode }) {
	return <h3 className="border-b border-border pb-2 text-sm font-medium text-muted-foreground">{children}</h3>
}

/** Per-thread behavior modal (T10): respond trigger, who can invoke agents, and context buffer depth. */
export function ThreadSettingsDialog({ threadId, trigger }: { threadId: string; trigger: ReactElement }) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)
	// The thread's name, for the subtitle. Its own query rather than a prop: React Query already holds
	// this exact key (the header mounts it), so it costs no request and keeps the dialog owning its data.
	const { data: session } = useGetSessionChat(threadId)

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={trigger} />
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{t('session.settingsTitle')}</DialogTitle>
					<DialogDescription>
						{session ? t('session.settingsDescriptionNamed', { name: session.thread.displayName }) : t('session.settingsDescription')}
					</DialogDescription>
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
				<SectionLabel>{t('session.respondTrigger')}</SectionLabel>
				{/* Switch FIRST, then the label, then the tag — the design reads left to right as
				    "[on/off] only respond when mentioned, with [@tag]", which is the sentence the control
				    actually makes. The tag input stays VISIBLE while the gate is off, just disabled: hiding
				    it made the row jump height on every toggle and hid the value the operator was about to
				    need. */}
				<label className="flex items-center gap-3">
					<Switch
						checked={gateEnabled}
						onCheckedChange={value => {
							setGateEnabled(value)
							saveGate(value, tag)
						}}
					/>
					<span className="flex-1 text-sm font-medium text-foreground">{t('session.onlyWhenMentioned')}</span>
					<Input
						aria-label={t('session.mentionTag')}
						placeholder={t('session.mentionTagPlaceholder')}
						className="w-36 shrink-0 rounded-full text-sm"
						disabled={!gateEnabled}
						value={tag}
						onChange={e => setTag(e.target.value)}
						onBlur={() => saveGate(true, tag)}
					/>
				</label>
			</section>

			<section className="flex flex-col gap-3">
				<SectionLabel>{t('session.participantsWhoCanInvoke')}</SectionLabel>
				{/* Plain rows, no bordered card: the heading's rule already groups them, and a second box
				    inside a modal is one frame too many. The avatar is what makes a roster scannable. */}
				<div className="flex flex-col gap-1">
					{data.participants.map(participant => (
						<label key={participant.participantId} className="flex items-center gap-3 py-1.5">
							<ThreadAvatar name={participant.name} />
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="truncate text-sm font-semibold text-foreground">{participant.name}</span>
								<span className="truncate text-xs text-muted-foreground">{participant.source}</span>
							</div>
							<span className="shrink-0 text-sm text-muted-foreground">{t('session.canInvokeToggle')}</span>
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
				<SectionLabel>{t('session.contextBuffer')}</SectionLabel>
				{/* Explanation ABOVE the control — it says what the numbers mean, so reading it after
				    choosing is backwards. */}
				<p className="text-sm text-muted-foreground">{t('session.contextBufferHint')}</p>
				{/* Individual outlined pills rather than a segmented track: the sizes are four discrete
				    choices, and the filled one is the current depth. `messages` trails them as the unit. */}
				<div className="flex flex-wrap items-center gap-2">
					{BUFFER_SIZES.map(size => (
						<button
							key={size}
							type="button"
							aria-pressed={data.bufferSize === size}
							onClick={() => configureBuffer.mutate({ threadId, data: { bufferSize: size } }, { onSuccess: invalidate })}
							className={cn(
								'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
								data.bufferSize === size
									? 'border-transparent bg-primary text-primary-foreground'
									: 'border-input text-foreground hover:bg-muted',
							)}
						>
							{String(size)}
						</button>
					))}
					<span className="text-sm text-muted-foreground">{t('session.bufferMessages')}</span>
				</div>
			</section>
		</div>
	)
}
