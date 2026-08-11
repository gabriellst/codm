import { useState, type ComponentProps, type ReactNode } from 'react'
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
	LoopScheduleKindEnum,
	type DayOfWeek,
	type LoopScheduleKind,
	type CreateThreadLoopMutationRequest,
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
import { pickUnionVariantField } from '@/lib/union'
import { cn } from '@/lib/utils'

/** One row of the list — the SDK's own element type, never a hand-written mirror of it. */
type Loop = ListThreadLoopsQueryResponse['loops'][number]

/**
 * WHEN a loop fires, as the wire models it: a union, discriminated by `kind`.
 *
 * Taken from the WRITE schema rather than the read one, because it is the shape this section has to
 * produce — and the read's is structurally the same, so a listed loop's schedule feeds an edit form
 * with nothing in between.
 */
type LoopScheduleValue = CreateThreadLoopMutationRequest['schedule']
type DailyScheduleValue = Extract<LoopScheduleValue, { kind: typeof LoopScheduleKindEnum.DAILY }>
type IntervalScheduleValue = Extract<LoopScheduleValue, { kind: typeof LoopScheduleKindEnum.INTERVAL }>

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

/** The two shapes a schedule can have, in the order the selector offers them. */
const SCHEDULE_KINDS: LoopScheduleKind[] = [LoopScheduleKindEnum.DAILY, LoopScheduleKindEnum.INTERVAL]

/**
 * THE VALIDATORS, taken field by field off the SDK union — never hand-rolled, never the whole body.
 *
 * The body's `schedule` is a union, and a union member cannot be a TanStack `validators.onChange`:
 * the form's values are ONE member, and the schema's input is the union, which TypeScript refuses
 * (FRM-P43(b) — TS2322). What IS a valid `onChange` is a single field's sub-schema, which is exactly
 * what `pickUnionVariantField` returns (FRM-P44). So each leaf validates against its own member's own
 * field, and the SUBMIT re-checks the whole body with the endpoint's schema.
 *
 * The consequence worth stating: the time pattern, the 1-2000 character range, "at least one weekday"
 * and the 1-1440 cadence bounds are all declared once, on the backend, and this form cannot drift.
 */
const SCHEDULE_UNION = createThreadLoopMutationRequestSchema.shape.schedule
const PROMPT_SCHEMA = createThreadLoopMutationRequestSchema.shape.prompt
const DAILY_MATCH = { kind: LoopScheduleKindEnum.DAILY } as const
const INTERVAL_MATCH = { kind: LoopScheduleKindEnum.INTERVAL } as const
const TIME_OF_DAY_SCHEMA = pickUnionVariantField(SCHEDULE_UNION, DAILY_MATCH, 'timeOfDay')
const WEEKDAYS_SCHEMA = pickUnionVariantField(SCHEDULE_UNION, DAILY_MATCH, 'weekdays')
const EVERY_MINUTES_SCHEMA = pickUnionVariantField(SCHEDULE_UNION, INTERVAL_MATCH, 'everyMinutes')

/**
 * The zone the operator's own machine is in — what a new wall-clock loop is scheduled against.
 *
 * Read from the browser rather than offered as a picker, because "09:00" in this dialog can only
 * sensibly mean "09:00 where I am": the console and the daemon run on the same desktop. It still
 * travels EXPLICITLY on the wire (the backend never guesses a zone) and the form shows which one it
 * resolved to, so a loop created on a laptop that later crosses a timezone still says what it means.
 *
 * A cadence has no use for it at all, which is exactly why it lives on one member and not the other.
 */
const localTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * What each member's form starts from: the loop's own schedule when it already HAS that shape, and a
 * sensible blank when the operator has just switched to it.
 *
 * One function per member rather than one that takes the kind, because each returns a different type —
 * which is the same reason the wire models this as a union in the first place.
 */
const dailyScheduleOf = (schedule: Loop['schedule'] | undefined, timezone: string): DailyScheduleValue =>
	schedule?.kind === LoopScheduleKindEnum.DAILY
		? schedule
		: { kind: LoopScheduleKindEnum.DAILY, timeOfDay: '09:00', weekdays: [DayOfWeekEnum.MONDAY], timezone }

const intervalScheduleOf = (schedule: Loop['schedule'] | undefined): IntervalScheduleValue =>
	schedule?.kind === LoopScheduleKindEnum.INTERVAL ? schedule : { kind: LoopScheduleKindEnum.INTERVAL, everyMinutes: 15 }

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
						<LoopEditor
							threadId={threadId}
							loop={editing.loop}
							promptMaxLength={data.promptMaxLength}
							minIntervalMinutes={data.minIntervalMinutes}
							maxIntervalMinutes={data.maxIntervalMinutes}
							onDone={() => setEditing(null)}
						/>
					) : null}
				</div>
			)}
		</section>
	)
}

/** The weekday pills of a wall-clock schedule, in week order. */
function DailyScheduleSummary({ schedule }: { schedule: DailyScheduleValue }) {
	const { t } = useTranslation()
	return (
		<>
			<Badge variant="secondary" size="compact" className="font-mono">
				{schedule.timeOfDay}
			</Badge>
			{/* The weekday set, in week order — the same order the picker renders, so editing a loop
			    never reshuffles what the operator just read. `size="compact"` (D3, R9): the design's
			    loop chips are the one place that keeps the smaller 3xs step; everywhere else moved to
			    the new 2xs default. */}
			{WEEK.filter(day => schedule.weekdays.includes(day)).map(day => (
				<Badge key={day} variant="outline" size="compact">
					{t(`enums.DayOfWeek.${day}`)}
				</Badge>
			))}
		</>
	)
}

/** The cadence of an interval schedule — one badge, because there is one thing to say. */
function IntervalScheduleSummary({ schedule }: { schedule: IntervalScheduleValue }) {
	const { t } = useTranslation()
	return (
		<Badge variant="secondary" size="compact">
			{t('session.loops.intervalBadge', { minutes: schedule.everyMinutes })}
		</Badge>
	)
}

/**
 * WHAT this loop repeats on, rendered per member.
 *
 * The discriminant selects the sub-component and each one receives its OWN member — the badges of a
 * cadence are not the badges of a wall clock with fields missing. Narrowed inline rather than through
 * a `Record<kind, Component>` map because the value being dispatched is the union itself: a map of
 * per-member components cannot be indexed by an un-narrowed discriminant without a cast, while these
 * two branches are proven by the type system — a third member of `LoopScheduleKind` would fail to
 * type-check here, which is the property the map exists to buy.
 */
function ScheduleSummary({ schedule }: { schedule: Loop['schedule'] }) {
	return schedule.kind === LoopScheduleKindEnum.DAILY ? (
		<DailyScheduleSummary schedule={schedule} />
	) : (
		<IntervalScheduleSummary schedule={schedule} />
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
					<ScheduleSummary schedule={loop.schedule} />
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

/** What every variant form needs to do its job, minus the schedule it is the form FOR. */
interface LoopFormProps {
	threadId: string
	loop?: Loop
	promptMaxLength: number
	/** The prompt as it stands, lifted so switching the schedule's shape does not discard it. */
	prompt: string
	onPromptChange: (prompt: string) => void
	onDone: () => void
}

/**
 * Create or edit — the CARD, which owns the one thing both shapes share: which shape it is.
 *
 * The discriminant is a SELECTOR here, in the literal sense: it picks the sub-form that renders, and
 * therefore the concrete member of the SDK union that validates. There is no combined form with every
 * field optional — a cadence has no time of day to leave blank.
 */
function LoopEditor({
	threadId,
	loop,
	promptMaxLength,
	minIntervalMinutes,
	maxIntervalMinutes,
	onDone,
}: {
	threadId: string
	loop?: Loop
	promptMaxLength: number
	minIntervalMinutes: number
	maxIntervalMinutes: number
	onDone: () => void
}) {
	const { t } = useTranslation()
	const timezone = loop?.schedule.kind === LoopScheduleKindEnum.DAILY ? loop.schedule.timezone : localTimezone()

	const [kind, setKind] = useState<LoopScheduleKind>(loop?.schedule.kind ?? LoopScheduleKindEnum.DAILY)
	/**
	 * The prompt lives HERE, above the sub-forms, and only because switching the shape unmounts one and
	 * mounts the other: without it, an operator who wrote three paragraphs and then changed their mind
	 * about the cadence would watch them disappear. Each sub-form still owns it as a real form field —
	 * this is the draft it starts from and reports back to, not a second source of truth.
	 */
	const [prompt, setPrompt] = useState(loop?.prompt ?? '')

	const shared: LoopFormProps = { threadId, loop, promptMaxLength, prompt, onPromptChange: setPrompt, onDone }

	// Sub-form dispatch by map — never a switch chain (CMP-P18). Each entry builds its member's form
	// with that member's own default value, so nothing here knows what a weekday or a cadence is.
	const SCHEDULE_FORMS: Record<LoopScheduleKind, ReactNode> = {
		[LoopScheduleKindEnum.DAILY]: <DailyLoopForm {...shared} schedule={dailyScheduleOf(loop?.schedule, timezone)} />,
		[LoopScheduleKindEnum.INTERVAL]: (
			<IntervalLoopForm
				{...shared}
				schedule={intervalScheduleOf(loop?.schedule)}
				minIntervalMinutes={minIntervalMinutes}
				maxIntervalMinutes={maxIntervalMinutes}
			/>
		),
	}

	return (
		<div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-3">
			<Field>
				<FieldLabel>{t('session.loops.kindLabel')}</FieldLabel>
				<div className="flex flex-wrap items-center gap-2">
					{SCHEDULE_KINDS.map(option => (
						<button
							key={option}
							type="button"
							aria-pressed={kind === option}
							onClick={() => setKind(option)}
							className={cn(
								'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
								kind === option ? 'border-transparent bg-primary text-primary-foreground' : 'border-input text-foreground hover:bg-muted',
							)}
						>
							{t(`enums.LoopScheduleKind.${option}`)}
						</button>
					))}
				</div>
			</Field>
			{SCHEDULE_FORMS[kind]}
		</div>
	)
}

/** Cancel + save, shared by the two sub-forms. `note` is whatever that member needs to explain. */
function LoopFormActions({
	note,
	canSubmit,
	isPending,
	onCancel,
}: {
	note?: string
	canSubmit: boolean
	isPending: boolean
	onCancel: () => void
}) {
	const { t } = useTranslation()
	return (
		<div className="flex items-center justify-between gap-4">
			<span className="text-xs text-muted-foreground">{note}</span>
			<div className="flex items-center gap-2">
				<Button type="button" variant="ghost" onClick={onCancel}>
					{t('session.loops.cancel')}
				</Button>
				<Button type="submit" disabled={!canSubmit || isPending}>
					{t('session.loops.save')}
				</Button>
			</div>
		</div>
	)
}

/**
 * The two mutations, wired the same way for both members: create while creating, update while editing,
 * and the list refetched on either.
 */
function useLoopSubmit(threadId: string, onDone: () => void) {
	const queryClient = useQueryClient()
	const invalidateAndClose = () => {
		queryClient.invalidateQueries({ queryKey: listThreadLoopsQueryKey(threadId) })
		onDone()
	}
	const create = useCreateThreadLoop({ mutation: { onSuccess: invalidateAndClose } })
	const update = useUpdateThreadLoop({ mutation: { onSuccess: invalidateAndClose } })

	return {
		isPending: create.isPending || update.isPending,
		/**
		 * THE SUBMIT GATE — the whole body, checked against the schema of the endpoint it is about to
		 * post to (create's while creating, update's while editing).
		 *
		 * The field validators above cover every rule already; this is what makes the WHOLE member the
		 * thing that has to be valid, not each field on its own, and it is the sanctioned place for a
		 * union schema that cannot be a `validators.onChange` (FRM-P43(b)).
		 */
		submit: (loop: Loop | undefined, value: CreateThreadLoopMutationRequest) => {
			const schema = loop ? updateThreadLoopMutationRequestSchema : createThreadLoopMutationRequestSchema
			const parsed = schema.safeParse(value)
			if (!parsed.success) return
			if (loop) update.mutate({ threadId, loopId: loop.loopId, data: parsed.data })
			else create.mutate({ threadId, data: parsed.data })
		},
	}
}

/** "Toda segunda e quarta às 09:00" — the wall-clock member's form. */
function DailyLoopForm({
	threadId,
	loop,
	promptMaxLength,
	prompt,
	onPromptChange,
	onDone,
	schedule,
}: LoopFormProps & { schedule: DailyScheduleValue }) {
	const { t } = useTranslation()
	const { submit, isPending } = useLoopSubmit(threadId, onDone)

	const form = useForm({
		defaultValues: { prompt, schedule },
		onSubmit: async ({ value }) => submit(loop, value),
	})

	return (
		<form
			noValidate
			className="flex flex-col gap-4"
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			{/* The prompt is the same field in both members, and it is written out in each of them rather
			    than extracted: a data field lives INSIDE its `form.Field` (architecture rail B), and a
			    shared presentational wrapper would leave the textarea outside one. Duplication across
			    variant forms is the sanctioned trade (FRM-P43(b)). */}
			<form.Field name="prompt" validators={{ onChange: PROMPT_SCHEMA }}>
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
							onChange={e => {
								field.handleChange(e.target.value)
								onPromptChange(e.target.value)
							}}
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
				<form.Field name="schedule.timeOfDay" validators={{ onChange: TIME_OF_DAY_SCHEMA }}>
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

				<form.Field name="schedule.weekdays" validators={{ onChange: WEEKDAYS_SCHEMA }}>
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

			<form.Subscribe selector={s => [s.canSubmit] as const}>
				{([canSubmit]) => (
					<LoopFormActions
						note={t('session.loops.timezoneNote', { timezone: schedule.timezone })}
						canSubmit={canSubmit}
						isPending={isPending}
						onCancel={onDone}
					/>
				)}
			</form.Subscribe>
		</form>
	)
}

/** "A cada 15 minutos" — the cadence member. One field, no zone, and bounds that come off the wire. */
function IntervalLoopForm({
	threadId,
	loop,
	promptMaxLength,
	prompt,
	onPromptChange,
	onDone,
	schedule,
	minIntervalMinutes,
	maxIntervalMinutes,
}: LoopFormProps & { schedule: IntervalScheduleValue; minIntervalMinutes: number; maxIntervalMinutes: number }) {
	const { t } = useTranslation()
	const { submit, isPending } = useLoopSubmit(threadId, onDone)

	const form = useForm({
		defaultValues: { prompt, schedule },
		onSubmit: async ({ value }) => submit(loop, value),
	})

	return (
		<form
			noValidate
			className="flex flex-col gap-4"
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			{/* The prompt is the same field in both members, and it is written out in each of them rather
			    than extracted: a data field lives INSIDE its `form.Field` (architecture rail B), and a
			    shared presentational wrapper would leave the textarea outside one. Duplication across
			    variant forms is the sanctioned trade (FRM-P43(b)). */}
			<form.Field name="prompt" validators={{ onChange: PROMPT_SCHEMA }}>
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
							onChange={e => {
								field.handleChange(e.target.value)
								onPromptChange(e.target.value)
							}}
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

			<form.Field name="schedule.everyMinutes" validators={{ onChange: EVERY_MINUTES_SCHEMA }}>
				{field => (
					<Field className="w-48">
						<FieldLabel htmlFor={field.name}>{t('session.loops.intervalLabel')}</FieldLabel>
						<Input
							id={field.name}
							type="number"
							inputMode="numeric"
							min={minIntervalMinutes}
							max={maxIntervalMinutes}
							value={field.state.value}
							onBlur={field.handleBlur}
							// The field is a NUMBER on the wire; an empty box reads as 0 rather than as a string,
							// so the SDK schema refuses it for the right reason instead of a type mismatch.
							onChange={e => field.handleChange(e.target.valueAsNumber || 0)}
						/>
						{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0]?.message ?? '')}</FieldError>}
					</Field>
				)}
			</form.Field>

			<form.Subscribe selector={s => [s.canSubmit] as const}>
				{([canSubmit]) => (
					<LoopFormActions
						note={t('session.loops.intervalNote', { min: minIntervalMinutes, max: maxIntervalMinutes })}
						canSubmit={canSubmit}
						isPending={isPending}
						onCancel={onDone}
					/>
				)}
			</form.Subscribe>
		</form>
	)
}
