import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowUp } from '@tabler/icons-react'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import {
	answerStopMutationRequestSchema,
	getHomeDashboardQueryKey,
	getIssueDetailQueryKey,
	getIssueTimelineQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	useAnswerStop,
	AskAnswerKindEnum,
	StopKindEnum,
} from '@codm/client-typescript/typescript'
import type { GetNeedsYouPanelQueryResponse } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { Textarea } from '@codm/app-ui/textarea'
import { useLocale } from '@/hooks'
import { formatTimeOfDay } from '@/lib/format'
import { pickUnionVariantField } from '@/lib/union'
import { cn } from '@/lib/utils'

type Ask = NonNullable<GetNeedsYouPanelQueryResponse['stops'][number]['ask']>
type AskOf<K extends Ask['kind']> = Extract<Ask, { kind: K }>
type Reply = Ask['reply']
type ReplyOf<K extends Reply['kind']> = Extract<Reply, { kind: K }>

/** The free-text answer, validated by the SDK's own TEXT member — never a hand-rolled rule. */
const answerTextSchema = pickUnionVariantField(answerStopMutationRequestSchema, { kind: AskAnswerKindEnum.TEXT }, 'text')

interface AnswerProps {
	stopId: string
	threadId: string
	issueId?: string
}

/** What each kind says under the question — a decision who may answer it, a question what it goes on with (CMP-P18). */
const ASK_NOTE: { [K in Ask['kind']]: (props: { ask: AskOf<K> }) => ReactNode } = {
	[StopKindEnum.DECISION_REQUESTED]: ({ ask }) => <DecisionNote ask={ask} />,
	[StopKindEnum.QUESTION_ASKED]: ({ ask }) => <QuestionNote ask={ask} />,
}

/** How a person answers — one button per option, or their own words when the ask offers none (Non-Negotiable 3). */
const REPLY: { [K in Reply['kind']]: (props: AnswerProps & { reply: ReplyOf<K> }) => ReactNode } = {
	[AskAnswerKindEnum.OPTION]: props => <OptionAnswer {...props} />,
	[AskAnswerKindEnum.TEXT]: props => <TextAnswer {...props} />,
}

interface StopAskCardProps extends ComponentProps<'div'> {
	ask: Ask
	stopId: string
	threadId: string
	issueId?: string
}

/**
 * An issue's open ASK (fase 3) — its code, the question and the way to answer it, answered from the console
 * through `POST /stops/:stopId/answer` as the operator. The kind and the reply are each dispatched by map, so a
 * decision and a question, an option and free text, are separate renderers — never one all-optional form.
 *
 * A leaf: the parent that lists the stops hands the ask in; the card owns its own mutation. Text colour is
 * inherited, so it sits on the dark Needs-you surface and on the light issue card alike.
 */
export function StopAskCard({ ask, stopId, threadId, issueId, className, ...props }: StopAskCardProps) {
	// TS cannot correlate the map entry with `ask`/`reply` across a union; each map's own type keeps every renderer honest.
	const Note = ASK_NOTE[ask.kind] as (props: { ask: Ask }) => ReactNode
	const Answer = REPLY[ask.reply.kind] as (props: AnswerProps & { reply: Reply }) => ReactNode
	return (
		<div className={cn('flex min-w-0 flex-col gap-2', className)} data-testid="stop-ask" {...props}>
			<p className="text-sm">
				<span className="font-mono font-semibold">{ask.code}</span> — {ask.question}
			</p>
			<Note ask={ask} />
			<Answer reply={ask.reply} stopId={stopId} threadId={threadId} issueId={issueId} />
		</div>
	)
}

function DecisionNote({ ask, className, ...props }: ComponentProps<'p'> & { ask: AskOf<typeof StopKindEnum.DECISION_REQUESTED> }) {
	const { t } = useTranslation()
	if (!ask.releaseRequired) return null
	return (
		<p className={cn('text-xs opacity-70', className)} {...props}>
			{t('session.ask.releaseRequired')}
		</p>
	)
}

function QuestionNote({ ask, className, ...props }: ComponentProps<'p'> & { ask: AskOf<typeof StopKindEnum.QUESTION_ASKED> }) {
	const { t } = useTranslation()
	const locale = useLocale()
	return (
		<p className={cn('text-xs opacity-70', className)} {...props}>
			{ask.dueAt
				? t('session.ask.goesOnAt', { label: ask.defaultLabel, time: formatTimeOfDay(ask.dueAt, locale) })
				: t('session.ask.goesOnAfterDelivery', { label: ask.defaultLabel })}
		</p>
	)
}

/** The mutation every answer goes through, with the reads it makes stale — on the HOOK, so it survives the card unmounting. */
function useAnswer({ threadId, issueId }: Pick<AnswerProps, 'threadId' | 'issueId'>) {
	const queryClient = useQueryClient()
	return useAnswerStop({
		mutation: {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: getNeedsYouPanelQueryKey(threadId) })
				queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) })
				queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
				if (issueId) {
					queryClient.invalidateQueries({ queryKey: getIssueDetailQueryKey(issueId) })
					queryClient.invalidateQueries({ queryKey: getIssueTimelineQueryKey(issueId) })
				}
			},
		},
	})
}

function OptionAnswer({
	reply,
	stopId,
	threadId,
	issueId,
	className,
	...props
}: ComponentProps<'div'> & AnswerProps & { reply: ReplyOf<typeof AskAnswerKindEnum.OPTION> }) {
	const answer = useAnswer({ threadId, issueId })
	return (
		<div className={cn('flex flex-wrap gap-2', className)} {...props}>
			{reply.options.map(option => (
				<Button
					key={option.id}
					size="sm"
					variant="outline"
					className="border-current/30 bg-transparent text-current hover:bg-current/10"
					disabled={answer.isPending}
					onClick={() => answer.mutate({ stopId, data: { kind: AskAnswerKindEnum.OPTION, optionId: option.id } })}
				>
					{option.label}
				</Button>
			))}
		</div>
	)
}

function TextAnswer({
	reply: _reply,
	stopId,
	threadId,
	issueId,
	className,
	...props
}: ComponentProps<'form'> & AnswerProps & { reply: ReplyOf<typeof AskAnswerKindEnum.TEXT> }) {
	const { t } = useTranslation()
	const answer = useAnswer({ threadId, issueId })
	// The field validates against the SDK's own TEXT member; the body is that member, built on submit.
	// No reset on success: an answered stop leaves the list, and this card (with its draft) unmounts with it.
	const form = useForm({
		defaultValues: { text: '' },
		onSubmit: ({ value }) => answer.mutate({ stopId, data: { kind: AskAnswerKindEnum.TEXT, text: value.text } }),
	})

	return (
		<form
			noValidate
			className={cn('flex items-end gap-2 rounded-2xl border border-current/20 p-2', className)}
			{...props}
			onSubmit={e => {
				e.preventDefault()
				e.stopPropagation()
				form.handleSubmit()
			}}
		>
			<form.Field name="text" validators={{ onChange: answerTextSchema }}>
				{field => (
					<Textarea
						id={field.name}
						value={field.state.value}
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
			<form.Subscribe selector={s => answerTextSchema.safeParse(s.values.text).success}>
				{valid => (
					<Button type="submit" size="icon" aria-label={t('session.ask.send')} disabled={!valid || answer.isPending}>
						<IconArrowUp />
					</Button>
				)}
			</form.Subscribe>
		</form>
	)
}
