import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { getHomeDashboardQueryKey, useGetHomeDashboard } from '@codedm/client-typescript/typescript'
import type { GetHomeDashboardQueryResponse } from '@codedm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useServerEvents } from '@/hooks'
import { greeting } from '@/components/console/time'
import { channelGlyph, channelLabel, stopLabel } from '@/components/console/glyphs'
import { Dot, ThreadStatusDot, threadStatusLabel } from '@/components/console/StatusDot'
import { ThreadAvatar } from '@/components/console/ThreadAvatar'

type Dashboard = GetHomeDashboardQueryResponse

/** The operating overview (T03): agents live, who needs you, active sessions, today's numbers, channel health. */
export function HomeDashboard() {
	const queryClient = useQueryClient()
	const { data, isLoading } = useGetHomeDashboard()

	useServerEvents(['browser.thread_status_changed', 'browser.stop_raised'], () => {
		queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
	})

	if (isLoading || !data) return <DashboardSkeleton />

	const running = data.agentsRunningNow
	const headline =
		running === 0 ? 'No agents working right now' : running === 1 ? '1 agent working right now' : `${running} agents working right now`

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16 pt-20 md:px-10">
			<div className="flex flex-col gap-2">
				<p className="text-sm text-muted-foreground">{greeting()}</p>
				<h1 className="heading-display text-4xl text-foreground md:text-5xl">{headline}</h1>
			</div>

			<div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
				<div className="flex flex-col gap-6">
					{data.needsYou && <NeedsYouCallout needsYou={data.needsYou} />}
					<ActiveSessions sessions={data.activeSessions} />
					{data.latestActivity.length > 0 && <LatestActivity items={data.latestActivity} />}
				</div>
				<div className="flex flex-col gap-6">
					<TodayCard today={data.today} />
					<ChannelsCard channels={data.channels} />
				</div>
			</div>
		</div>
	)
}

function NeedsYouCallout({ needsYou }: { needsYou: NonNullable<Dashboard['needsYou']> }) {
	const detail = needsYou.stopKinds.map(k => stopLabel[k]).join(' · ') || 'Waiting on you'
	return (
		<Card className="border-warning/50">
			<CardContent className="flex items-center gap-4 p-5">
				<span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-foreground text-lg font-bold text-background">
					!
				</span>
				<div className="flex flex-1 flex-col">
					<span className="font-semibold text-foreground">{needsYou.threadDisplayName} needs you</span>
					<span className="text-sm text-muted-foreground">{detail}</span>
				</div>
				<Button size="sm" render={<Link to="/threads/$threadId" params={{ threadId: needsYou.threadId }} />}>
					Open session
				</Button>
			</CardContent>
		</Card>
	)
}

function ActiveSessions({ sessions }: { sessions: Dashboard['activeSessions'] }) {
	return (
		<section className="flex flex-col gap-3">
			<h2 className="text-lg font-semibold text-foreground">Active sessions</h2>
			{sessions.length === 0 ? (
				<p className="text-sm text-muted-foreground">No active sessions.</p>
			) : (
				<div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
					{sessions.map(session => (
						<Link
							key={session.threadId}
							to="/threads/$threadId"
							params={{ threadId: session.threadId }}
							className="flex items-center gap-3 p-4 transition-colors hover:bg-muted"
						>
							<ThreadAvatar name={session.displayName} channelKind={session.channelKind} />
							<div className="flex min-w-0 flex-1 flex-col">
								<span className="truncate font-medium text-foreground">{session.displayName}</span>
								<span className="truncate text-sm text-muted-foreground">{session.lastActivity}</span>
							</div>
							<span
								className={cn(
									'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
									session.status === 'RUNNING' ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground',
								)}
							>
								<ThreadStatusDot status={session.status} />
								{threadStatusLabel[session.status]}
							</span>
						</Link>
					))}
				</div>
			)}
		</section>
	)
}

function LatestActivity({ items }: { items: Dashboard['latestActivity'] }) {
	return (
		<section className="flex flex-col gap-3">
			<h2 className="text-lg font-semibold text-foreground">Latest activity</h2>
			<div className="flex flex-col gap-3">
				{items.map(item => (
					<Link
						key={`${item.threadId}-${item.at}`}
						to="/threads/$threadId"
						params={{ threadId: item.threadId }}
						className="flex items-baseline gap-3 text-sm"
					>
						<Dot className="mt-1.5 bg-muted-foreground/40" />
						<span className="flex-1">
							<span className="font-medium text-foreground">{item.title}</span>{' '}
							<span className="text-muted-foreground">{item.subtitle}</span>
						</span>
					</Link>
				))}
			</div>
		</section>
	)
}

function TodayCard({ today }: { today: Dashboard['today'] }) {
	const rows = [
		{ label: 'Issues opened', value: String(today.issuesOpened) },
		{ label: 'Issues closed', value: String(today.issuesClosed) },
		{ label: 'Median response', value: `${Math.round(today.medianResponseSeconds)}s` },
	]
	return (
		<Card>
			<CardHeader>
				<CardTitle>Today</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-5">
				{rows.map(row => (
					<div key={row.label} className="flex flex-col gap-1">
						<p className="label-eyebrow">{row.label}</p>
						<span className="text-2xl font-bold tabular-nums text-foreground">{row.value}</span>
					</div>
				))}
			</CardContent>
		</Card>
	)
}

function ChannelsCard({ channels }: { channels: Dashboard['channels'] }) {
	if (channels.length === 0) return null
	return (
		<Card>
			<CardHeader>
				<CardTitle>Channels</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{channels.map(channel => {
					const Glyph = channelGlyph[channel.kind]
					const connected = channel.status === 'CONNECTED'
					return (
						<div key={channel.kind} className="flex items-center gap-3">
							<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
								<Glyph className="size-4" />
							</span>
							<span className="flex-1 text-sm font-medium text-foreground">{channelLabel[channel.kind]}</span>
							<span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
								<Dot className={connected ? 'bg-success' : 'bg-muted-foreground/40'} />
								{String(connected ? 'Connected' : 'Not connected')}
							</span>
						</div>
					)
				})}
			</CardContent>
		</Card>
	)
}

function DashboardSkeleton() {
	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16 pt-20 md:px-10">
			<div className="flex flex-col gap-3">
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-12 w-96" />
			</div>
			<div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
				<Skeleton className="h-64 rounded-2xl" />
				<Skeleton className="h-64 rounded-2xl" />
			</div>
		</div>
	)
}
