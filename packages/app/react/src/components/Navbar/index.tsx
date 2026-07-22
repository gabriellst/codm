import { useTranslation } from 'react-i18next'
import { IconAntennaBars5, IconFolder, IconHome, IconListDetails, IconPlus, IconSettings } from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useGetHomeDashboard, useGetIssuesOverview, useListWorkspaces } from '@codedm/client-typescript/typescript'

import { cn } from '@/lib/utils'
import { Logo } from '@/components/console/Logo'
import { ThreadAvatar } from '@/components/console/ThreadAvatar'
import { ThreadStatusDot } from '@/components/console/StatusDot'
import type { FileRouteTypes } from '@/routeTree.gen'

type AppRoute = FileRouteTypes['to']

const rowBase = 'flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-medium transition-colors'
const rowIdle = 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60'
const rowActive = 'bg-sidebar-accent text-sidebar-foreground'

/**
 * The CodeDM console rail: primary destinations with live counts, then the THREADS
 * list. Owns its own data — the dashboard read supplies threads, channel health and
 * the agent count; workspaces and issues reads supply the two remaining counts.
 */
export function Sidebar({ className }: React.ComponentProps<'aside'>) {
	const { t } = useTranslation()
	const { data: dashboard } = useGetHomeDashboard()
	const { data: workspaces } = useListWorkspaces()
	const { data: issues } = useGetIssuesOverview()

	const issueCount = issues ? issues.statsLine.awaitingInput + issues.statsLine.working + issues.statsLine.completed : undefined
	const channelCount = dashboard?.channels.filter(c => c.status === 'CONNECTED').length
	const workspaceCount = workspaces?.workspaces.length
	const threads = dashboard?.activeSessions ?? []

	return (
		<aside className={cn('bg-sidebar flex w-60 shrink-0 flex-col gap-6 border-r border-sidebar-border px-4 py-6', className)}>
			<div className="px-1">
				<Logo />
			</div>

			<nav className="flex flex-col gap-1">
				<NavItem to="/dashboard" icon={IconHome} label="Home" />
				<NavItem to="/issues" icon={IconListDetails} label="Issues" count={issueCount} />
				<NavItem to="/channels" icon={IconAntennaBars5} label="Channels" count={channelCount} />
				<NavItem to="/workspaces" icon={IconFolder} label="Workspaces" count={workspaceCount} />
				<NavItem to="/settings" icon={IconSettings} label="Settings" />
			</nav>

			<div className="flex min-h-0 flex-1 flex-col gap-2">
				<div className="flex items-center justify-between px-2">
					<span className="label-eyebrow">{t('console.threads')}</span>
					<Link
						to="/attach"
						aria-label={t('console.attachThread')}
						className="flex size-6 items-center justify-center rounded-full text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
					>
						<IconPlus className="size-4" />
					</Link>
				</div>

				<div className="flex flex-col gap-0.5 overflow-y-auto">
					{threads.length === 0 ? (
						<p className="px-3 py-1 text-sm text-muted-foreground">{t('console.noThreadsYet')}</p>
					) : (
						threads.map(thread => (
							<Link
								key={thread.threadId}
								to="/threads/$threadId"
								params={{ threadId: thread.threadId }}
								className={cn(rowBase, rowIdle, 'h-12')}
								activeProps={{ className: cn(rowBase, rowActive, 'h-12') }}
							>
								<ThreadAvatar name={thread.displayName} channelKind={thread.channelKind} size="sm" />
								<span className="flex-1 truncate">{thread.displayName}</span>
								<ThreadStatusDot status={thread.status} />
							</Link>
						))
					)}
				</div>
			</div>

			<div className="px-2 text-xs leading-relaxed text-muted-foreground">
				{t('console.footerLocal')}
				<br />
				{t('console.footerNoAccount')}
			</div>
		</aside>
	)
}

function NavItem({ to, icon: Glyph, label, count }: { to: AppRoute; icon: Icon; label: string; count?: number }) {
	return (
		<Link to={to} className={cn(rowBase, rowIdle)} activeProps={{ className: cn(rowBase, rowActive) }}>
			<Glyph className="size-5 shrink-0" />
			<span className="flex-1 truncate">{label}</span>
			{count !== undefined && <span className="text-sm tabular-nums text-muted-foreground">{count}</span>}
		</Link>
	)
}
