import { useTranslation } from 'react-i18next'
import { IconAntennaBars5, IconFolder, IconHome, IconListDetails, IconPlus, IconSettings } from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useGetHomeDashboard, useGetIssuesOverview, useListWorkspaces } from '@codm/client-typescript/typescript'

import { cn } from '@/lib/utils'
import { Logo } from '@/components/console/Logo'
import { ThreadAvatar } from '@/components/console/ThreadAvatar'
import { ThreadStatusDot } from '@/components/console/StatusDot'
import type { FileRouteTypes } from '@/routeTree.gen'

type AppRoute = FileRouteTypes['to']

// D2 — the reference measures every sidebar nav/thread row at the asymmetric ladder's `sm` step
// ("16px 16px 16px 5px"), never a symmetric radius — see `rounded-asymmetric-*` in web-utilities.css.
const rowBase = 'flex items-center gap-3 rounded-asymmetric-sm px-3 h-10 text-sm font-medium transition-colors'
const rowIdle = 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60'
const rowActive = 'bg-sidebar-accent text-sidebar-foregroundr'

/**
 * The CODM console rail: primary destinations with live counts, then the THREADS
 * list. Owns its own data — the dashboard read supplies threads, channel health and
 * the agent count; workspaces and issues reads supply the two remaining counts.
 */
export function Sidebar({ className, ...props }: React.ComponentProps<'aside'>) {
	const { t } = useTranslation()
	const { data: dashboard } = useGetHomeDashboard()
	const { data: workspaces } = useListWorkspaces()
	const { data: issues } = useGetIssuesOverview()

	const issueCount = issues ? issues.statsLine.awaitingInput + issues.statsLine.working + issues.statsLine.completed : undefined
	const channelCount = dashboard?.channels.filter(c => c.status === 'CONNECTED').length
	const workspaceCount = workspaces?.workspaces.length
	// EVERY conversation, not just the ones with a running agent. This read `activeSessions` — which
	// filters to RUNNING | NEEDS_ATTENTION — so an IDLE thread, the normal state of a conversation
	// nobody is being answered in right now, rendered as "Nenhuma conversa ainda" while the row existed.
	const threads = dashboard?.threads ?? []

	return (
		<aside className={cn('bg-sidebar flex w-60 shrink-0 flex-col gap-6 border-r border-sidebar-border px-4 py-6', className)} {...props}>
			<div className="px-1">
				<Logo />
			</div>

			<nav className="flex flex-col gap-1">
				<NavItem to="/dashboard" icon={IconHome} label={t('nav.home')} />
				<NavItem to="/workspaces" icon={IconFolder} label={t('nav.workspaces')} count={workspaceCount} />
				<NavItem to="/issues" icon={IconListDetails} label={t('nav.issues')} count={issueCount} />
				<NavItem to="/channels" icon={IconAntennaBars5} label={t('nav.channels')} count={channelCount} />
				<NavItem to="/settings" icon={IconSettings} label={t('nav.settings')} />
			</nav>

			<div className="flex min-h-0 flex-1 flex-col gap-2">
				<div className="flex items-center justify-between px-2">
					<span className="label-eyebrow">{t('console.threads')}</span>
					<Link
						to="/attach"
						aria-label={t('console.attachThread')}
						// Verde na referência — é a única ação de criar da sidebar, e o verde é a cor de ação do sistema.
						className="flex size-6 items-center justify-center rounded-full text-primary transition-colors hover:bg-sidebar-accent"
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
		</aside>
	)
}

function NavItem({ to, icon: Glyph, label, count }: { to: AppRoute; icon: Icon; label: string; count?: number }) {
	return (
		<Link to={to} className={cn(rowBase, rowIdle)} activeProps={{ className: cn(rowBase, rowActive) }}>
			{({ isActive }) => (
				<>
					<Glyph className="size-5 shrink-0" />
					<span className="flex-1 truncate">{label}</span>
					{count !== undefined && (
						// D2 — the selected nav item's counter gets its own chip: brand-green fill, the
						// asymmetric ladder's `3xs` step ("9px 9px 9px 3px"), WHITE text for contrast
						// (--primary-foreground — not --secondary-foreground, which is dark green and
						// reads illegibly on this fill). Idle stays a plain muted number, no chip.
						<span
							className={cn(
								'text-sm tabular-nums',
								isActive ? 'rounded-asymmetric-3xs bg-primary px-1.5 py-0.5 font-bold text-primary-foreground' : 'text-muted-foreground',
							)}
						>
							{count}
						</span>
					)}
				</>
			)}
		</Link>
	)
}
