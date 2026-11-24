import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowUp } from '@tabler/icons-react'
import { useForm } from '@tanstack/react-form'
import { AskAnswerKindEnum, StopKindEnum } from '@codm/client-typescript/typescript'
import { AskCard, AskCardOption } from '@codm/app-ui/ask-card'
import { Button } from '@codm/app-ui/button'
import { Textarea } from '@codm/app-ui/textarea'
import { useLocale } from '@/hooks/useLocale'
import { enumLabel } from '@/lib/enums'
import { formatRelativeTime, formatTimeOfDay } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useTaskSurface, type AskView } from './TaskSurface'

type AskOf<K extends AskView['kind']> = Extract<AskView, { kind: K }>
type Reply = AskView['reply']
type ReplyOf<K extends Reply['kind']> = Extract<Reply, { kind: K }>

/** What each kind says under the question — who may answer a decision, what a question goes on with (CMP-P18). */
const ASK_NOTE: { [K in AskView['kind']]: (props: { ask: AskOf<K> }) => ReactNode } = {
	[StopKindEnum.DECISION_REQUESTED]: ({ ask }) => <DecisionNote ask={ask} />,
	[StopKindEnum.QUESTION_ASKED]: ({ ask }) => <QuestionNote ask={ask} />,
}

/** How a person answers — one button per option, or their own words (Non-Negotiable 3). */
const REPLY: { [K in Reply['kind']]: (props: { reply: ReplyOf<K>; stopId: string; locked: boolean }) => ReactNode } = {
	[AskAnswerKindEnum.OPTION]: props => <OptionAnswer {...props} />,
	[AskAnswerKindEnum.TEXT]: props => <TextAnswer {...props} />,
}

/**
 * An OPEN ask in the task conversation (fase 3): its code, the question and the way to answer it, on the dark
 * "precisa de você" card. The answer goes through the surface's port (the daemon on the desktop, the panel's
 * actions in the cloud). A decision that needs a releaser shows to everyone and locks for whoever may not release.
 */
export function TaskAskCard({
	ask,
	stopId,
	raisedAt,
	className,
	...props
}: Omit<ComponentProps<'section'>, 'title'> & { ask: AskView; stopId: string; raisedAt: string }) {
	const { t } = useTranslation()
	const locale = useLocale()
	const surface = useTaskSurface()
	const locked = !surface.canAct || (ask.kind === StopKindEnum.DECISION_REQUESTED && ask.releaseRequired === true && !surface.canRelease)
	// TS cannot correlate the map entry with `ask`/`reply` across a union; each map's own type keeps every renderer honest.
	const Note = ASK_NOTE[ask.kind] as (props: { ask: AskView }) => ReactNode
	const Answer = REPLY[ask.reply.kind] as (props: { reply: Reply; stopId: string; locked: boolean }) => ReactNode
	return (
		<AskCard
			data-testid="task-ask"
			code={ask.code}
			kind={enumLabel('StopKind', ask.kind)}
			age={
				<time dateTime={raisedAt} title={formatTimeOfDay(raisedAt, locale)}>
					{formatRelativeTime(raisedAt, locale)}
				</time>
			}
			question={ask.question}
			note={
				<>
					<Note ask={ask} />
					{t('task.answerInGroup', { code: ask.code })}
				</>
			}
			locked={locked}
			className={className}
			{...props}
		>
			<Answer reply={ask.reply} stopId={stopId} locked={locked} />
		</AskCard>
	)
}

function DecisionNote({ ask }: { ask: AskOf<typeof StopKindEnum.DECISION_REQUESTED> }) {
	const { t } = useTranslation()
	return ask.releaseRequired ? `${t('session.ask.releaseRequired')} · ` : null
}

function QuestionNote({ ask }: { ask: AskOf<typeof StopKindEnum.QUESTION_ASKED> }) {
	const { t } = useTranslation()
	const locale = useLocale()
	return (
		<>
			{ask.dueAt
				? t('session.ask.goesOnAt', { label: ask.defaultLabel, time: formatTimeOfDay(ask.dueAt, locale) })
				: t('session.ask.goesOnAfterDelivery', { label: ask.defaultLabel })}{' '}
		</>
	)
}

function OptionAnswer({ reply, stopId, locked }: { reply: ReplyOf<typeof AskAnswerKindEnum.OPTION>; stopId: string; locked: boolean }) {
	const surface = useTaskSurface()
	return (
		<>
			{reply.options.map((option, index) => (
				<AskCardOption
					key={option.id}
					variant={index === 0 ? 'primary' : 'outline'}
					disabled={locked || surface.pending}
					onClick={() => surface.answerAsk(stopId, { kind: AskAnswerKindEnum.OPTION, optionId: option.id })}
				>
					{option.label}
				</AskCardOption>
			))}
		</>
	)
}

function TextAnswer({
	stopId,
	locked,
	className,
	...props
}: ComponentProps<'form'> & { reply: ReplyOf<typeof AskAnswerKindEnum.TEXT>; stopId: string; locked: boolean }) {
	const { t } = useTranslation()
	const surface = useTaskSurface()
	// The field validates against the surface's own SDK schema for the TEXT answer; the body is built on submit.
	// No reset on success: an answered ask leaves the open list, and this card (with its draft) unmounts with it.
	const form = useForm({
		defaultValues: { text: '' },
		onSubmit: ({ value }) => surface.answerAsk(stopId, { kind: AskAnswerKindEnum.TEXT, text: value.text }),
	})
	return (
		<form
			noValidate
			className={cn('flex w-full items-end gap-2 rounded-asymmetric-sm border border-background/20 p-2', className)}
			{...props}
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<form.Field name="text" validators={{ onChange: surface.answerTextSchema }}>
				{field => (
					<Textarea
						id={field.name}
						value={field.state.value}
						disabled={locked}
						onBlur={field.handleBlur}
						onChange={e => field.handleChange(e.target.value)}
						onKeyDown={e => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault()
								form.handleSubmit()
							}
						}}
						placeholder={t('session.ask.placeholder')}
						aria-label={t('session.ask.placeholder')}
						className="min-h-10 flex-1 resize-none border-0 bg-transparent text-current focus-visible:ring-0"
					/>
				)}
			</form.Field>
			<form.Subscribe selector={s => surface.answerTextSchema.safeParse(s.values.text).success}>
				{valid => (
					<Button type="submit" size="icon" aria-label={t('session.ask.send')} disabled={locked || !valid || surface.pending}>
						<IconArrowUp />
					</Button>
				)}
			</form.Subscribe>
		</form>
	)
}
