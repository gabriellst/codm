import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArtifactChip } from '@codm/app-ui/artifact-tile'
import { ChatBubble, ChatEvent, ChatReceipt } from '@codm/app-ui/chat-bubble'
import { useLocale } from '@/hooks/useLocale'
import { enumLabel } from '@/lib/enums'
import { formatTimeOfDay } from '@/lib/format'
import { artifactGlyph } from '@/lib/task/artifactGlyph'
import type { ConversationItem } from '@/lib/task/taskConversation'
import { cn } from '@/lib/utils'
import { TaskAskCard } from './TaskAskCard'
import { TaskEventDetail, useSteerStatus } from './TaskEventDetail'
import { TaskStopCard } from './TaskStopCard'
import { useTaskSurface, type AskView } from './TaskSurface'

type Item = ConversationItem<AskView>
type ItemOfLook<L extends Item['look']> = Extract<Item, { look: L }>

/** One renderer per look — never a chain on the discriminant (CMP-P18). */
const LOOK: { [L in Item['look']]: (props: { entry: ItemOfLook<L> }) => ReactNode } = {
	person: ({ entry }) => <PersonBubble entry={entry} />,
	agent: ({ entry }) => <AgentBubble entry={entry} />,
	whisper: ({ entry }) => <WhisperBubble entry={entry} />,
	steer: ({ entry }) => <SteerBubble entry={entry} />,
	artifact: ({ entry }) => <ArtifactLine entry={entry} />,
	ask: ({ entry }) => (
		<TaskAskCard ask={entry.open.ask} stopId={entry.item.stopId} raisedAt={entry.item.at} className="w-full max-w-[34rem]" />
	),
	stop: ({ entry }) => (
		<TaskStopCard
			stopId={entry.item.stopId}
			stopKind={entry.item.stopKind}
			title={entry.open.detail ?? entry.item.title}
			resolutions={entry.open.resolutions}
		/>
	),
	event: ({ entry }) => <EventLine entry={entry} />,
}

/**
 * The TASK CONVERSATION — one task's story as one chat, oldest first: what people said, what the agent
 * answered, the steers with their receipts, the artifacts as they arrived, the open decision to answer, and
 * every other fact as a thin line. Shared by the desktop's task page and the cloud panel; what differs
 * between them (names, actions, links) comes from the surface port (`TaskSurfaceProvider`).
 */
export function TaskConversation({ items, className, ...props }: ComponentProps<'ol'> & { items: readonly Item[] }) {
	return (
		<ol data-testid="task-conversation" className={cn('flex flex-col gap-3', className)} {...props}>
			{items.map(entry => {
				// TS cannot correlate `LOOK[entry.look]` with `entry` across a union; `LOOK`'s own type keeps each renderer honest.
				const Render = LOOK[entry.look] as (props: { entry: Item }) => ReactNode
				return (
					<li key={entry.item.id} data-look={entry.look} className="flex min-w-0 flex-col">
						<Render entry={entry} />
					</li>
				)
			})}
		</ol>
	)
}

function useTime(iso: string): string {
	return formatTimeOfDay(iso, useLocale())
}

function Initials({ className, ...props }: ComponentProps<'span'>) {
	return (
		<span
			className={cn(
				'flex size-7.5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-muted-foreground',
				className,
			)}
			{...props}
		/>
	)
}

function PersonBubble({ entry, className }: Pick<ComponentProps<typeof ChatBubble>, 'className'> & { entry: ItemOfLook<'person'> }) {
	const { t } = useTranslation()
	const surface = useTaskSurface()
	const sender = surface.senderOf?.(entry.item.entryId)
	return (
		<ChatBubble
			className={className}
			side="in"
			look="person"
			author={sender?.name ?? t('task.fromGroup')}
			avatar={sender ? <Initials>{sender.initials}</Initials> : undefined}
			time={useTime(entry.item.at)}
		>
			{entry.item.text}
		</ChatBubble>
	)
}

function AgentBubble({ entry, className }: Pick<ComponentProps<typeof ChatBubble>, 'className'> & { entry: ItemOfLook<'agent'> }) {
	const time = useTime(entry.item.at)
	return (
		<ChatBubble
			className={className}
			side="out"
			look="agent"
			time={time}
			// Fase 3 — where what the issue said went: the group, a digest, or only the panel.
			footer={entry.item.routing ? <span data-testid="routing-badge">{enumLabel('OutputRouting', entry.item.routing)}</span> : undefined}
		>
			{entry.item.text}
		</ChatBubble>
	)
}

function WhisperBubble({ entry, className }: Pick<ComponentProps<typeof ChatBubble>, 'className'> & { entry: ItemOfLook<'whisper'> }) {
	const { t } = useTranslation()
	return (
		<ChatBubble className={className} side="out" look="steer" author={t('task.whisper')} time={useTime(entry.item.at)}>
			{entry.item.text}
		</ChatBubble>
	)
}

function SteerBubble({ entry, className }: Pick<ComponentProps<typeof ChatBubble>, 'className'> & { entry: ItemOfLook<'steer'> }) {
	const { t } = useTranslation()
	const status = useSteerStatus(entry.item)
	return (
		<ChatBubble
			className={className}
			side="out"
			look="steer"
			author={t('task.steer')}
			footer={<ChatReceipt data-failed={entry.failed || undefined}>{entry.failed ? t('session.steerFailed') : status}</ChatReceipt>}
		>
			{entry.item.text}
		</ChatBubble>
	)
}

function ArtifactLine({ entry, className, ...props }: ComponentProps<'div'> & { entry: ItemOfLook<'artifact'> }) {
	const surface = useTaskSurface()
	const Glyph = artifactGlyph[entry.item.artifactKind]
	const open = surface.openArtifact
	return (
		<div className={cn('flex justify-end', className)} {...props}>
			<ArtifactChip
				data-testid="task-artifact"
				className="w-full max-w-80"
				glyph={<Glyph />}
				name={entry.item.name}
				detail={entry.caption ?? enumLabel('ArtifactKind', entry.item.artifactKind)}
				trailing={open ? undefined : null}
				render={open ? <button type="button" onClick={() => open(entry.item.artifactId)} /> : undefined}
			/>
		</div>
	)
}

function EventLine({ entry, className }: Pick<ComponentProps<typeof ChatEvent>, 'className'> & { entry: ItemOfLook<'event'> }) {
	const surface = useTaskSurface()
	const time = useTime(entry.item.at)
	return (
		<ChatEvent className={className}>
			<span className="tabular-nums">{time}</span>
			{' · '}
			{enumLabel('IssueTimelineItemKind', entry.item.kind)}
			<TaskEventSuffix>
				<TaskEventDetail item={entry.item} {...surface.events} />
			</TaskEventSuffix>
		</ChatEvent>
	)
}

/** The detail after the kind — " · <detail>" — or nothing when the kind has none to say. */
function TaskEventSuffix({ className, ...props }: ComponentProps<'span'>) {
	return <span className={cn("[&:empty]:hidden before:content-['_·_']", className)} {...props} />
}
