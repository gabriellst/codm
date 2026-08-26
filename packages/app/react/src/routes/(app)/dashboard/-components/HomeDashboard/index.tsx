import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { IconAlertTriangle, IconMessage, IconPlus, IconRobot, IconRotate } from '@tabler/icons-react'
import { ChannelStatusEnum, getHomeDashboardQueryKey, useGetHomeDashboard } from '@codm/client-typescript/typescript'
import type { GetHomeDashboardQueryResponse, ThreadStatus, TranscriptKind } from '@codm/client-typescript/typescript'
import { Button } from '@codm/app-ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@codm/app-ui/empty'
import { alertSurface, row, sectionLabelBare } from '@codm/app-ui/surfaces'
import { cn } from '@/lib/utils'
import { formatDurationSeconds } from '@/lib/format'
import { enumLabel } from '@/lib'
import { useLocale, useServerEvents } from '@/hooks'
import { PageHeader } from '@/components/console/PageHeader'
import { relativeTime } from '@/components/console/time'
import { Dot } from '@/components/console/StatusDot'
import { ThreadAvatar, contactAvatarUrl } from '@/components/console/ThreadAvatar'
import { MentionCta } from '../MentionCta'

type Dashboard = GetHomeDashboardQueryResponse

/** The operating overview (T03): agents live, who needs you, today's numbers, active sessions, latest activity. */
export function HomeDashboard({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetHomeDashboard()

	useServerEvents(
		[
			'integration.issue.opened',
			'integration.issue.completed',
			'integration.thread.stop_raised',
			'integration.thread.stop_resolved',
			'integration.channel.connected',
			'integration.channel.disconnected',
		],
		() => {
			queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
		},
	)

	if (isLoading || !data) return <DashboardSkeleton className={className} {...props} />

	const running = data.agentsRunningNow
	// A DISCONNECTED channel (was answering, stopped) is the one status worth surfacing here —
	// CREATED/CONNECTING are setup-in-progress (already covered by onboarding, C1) and DELETED means
	// "no channel at all", neither of which reads as "went offline".
	const offlineChannel = data.channels.some(channel => channel.status === ChannelStatusEnum.DISCONNECTED)
	const heroLine = running === 0 ? t('dashboard.agentsWorkingNone') : t('dashboard.agentsWorking', { count: running })
	const statusLine = offlineChannel ? `${heroLine} · ${t('dashboard.channelOfflineSuffix')}` : heroLine

	return (
		<div className={cn('relative mx-auto flex w-full flex-col gap-3.5 overflow-hidden px-6 pb-7 pt-7 md:px-10', className)} {...props}>
			{offlineChannel && <ChannelOfflineBanner />}

			{/* `isolate` is load-bearing: DecorBlobs sits at -z-10, and without a local stacking
			    context that puts it BEHIND the page's opaque white background — invisible. */}
			<div className="relative isolate">
				<DecorBlobs />
				<PageHeader
					title={t('nav.home')}
					subtitle={statusLine}
					action={
						// Spec ("Button / Nova conversa"): height 40 — closest step on the button scale is
						// `size="lg"` (h-9/36px vs the default h-8/32px), not exact but within a couple px.
						<Button size="lg" nativeButton={false} render={<Link to="/attach" />}>
							<IconPlus data-icon="inline-start" /> {t('dashboard.newConversation')}
						</Button>
					}
				/>
			</div>

			{data.needsYou && <NeedsYouCallout needsYou={data.needsYou} />}

			<MentionCta />

			<TodayStats today={data.today} />

			<ActiveSessionsSection sessions={data.activeSessions} />

			<LatestActivitySection items={data.latestActivity} />
		</div>
	)
}

/**
 * The redesign's two measured blur blobs behind the masthead (R28) — a $secondary and an $accent
 * ellipse, blurred, positioned behind the title/status line. Every Início screen in the design
 * (cheio, vazio, carregando, canal offline) carries this pair. Purely decorative, no data, so no
 * i18n — same treatment the astro landing's Hero.astro uses for its own hero backdrop.
 */
function DecorBlobs({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 -z-10', className)} {...props}>
			<div className="absolute -left-16 -top-16 h-[210px] w-[420px] rounded-full bg-secondary/70 blur-[36px]" />
			<div className="absolute left-32 -top-9 h-[150px] w-[250px] rounded-full bg-accent/70 blur-[30px]" />
		</div>
	)
}

/**
 * A DISCONNECTED channel (m4Q5K, "canal offline"). The design shows this as a full-bleed banner
 * ABOVE the rail — out of reach here (that's `routes/(app)/route.tsx`, outside this section's
 * ownership and actively worked by another agent). This is the content-column-scoped equivalent:
 * same tokens (`attention-surface`/`status-attention`), same copy, same action. The "Reiniciar"
 * action has no restart mutation on the wire (channels/** owns that bounded context, out of scope
 * here too) — it navigates to `/channels`, where reconnecting a channel actually happens today
 * (`ConnectChannelDialog`), rather than wiring a command that doesn't exist.
 */
function ChannelOfflineBanner({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	return (
		<div
			className={cn(
				'relative z-10 flex items-center gap-3.5 rounded-asymmetric-lg bg-attention-surface px-5 py-4 text-attention-foreground',
				className,
			)}
			{...props}
		>
			<span className="flex size-8 shrink-0 items-center justify-center rounded-asymmetric-2xs bg-status-attention text-primary-foreground">
				<IconAlertTriangle className="size-[19px]" />
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="text-[15px] font-bold">{t('dashboard.channelOfflineTitle')}</span>
				<span className="text-[13px] opacity-80">{t('dashboard.channelOfflineDescription')}</span>
			</div>
			{/* Spec ("Button / Reiniciar"): height 40 — `size="lg"` (h-9/36px), closest scale step. */}
			<Button
				size="lg"
				nativeButton={false}
				render={<Link to="/channels" />}
				className="shrink-0 border border-destructive bg-transparent text-destructive hover:bg-destructive/10 active:bg-destructive/15"
			>
				<IconRotate data-icon="inline-start" /> {t('dashboard.channelOfflineAction')}
			</Button>
		</div>
	)
}

function NeedsYouCallout({ needsYou, className, ...props }: ComponentProps<'div'> & { needsYou: NonNullable<Dashboard['needsYou']> }) {
	const { t } = useTranslation()
	const detail = needsYou.stopKinds.map(k => enumLabel('StopKind', k)).join(' · ')
	return (
		<div
			className={cn(
				// Spec ("Alert Card"): cornerRadius [20,20,20,7] — small corner at BOTTOM-LEFT, the same
				// family every other card in this screen uses (`rounded-asymmetric-lg` = --radius-lg on 3
				// corners + --radius-lg*0.333 ≈ 7 on the 4th). `rounded-callout-flip` puts the small corner
				// at bottom-RIGHT instead — wrong shape for this node, not used here.
				'animate-in fade-in slide-in-from-bottom-1 relative flex items-center gap-3.5 rounded-asymmetric-lg px-5 py-4 duration-300',
				alertSurface,
				className,
			)}
			{...props}
		>
			<Dot className="size-2.5 shrink-0 animate-pulse bg-success-bright" />
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="text-[15.5px] font-extrabold">{t('dashboard.needsYouName', { name: needsYou.threadDisplayName })}</span>
				<span className="truncate text-[13px] text-background/60">{detail}</span>
			</div>
			{/* `nativeButton={false}` — this renders an <a>, not a <button>. Spec ("Button / Resolver",
			    design/system/pen/screens/screen-1-inicio-cheio.json): fill:#00000000 + stroke $success-bright +
			    label $success-bright — a HOLLOW outline button, not the shared `alertActionButton` solid-fill
			    preset (that pairing is tuned for `NeedsYouPanel`'s own reference, a different button). Composed
			    inline the same way `ChannelOfflineBanner`'s outline action does, so `alertActionButton` stays
			    untouched for its other consumer. */}
			<Button
				size="lg"
				nativeButton={false}
				render={<Link to="/threads/$threadId" params={{ threadId: needsYou.threadId }} />}
				className="shrink-0 border border-success-bright bg-transparent text-success-bright hover:bg-success-bright/10 active:bg-success-bright/15"
			>
				{t('dashboard.resolve')}
			</Button>
		</div>
	)
}

/**
 * Today's numbers (D2/D4) as a 3-up grid of flat stat tiles. Matches the reference exactly: the
 * two plain tiles are a hairline-bordered card over the page's own white (no `$card` grey fill —
 * that token is reserved for window chrome/inert fills), the median-response tile is the single
 * `--secondary` highlight among the three, borderless.
 */
function TodayStats({ today, className, ...props }: ComponentProps<'div'> & { today: Dashboard['today'] }) {
	const { t } = useTranslation()
	const locale = useLocale()
	// `relative` (aqui e nas seções irmãs): o header é positioned e pinta DEPOIS dos irmãos
	// estáticos, então o transbordo dos DecorBlobs cobriria estes cards — positioned em ordem
	// de DOM devolve cada seção para CIMA do gradiente.
	return (
		<div className={cn('relative grid grid-cols-3 gap-4', className)} {...props}>
			<StatTile label={t('dashboard.issuesOpened')} value={String(today.issuesOpened)} />
			<StatTile label={t('dashboard.issuesClosed')} value={String(today.issuesClosed)} />
			<StatTile label={t('dashboard.medianResponse')} value={formatDurationSeconds(today.medianResponseSeconds, locale)} highlight />
		</div>
	)
}

function StatTile({
	label,
	value,
	highlight = false,
	className,
	...props
}: ComponentProps<'div'> & { label: string; value: string; highlight?: boolean }) {
	return (
		<div
			className={cn(
				'min-w-0 rounded-asymmetric-lg px-5 py-4',
				highlight ? 'bg-secondary' : 'border border-border bg-transparent',
				className,
			)}
			{...props}
		>
			{/* text-[46px]/text-[13px]: spec do .pen (screens/screen-1-inicio-cheio.json, nó Metric Tile:
			    fontSize 46 valor / 13 caption) — a escala tipográfica não tem esses degraus; se o par
			    recorrer numa 3ª tela, vira token (doutrina "o padrão vence o pixel", par de avaliação). */}
			<div
				className={cn(
					'text-[46px] font-extrabold tracking-tight tabular-nums',
					highlight ? 'text-secondary-foreground' : 'text-foreground',
				)}
			>
				{value}
			</div>
			<div className={cn('mt-1 truncate text-[13px]', highlight ? 'text-secondary-foreground/70' : 'text-caption-foreground')}>{label}</div>
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
function ActiveSessionsSection({ sessions, className, ...props }: ComponentProps<'section'> & { sessions: Dashboard['activeSessions'] }) {
	const { t } = useTranslation()
	return (
		<section className={cn('relative flex flex-col gap-2.5', className)} {...props}>
			<h2 className={sectionLabelBare}>{t('dashboard.activeSessions')}</h2>
			{sessions.length === 0 ? (
				<Empty className="border border-solid border-border bg-transparent">
					<EmptyHeader>
						<EmptyMedia variant="icon" className="size-14 rounded-asymmetric-md bg-secondary text-secondary-foreground [&_svg]:size-6">
							<IconRobot />
						</EmptyMedia>
						<EmptyTitle className="text-base font-bold text-foreground">{t('dashboard.noActiveSessionsTitle')}</EmptyTitle>
						<EmptyDescription className="max-w-[420px]">{t('dashboard.noActiveSessionsDescription')}</EmptyDescription>
					</EmptyHeader>
				</Empty>
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

function ActiveSessionRow({
	session,
	className,
}: { session: Dashboard['activeSessions'][number] } & Pick<ComponentProps<'a'>, 'className'>) {
	const { t } = useTranslation()
	const relative = relativeTime(session.lastActivity)
	return (
		<Link
			to="/threads/$threadId"
			params={{ threadId: session.threadId }}
			className={cn('group flex items-center gap-3.5 rounded-asymmetric-sm bg-transparent p-3.5', row, className)}
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

function LatestActivitySection({ items, className, ...props }: ComponentProps<'section'> & { items: Dashboard['latestActivity'] }) {
	const { t } = useTranslation()
	return (
		<section className={cn('relative flex flex-col gap-2.5', className)} {...props}>
			<h2 className={sectionLabelBare}>{t('dashboard.latestActivity')}</h2>
			{items.length === 0 ? (
				<Empty className="border border-solid border-border bg-transparent">
					<EmptyHeader>
						<EmptyMedia variant="icon" className="size-14 rounded-asymmetric-md bg-secondary text-secondary-foreground [&_svg]:size-6">
							<IconMessage />
						</EmptyMedia>
						<EmptyTitle className="text-base font-bold text-foreground">{t('dashboard.noActivityTitle')}</EmptyTitle>
						<EmptyDescription className="max-w-[420px]">{t('dashboard.noActivityDescription')}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<div className="flex flex-col">
					{items.map(item => (
						<ActivityRow key={`${item.threadId}-${item.at}`} item={item} />
					))}
				</div>
			)}
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
function ActivityRow({ item, className }: { item: Dashboard['latestActivity'][number] } & Pick<ComponentProps<'a'>, 'className'>) {
	const { t } = useTranslation()
	const relative = relativeTime(item.at)
	const sender = item.sender
	return (
		<Link
			to="/threads/$threadId"
			params={{ threadId: item.threadId }}
			className={cn('flex items-center gap-2.5 rounded-asymmetric-xs px-2 py-2.5 transition-colors hover:bg-muted', className)}
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

/** A single metric-tile skeleton — bordered white card, two stacked skeleton shapes (value + caption). */
function StatTileSkeleton({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'flex h-[109px] flex-col justify-center gap-3.5 rounded-asymmetric-lg border border-border bg-background p-[20px_22px]',
				className,
			)}
			{...props}
		>
			<div className="h-[38px] w-[104px] rounded-asymmetric-xs bg-skeleton-strong" />
			<div className="h-[13px] w-[132px] rounded-asymmetric-3xs bg-skeleton" />
		</div>
	)
}

/** A section-header skeleton — same hairline-underline shape `sectionLabel` renders, label swapped for a bar. */
function SectionHeaderSkeleton({ width, className, ...props }: ComponentProps<'div'> & { width: string }) {
	return (
		<div className={cn('flex h-[27px] items-center border-b border-border pb-2', className)} {...props}>
			<div className={cn('h-[15px] rounded-asymmetric-3xs bg-skeleton-strong', width)} />
		</div>
	)
}

function SessionRowSkeleton({ chipWidth, className, ...props }: ComponentProps<'div'> & { chipWidth: string }) {
	return (
		<div
			className={cn('flex h-16 items-center gap-3.5 rounded-asymmetric-sm border border-border bg-background p-[12px_16px]', className)}
			{...props}
		>
			<div className="size-10 shrink-0 rounded-full bg-skeleton-strong" />
			<div className="flex flex-1 flex-col gap-1.5">
				<div className="h-3.5 w-[168px] rounded-asymmetric-3xs bg-skeleton-strong" />
				<div className="h-3 w-[92px] rounded-asymmetric-3xs bg-skeleton" />
			</div>
			<div className={cn('h-[29px] shrink-0 rounded-asymmetric-2xs bg-skeleton', chipWidth)} />
		</div>
	)
}

function ActivityRowSkeleton({ messageWidth, className, ...props }: ComponentProps<'div'> & { messageWidth: string }) {
	return (
		<div className={cn('flex h-10 items-center gap-2.5 rounded-asymmetric-xs px-2 py-2.5', className)} {...props}>
			<div className="size-[26px] shrink-0 rounded-full bg-skeleton-strong" />
			<div className="h-3.5 w-28 shrink-0 rounded-asymmetric-3xs bg-skeleton-strong" />
			<div className={cn('h-3.5 rounded-asymmetric-3xs bg-skeleton', messageWidth)} />
			<div className="ml-auto h-3 w-16 shrink-0 rounded-asymmetric-3xs bg-skeleton" />
		</div>
	)
}

function DashboardSkeleton({ className, ...props }: ComponentProps<'div'>) {
	return (
		<div className={cn('relative mx-auto flex w-full flex-col gap-7 overflow-hidden px-6 pb-16 pt-16 md:px-10', className)} {...props}>
			<div className="relative isolate flex items-start justify-between gap-4">
				<DecorBlobs />
				<div className="flex flex-col gap-1.5">
					<div className="h-[34px] w-44 rounded-asymmetric-xs bg-skeleton-strong" />
					<div className="h-3.5 w-[200px] rounded-asymmetric-3xs bg-skeleton" />
				</div>
				<div className="h-10 w-[178px] shrink-0 rounded-asymmetric-sm bg-skeleton-strong" />
			</div>
			<div className="relative grid grid-cols-3 gap-3.5">
				<StatTileSkeleton />
				<StatTileSkeleton />
				<StatTileSkeleton />
			</div>
			<div className="relative flex flex-col gap-2.5">
				<SectionHeaderSkeleton width="w-[196px]" />
				<div className="flex flex-col gap-2.5">
					<SessionRowSkeleton chipWidth="w-32" />
					<SessionRowSkeleton chipWidth="w-[150px]" />
				</div>
			</div>
			<div className="relative flex flex-col gap-2.5">
				<SectionHeaderSkeleton width="w-[150px]" />
				<div className="flex flex-col">
					<ActivityRowSkeleton messageWidth="w-48" />
					<ActivityRowSkeleton messageWidth="w-36" />
					<ActivityRowSkeleton messageWidth="w-80" />
					<ActivityRowSkeleton messageWidth="w-52" />
					<ActivityRowSkeleton messageWidth="w-64" />
				</div>
			</div>
		</div>
	)
}
