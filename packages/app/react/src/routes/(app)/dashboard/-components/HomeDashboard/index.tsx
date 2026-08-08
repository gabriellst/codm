import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { IconPlus } from '@tabler/icons-react'
import { getHomeDashboardQueryKey, useGetHomeDashboard } from '@codm/client-typescript/typescript'
import type { GetHomeDashboardQueryResponse, ThreadStatus, TranscriptKind } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { alertActionButton, alertSurface, row } from '@/components/ui/surfaces'
import { cn } from '@/lib/utils'
import { formatDurationSeconds } from '@/lib/format'
import { enumLabel } from '@/lib'
import { useLocale, useServerEvents } from '@/hooks'
import { PageHeader } from '@/components/console/PageHeader'
import { relativeTime } from '@/components/console/time'
import { Dot } from '@/components/console/StatusDot'
import { ThreadAvatar, contactAvatarUrl } from '@/components/console/ThreadAvatar'

type Dashboard = GetHomeDashboardQueryResponse

/** The operating overview (T03): agents live, who needs you, today's numbers, active sessions, latest activity. */
export function HomeDashboard({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetHomeDashboard()

	useServerEvents(
		['integration.issue.opened', 'integration.issue.completed', 'integration.thread.stop_raised', 'integration.thread.stop_resolved'],
		() => {
			queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
		},
	)

	if (isLoading || !data) return <DashboardSkeleton className={className} {...props} />

	const running = data.agentsRunningNow
	const heroLine = running === 0 ? t('dashboard.agentsWorkingNone') : t('dashboard.agentsWorking', { count: running })

	return (
		<div className={cn('relative mx-auto flex w-full max-w-5xl flex-col gap-7 px-6 pb-16 pt-16 md:px-10', className)} {...props}>
			<DecorativeBlob />

			<PageHeader
				back={false}
				title={t('nav.home')}
				subtitle={heroLine}
				action={
					<Button nativeButton={false} render={<Link to="/attach" />}>
						<IconPlus data-icon="inline-start" /> {t('dashboard.newConversation')}
					</Button>
				}
			/>

			{data.needsYou && <NeedsYouCallout needsYou={data.needsYou} />}

			<TodayStats today={data.today} />

			<ActiveSessionsSection sessions={data.activeSessions} />

			<LatestActivitySection items={data.latestActivity} />
		</div>
	)
}

/** Purely decorative — the redesign's soft bean-shape behind the masthead. No data, so no i18n. */
function DecorativeBlob() {
	return (
		<svg
			width="420"
			height="320"
			viewBox="0 0 340 270"
			aria-hidden="true"
			className="pointer-events-none absolute -right-16 -top-8 -z-10 opacity-45"
		>
			<path
				d="M60 30 Q20 40 25 110 L28 190 Q30 240 95 238 L250 232 Q315 230 312 150 L308 75 Q305 18 230 22 L95 27 Q70 28 60 30 Z"
				className="fill-secondary"
			/>
		</svg>
	)
}

function NeedsYouCallout({ needsYou }: { needsYou: NonNullable<Dashboard['needsYou']> }) {
	const { t } = useTranslation()
	const detail = needsYou.stopKinds.map(k => enumLabel('StopKind', k)).join(' · ')
	return (
		<div
			className={cn(
				'animate-in fade-in slide-in-from-bottom-1 relative flex items-center gap-3.5 rounded-asymmetric-xl px-5 py-4 duration-300',
				alertSurface,
			)}
		>
			<Dot className="size-2.5 shrink-0 animate-pulse bg-success-bright" />
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="text-[15.5px] font-extrabold">{t('dashboard.needsYouName', { name: needsYou.threadDisplayName })}</span>
				<span className="truncate text-[13px] text-background/60">{detail}</span>
			</div>
			{/* `nativeButton={false}` — this renders an <a>, not a <button>. */}
			<Button
				size="sm"
				nativeButton={false}
				render={<Link to="/threads/$threadId" params={{ threadId: needsYou.threadId }} />}
				className={cn('shrink-0', alertActionButton)}
			>
				{t('dashboard.resolve')}
			</Button>
		</div>
	)
}

/**
 * Today's numbers (D2/D4) as a 3-up grid of flat stat tiles — the redesign's own shape, replacing the
 * previous vertical rows-in-a-card. The last tile (median response) is the highlighted one, matching
 * the reference's single `--secondary` accent among three stat cards.
 */
function TodayStats({ today }: { today: Dashboard['today'] }) {
	const { t } = useTranslation()
	const locale = useLocale()
	return (
		<div className="grid grid-cols-3 gap-3.5">
			<StatTile label={t('dashboard.issuesOpened')} value={String(today.issuesOpened)} radius="rounded-asymmetric-xl" />
			<StatTile label={t('dashboard.issuesClosed')} value={String(today.issuesClosed)} radius="rounded-callout-flip" />
			<StatTile
				label={t('dashboard.medianResponse')}
				value={formatDurationSeconds(today.medianResponseSeconds, locale)}
				radius="rounded-asymmetric-xl"
				highlight
			/>
		</div>
	)
}

function StatTile({ label, value, radius, highlight = false }: { label: string; value: string; radius: string; highlight?: boolean }) {
	return (
		<div className={cn('min-w-0 p-4', radius, highlight ? 'bg-secondary' : 'bg-card')}>
			<div
				className={cn(
					'text-[28px] font-extrabold tracking-tight tabular-nums',
					highlight ? 'text-secondary-foreground' : 'text-foreground',
				)}
			>
				{value}
			</div>
			<div className={cn('mt-0.5 truncate text-[12.5px]', highlight ? 'text-secondary-foreground/70' : 'text-caption-foreground')}>
				{label}
			</div>
		</div>
	)
}

// Style-only dispatch (bp-23: labels come from enumLabel, never a literal here). Mirrors the
// reference's per-status chip: RUNNING is the brand-green "on" chip, NEEDS_ATTENTION is the
// highest-emphasis dark chip, PAUSED/IDLE are the plain neutral chip.
const THREAD_STATUS_CHIP: Record<ThreadStatus, string> = {
	RUNNING: 'bg-secondary text-secondary-foreground',
	NEEDS_ATTENTION: 'bg-foreground text-background',
	PAUSED: 'bg-muted text-muted-foreground',
	IDLE: 'bg-muted text-muted-foreground',
}
const THREAD_STATUS_DOT: Record<ThreadStatus, string> = {
	RUNNING: 'bg-primary animate-pulse',
	NEEDS_ATTENTION: 'bg-success-bright',
	PAUSED: 'bg-muted-foreground/40',
	IDLE: 'bg-muted-foreground/40',
}

/**
 * `sessions` is already the server-filtered `RUNNING | NEEDS_ATTENTION` set (see
 * `GetHomeDashboard`'s `activeSessions`) — this section renders it as-is, no re-filtering.
 */
function ActiveSessionsSection({ sessions }: { sessions: Dashboard['activeSessions'] }) {
	const { t } = useTranslation()
	return (
		<section className="flex flex-col gap-2.5">
			<h2 className="border-b border-border pb-2.5 text-sm font-extrabold text-foreground">{t('dashboard.activeSessions')}</h2>
			{sessions.length === 0 ? (
				<p className="px-0.5 py-1 text-sm text-caption-foreground">{t('dashboard.noActiveSessions')}</p>
			) : (
				<div className="flex flex-col gap-2">
					{sessions.map(session => (
						<ActiveSessionRow key={session.threadId} session={session} />
					))}
				</div>
			)}
		</section>
	)
}

function ActiveSessionRow({ session }: { session: Dashboard['activeSessions'][number] }) {
	const { t } = useTranslation()
	const relative = relativeTime(session.lastActivity)
	return (
		<Link
			to="/threads/$threadId"
			params={{ threadId: session.threadId }}
			className={cn('group flex items-center gap-3.5 rounded-asymmetric-lg p-3.5', row)}
		>
			<ThreadAvatar
				name={session.displayName}
				src={session.hasAvatar ? contactAvatarUrl(session.channelId, session.externalId) : undefined}
				channelKind={session.channelKind}
				size="lg"
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="truncate text-[14.5px] font-bold text-foreground">{session.displayName}</span>
				<span className="truncate text-[12.5px] text-caption-foreground">{t(relative.key, { count: relative.count })}</span>
			</div>
			<span
				className={cn(
					'inline-flex shrink-0 items-center gap-1.5 rounded-asymmetric-2xs px-3 py-1.5 text-[11.5px] font-extrabold',
					THREAD_STATUS_CHIP[session.status],
				)}
			>
				<Dot className={cn('size-1.5', THREAD_STATUS_DOT[session.status])} />
				{enumLabel('ThreadStatus', session.status)}
			</span>
		</Link>
	)
}

// Style-only dispatch, same reasoning as THREAD_STATUS_CHIP above — labels stay on enumLabel.
const TRANSCRIPT_KIND_DOT: Record<TranscriptKind, string> = {
	SYSTEM: 'bg-primary',
	CONTACT: 'bg-muted-foreground/30',
	DIRECT: 'bg-foreground',
	ACTION: 'bg-foreground',
	WHISPER: 'bg-muted-foreground/30',
}

function LatestActivitySection({ items }: { items: Dashboard['latestActivity'] }) {
	const { t } = useTranslation()
	if (items.length === 0) return null
	return (
		<section className="flex flex-col gap-0.5">
			<h2 className="border-b border-border pb-2.5 text-sm font-extrabold text-foreground">{t('dashboard.latestActivity')}</h2>
			<div className="flex flex-col">
				{items.map(item => (
					<ActivityRow key={`${item.threadId}-${item.at}`} item={item} />
				))}
			</div>
		</section>
	)
}

/**
 * Uma linha de atividade recente — e, quando alguém de fora falou, QUEM falou.
 *
 * O prefixo em negrito era sempre o `kind` ("Contato", "Sistema"), o que num GRUPO diz o mínimo: toda
 * linha de entrada é uma pessoa diferente e nenhuma delas aparecia. Agora o discriminante é a presença
 * de `sender` — o backend só o envia para uma linha que uma pessoa digitou (as do próprio produto
 * seguem sem ele, pela mesma regra que `GetSessionChat` documenta) — então a linha troca o ponto
 * colorido pela CARA de quem escreveu e o rótulo do kind pelo nome dela. Sem sender, nada muda.
 */
function ActivityRow({ item }: { item: Dashboard['latestActivity'][number] }) {
	const { t } = useTranslation()
	const relative = relativeTime(item.at)
	const sender = item.sender
	return (
		<Link
			to="/threads/$threadId"
			params={{ threadId: item.threadId }}
			className="flex items-center gap-2.5 rounded-asymmetric-xs px-2 py-2.5 transition-colors hover:bg-muted"
		>
			{sender ? (
				<ThreadAvatar
					name={sender.displayName}
					src={sender.hasAvatar ? contactAvatarUrl(sender.channelId, sender.externalId) : undefined}
					size="sm"
				/>
			) : (
				<Dot className={cn('mt-1.5 size-2 shrink-0', TRANSCRIPT_KIND_DOT[item.kind])} />
			)}
			<span className="min-w-0 flex-1 text-pretty text-[13.5px] leading-relaxed text-muted-foreground">
				<span className="font-bold text-foreground">{sender ? sender.displayName : enumLabel('TranscriptKind', item.kind)}</span>{' '}
				{item.subtitle}
			</span>
			<span className="mt-0.5 shrink-0 text-[11.5px] text-caption-foreground">{t(relative.key, { count: relative.count })}</span>
		</Link>
	)
}

function DashboardSkeleton({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div className={cn('relative mx-auto flex w-full max-w-5xl flex-col gap-7 px-6 pb-16 pt-16 md:px-10', className)} {...props}>
			<div className="flex items-start justify-between gap-4">
				<div className="flex flex-col gap-2.5">
					<Skeleton className="h-9 w-44" />
					<Skeleton className="h-4 w-56" />
				</div>
				<Skeleton className="h-8 w-40 rounded-full" />
			</div>
			<div className="grid grid-cols-3 gap-3.5">
				<Skeleton className="h-20 rounded-asymmetric-xl" />
				<Skeleton className="h-20 rounded-asymmetric-xl" />
				<Skeleton className="h-20 rounded-asymmetric-xl" />
			</div>
			<div className="flex flex-col gap-2">
				<Skeleton className="h-16 rounded-asymmetric-lg" />
				<Skeleton className="h-16 rounded-asymmetric-lg" />
			</div>
			<div className="flex flex-col gap-2">
				<Skeleton className="h-10 rounded-asymmetric-xs" />
				<Skeleton className="h-10 rounded-asymmetric-xs" />
				<Skeleton className="h-10 rounded-asymmetric-xs" />
			</div>
		</div>
	)
}
