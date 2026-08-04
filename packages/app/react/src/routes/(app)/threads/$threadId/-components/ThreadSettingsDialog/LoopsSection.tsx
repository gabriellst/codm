import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconClockPlus, IconPencil, IconTrash } from '@tabler/icons-react'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import {
	createThreadLoopMutationRequestSchema,
	updateThreadLoopMutationRequestSchema,
	listThreadLoopsQueryKey,
	useCreateThreadLoop,
	useDeleteThreadLoop,
	useListThreadLoops,
	useSetThreadLoopEnabled,
	useUpdateThreadLoop,
	DayOfWeekEnum,
	type DayOfWeek,
	type ListThreadLoopsQueryResponse,
} from '@codm/client-typescript/typescript'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useLocale } from '@/hooks'
import { useDialogStore } from '@/stores/useDialogStore'
import { cn } from '@/lib/utils'

/** One row of the list — the SDK's own element type, never a hand-written mirror of it. */
type Loop = ListThreadLoopsQueryResponse['loops'][number]

/**
 * The week, MONDAY-first — the order the pills render in.
 *
 * `Object.values(DayOfWeek)` would do it too and is the house habit for iterating an enum, but the
 * ORDER here is a design decision (a Brazilian week starts on Monday) rather than an accident of the
 * contract's declaration order, so it is stated. Typed as the enum, so a new member is a tsc error
 * rather than a day that silently never appears in the picker.
 */
const WEEK: DayOfWeek[] = [
	DayOfWeekEnum.MONDAY,
	DayOfWeekEnum.TUESDAY,
	DayOfWeekEnum.WEDNESDAY,
	DayOfWeekEnum.THURSDAY,
	DayOfWeekEnum.FRIDAY,
	DayOfWeekEnum.SATURDAY,
	DayOfWeekEnum.SUNDAY,
]

/**
 * The zone the operator's own machine is in — what a new loop is scheduled against.
 *
 * Read from the browser rather than offered as a picker, because "09:00" in this dialog can only
 * sensibly mean "09:00 where I am": the console and the daemon run on the same desktop. It still
 * travels EXPLICITLY on the wire (the backend never guesses a zone) and the form shows which one it
 * resolved to, so a loop created on a laptop that later crosses a timezone still says what it means.
 */
const localTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * LOOPS — the conversation's scheduled prompts (T11 / C21-C24).
 *
 * Lives in the settings dialog, spanning both columns, because a loop is per-conversation behaviour
 * exactly like the mention gate and the custom prompt above it: this is the screen the operator is
 * already on when they think "and every Monday, ask about the deploy".
 *
 * The form is INLINE rather than a nested dialog. `useDialogStore().show()` REPLACES the current
 * dialog's content (it is what `confirm()` does two sections down), so opening a loop editor that way
 * would unmount the settings dialog and drop the operator somewhere else on save. An inline editor
 * keeps one screen and one mental context.
 */
export function LoopsSection({ threadId, className, ...props }: { threadId: string } & ComponentProps<'section'>) {
	const { t } = useTranslation()
	const { data, isLoading } = useListThreadLoops(threadId)

	/**
	 * WHICH editor is open — case 5 of the state-placement rule (transient, private, not deep-linkable):
	 * it lives and dies with this dialog, and nothing outside the section reads it.
	 */
	const [editing, setEditing] = useState<{ loop?: Loop } | null>(null)

	return (
		<section className={cn('flex flex-col gap-3', className)} {...props}>
			<div className="flex items-center justify-between gap-4 border-b border-border pb-2">
				<h3 className="text-sm font-medium text-muted-foreground">{t('session.loops.sectionTitle')}</h3>
				<Button variant="outline" size="sm" className="shrink-0" disabled={editing !== null} onClick={() => setEditing({})}>
					<IconClockPlus data-icon="inline-start" /> {t('session.loops.add')}
				</Button>
			</div>
			<p className="text-sm text-muted-foreground">{t('session.loops.hint')}</p>

			{isLoading || !data ? (
				<Skeleton className="h-24 rounded-xl" />
			) : (
				<div className="flex flex-col gap-2">
					{data.loops.map(loop => (
						<LoopRow key={loop.loopId} threadId={threadId} loop={loop} onEdit={() => setEditing({ loop })} />
					))}
					{/* The empty state is only worth its space while there is nothing to show AND no editor
					    open — once the operator is typing, the explanation has done its job. */}
					{data.loops.length === 0 && editing === null ? (
						<div className="rounded-xl border border-dashed border-border p-6 text-center">
							<p className="text-sm font-medium text-foreground">{t('session.loops.emptyTitle')}</p>
							<p className="mt-1 text-sm text-muted-foreground">{t('session.loops.emptyDescription')}</p>
						</div>
					) : null}
					{editing !== null ? (
						<LoopForm threadId={threadId} loop={editing.loop} promptMaxLength={data.promptMaxLength} onDone={() => setEditing(null)} />
					) : null}
				</div>
			)}
		</section>
	)
}

/**
 * One scheduled prompt, as a row: what it says, when it repeats, and the switch that pauses it.
 *
 * A LEAF — it receives its loop by prop from the list that owns the query (the documented exception to
 * "every component owns its data": the parent already mapped this array).
 */
function LoopRow({ threadId, loop, onEdit }: { threadId: string; loop: Loop; onEdit: () => void }) {
	const { t } = useTranslation()
	const locale = useLocale()
	const queryClient = useQueryClient()
	const { confirm } = useDialogStore()

	const invalidate = () => queryClient.invalidateQueries({ queryKey: listThreadLoopsQueryKey(threadId) })
	const setEnabled = useSetThreadLoopEnabled({ mutation: { onSuccess: invalidate } })
	const remove = useDeleteThreadLoop({ mutation: { onSuccess: invalidate } })

	const onDelete = async () => {
		const ok = await confirm({
			title: t('session.loops.deleteConfirmTitle'),
			description: t('session.loops.deleteConfirmDescription'),
			actionLabel: t('session.loops.deleteConfirmAction'),
			cancelLabel: t('common.cancel'),
			variant: 'destructive',
		})
		if (!ok) return
		remove.mutate({ threadId, loopId: loop.loopId })
	}

	const when = (iso?: string) =>
		iso
			? new Date(iso).toLocaleString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
			: null

	return (
		<div className={cn('flex items-start gap-3 rounded-xl border border-border p-3', !loop.enabled && 'opacity-60')}>
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<p className="line-clamp-2 text-sm text-foreground">{loop.prompt}</p>
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="secondary" className="font-mono">
						{loop.timeOfDay}
					</Badge>
					{/* The weekday set, in week order — the same order the picker renders, so editing a loop
					    never reshuffles what the operator just read. */}
					{WEEK.filter(day => loop.weekdays.includes(day)).map(day => (
						<Badge key={day} variant="outline">
							{t(`enums.DayOfWeek.${day}`)}
						</Badge>
					))}
					<span className="text-xs text-muted-foreground">
						{loop.enabled ? t('session.loops.nextRun', { when: when(loop.nextRunAt) }) : t('session.loops.paused')}
					</span>
					<span className="text-xs text-muted-foreground">
						{t('session.loops.lastFired', { when: when(loop.lastFiredAt) ?? t('session.loops.never') })}
					</span>
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-1">
				<Switch
					aria-label={t('session.loops.enabledToggle')}
					checked={loop.enabled}
					disabled={setEnabled.isPending}
					onCheckedChange={enabled => setEnabled.mutate({ threadId, loopId: loop.loopId, data: { enabled } })}
				/>
				<Button variant="ghost" size="icon" aria-label={t('session.loops.edit')} onClick={onEdit}>
					<IconPencil />
				</Button>
				<Button variant="ghost" size="icon" aria-label={t('session.loops.delete')} disabled={remove.isPending} onClick={onDelete}>
					<IconTrash />
				</Button>
			</div>
		</div>
	)
}

/**
 * Create or edit — ONE form, because the fields are the same three and the difference is only which
 * mutation the submit calls. A second component would be the same JSX twice.
 *
 * Validated by the SDK's own schema for THE ENDPOINT THIS SUBMIT POSTS TO — create's while creating,
 * update's while editing. The two are identical today, and picking by mode anyway is what keeps that
 * a coincidence rather than an assumption: the day one of them grows a field, the form follows it.
 * Either way the time pattern, the 1-2000 character range and "at least one weekday" are stated once,
 * on the backend, and this form cannot drift from them.
 */
function LoopForm({
	threadId,
	loop,
	promptMaxLength,
	onDone,
}: {
	threadId: string
	loop?: Loop
	promptMaxLength: number
	onDone: () => void
}) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const invalidateAndClose = () => {
		queryClient.invalidateQueries({ queryKey: listThreadLoopsQueryKey(threadId) })
		onDone()
	}
	const create = useCreateThreadLoop({ mutation: { onSuccess: invalidateAndClose } })
	const update = useUpdateThreadLoop({ mutation: { onSuccess: invalidateAndClose } })

	const timezone = loop?.timezone ?? localTimezone()

	const form = useForm({
		defaultValues: {
			prompt: loop?.prompt ?? '',
			schedule: {
				timeOfDay: loop?.timeOfDay ?? '09:00',
				weekdays: loop?.weekdays ?? [DayOfWeekEnum.MONDAY],
				timezone,
			},
		},
		validators: { onChange: loop ? updateThreadLoopMutationRequestSchema : createThreadLoopMutationRequestSchema },
		onSubmit: async ({ value }) => {
			if (loop) update.mutate({ threadId, loopId: loop.loopId, data: value })
			else create.mutate({ threadId, data: value })
		},
	})

	const isPending = create.isPending || update.isPending

	return (
		<form
			noValidate
			className="flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-3"
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<form.Field name="prompt">
				{field => (
					<Field>
						<FieldLabel htmlFor={field.name}>{t('session.loops.promptLabel')}</FieldLabel>
						<Textarea
							id={field.name}
							className="min-h-24 resize-none"
							placeholder={t('session.loops.promptPlaceholder')}
							maxLength={promptMaxLength}
							value={field.state.value}
							onBlur={field.handleBlur}
							onChange={e => field.handleChange(e.target.value)}
						/>
						<span className="text-xs text-muted-foreground">
							{/* Counts down against the cap the backend validates — it rides in the DTO precisely so
							    the two cannot disagree. */}
							{t('session.loops.promptCounter', { used: field.state.value.length, max: promptMaxLength })}
						</span>
						{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
					</Field>
				)}
			</form.Field>

			<div className="flex flex-wrap items-end gap-6">
				<form.Field name="schedule.timeOfDay">
					{field => (
						<Field className="w-32">
							<FieldLabel htmlFor={field.name}>{t('session.loops.timeLabel')}</FieldLabel>
							<Input
								id={field.name}
								type="time"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={e => field.handleChange(e.target.value)}
							/>
						</Field>
					)}
				</form.Field>

				<form.Field name="schedule.weekdays">
					{field => (
						<Field className="flex-1">
							<FieldLabel>{t('session.loops.weekdaysLabel')}</FieldLabel>
							{/* Individual pills rather than a segmented track, and MULTI-select: the same shape the
							    context-buffer tiers use in the column next door, with the one difference that here
							    every pressed pill counts. */}
							<div className="flex flex-wrap items-center gap-2">
								{WEEK.map(day => {
									const selected = field.state.value.includes(day)
									return (
										<button
											key={day}
											type="button"
											aria-pressed={selected}
											onClick={() =>
												field.handleChange(selected ? field.state.value.filter((d: DayOfWeek) => d !== day) : [...field.state.value, day])
											}
											className={cn(
												'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
												selected ? 'border-transparent bg-primary text-primary-foreground' : 'border-input text-foreground hover:bg-muted',
											)}
										>
											{t(`enums.DayOfWeek.${day}`)}
										</button>
									)
								})}
							</div>
							{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
						</Field>
					)}
				</form.Field>
			</div>

			<div className="flex items-center justify-between gap-4">
				<span className="text-xs text-muted-foreground">{t('session.loops.timezoneNote', { timezone })}</span>
				<div className="flex items-center gap-2">
					<Button type="button" variant="ghost" onClick={onDone}>
						{t('session.loops.cancel')}
					</Button>
					<form.Subscribe selector={s => [s.canSubmit] as const}>
						{([canSubmit]) => (
							<Button type="submit" disabled={!canSubmit || isPending}>
								{t('session.loops.save')}
							</Button>
						)}
					</form.Subscribe>
				</div>
			</div>
		</form>
	)
}
