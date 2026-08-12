import { useTranslation } from 'react-i18next'
import { IconAntennaBars5, IconFolder, IconHome, IconListDetails, IconPlus, IconSettings } from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import { Link } from '@tanstack/react-router'
import { useGetHomeDashboard, useGetIssuesOverview, useGetSettings, useListWorkspaces } from '@codm/client-typescript/typescript'

import { cn } from '@/lib/utils'
import CodmLogoIcon from '@/components/ui/icons/codmLogo'
import { Skeleton } from '@/components/ui/skeleton'
import { sectionLabel } from '@/components/ui/surfaces'
import { ThreadAvatar, contactAvatarUrl } from '@/components/console/ThreadAvatar'
import { ThreadStatusDot } from '@/components/console/StatusDot'
import type { FileRouteTypes } from '@/routeTree.gen'

type AppRoute = FileRouteTypes['to']

// D2 — the reference measures every sidebar nav/thread row at the asymmetric ladder's `sm` step
// ("16px 16px 16px 5px"), never a symmetric radius — see `rounded-asymmetric-*` in web-utilities.css.
// `activeProps` SOMA ao className, não substitui — o Link concatena as duas strings
// (`link.js`: `out = \`${out} ${activeClassName}\``). Duas consequências que este trio respeita:
//
// 1. Os estilos de idle vão em `inactiveProps`, NUNCA no className base — senão continuam
//    aplicados quando a rota está ativa (era o caso do hover, que clareava a linha selecionada).
// 2. Nenhuma propriedade CSS pode aparecer em `rowBase` E em rowIdle/rowActive. O `cn()` de cada
//    lado roda isolado, então o twMerge nunca vê o par e quem decide é a ordem do stylesheet —
//    que no Tailwind 4 é ALFABÉTICA, não por peso: `.font-bold` sai antes de `.font-medium`, logo
//    `font-medium` vencia e a linha ativa nunca ficava bold. Por isso o peso saiu daqui.
//    Ver `.specs/2026-08-07-conflitos-de-utilitario-fora-do-twmerge.md`.
const rowBase = 'flex items-center gap-3 rounded-asymmetric-sm px-3 h-10 text-sm transition-colors'
const rowIdle = 'font-medium text-sidebar-foreground hover:bg-sidebar-accent/60'
// D3 — the active row's ink is the --secondary pastel's OWN foreground (#3D660A dark green), the
// "pairs with zero exceptions" rule from tokens.css — it was near-black here, the one place the
// pairing wasn't honored.
const rowActive = 'font-bold bg-sidebar-accent text-sidebar-accent-foreground'

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
	// The lockup's version line reads the SAME DTO field the settings page shows
	// (`useGetSettings().appVersion`) — one source, cached; never a hand-mirrored constant.
	const { data: settings } = useGetSettings()

	const issueCount = issues ? issues.statsLine.awaitingInput + issues.statsLine.working + issues.statsLine.completed : undefined
	const channelCount = dashboard?.channels.filter(c => c.status === 'CONNECTED').length
	const workspaceCount = workspaces?.workspaces.length
	// EVERY conversation, not just the ones with a running agent. This read `activeSessions` — which
	// filters to RUNNING | NEEDS_ATTENTION — so an IDLE thread, the normal state of a conversation
	// nobody is being answered in right now, rendered as "Nenhuma conversa ainda" while the row existed.
	const threads = dashboard?.threads ?? []

	// D3 — the rail is the grey band (`--sidebar`, same #f7f7f7 the design's `$card` measures)
	// with a hairline on its right; the content column is the white surface next to it.
	return (
		<aside className={cn('flex w-60 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar px-4 py-6', className)} {...props}>
			{/* D3 logo lockup: the brand mark next to a two-line column — wordmark over the running
			    version in mono. The design draws the mark as a green rounded square with a script "dm"
			    because .pen can't embed the real SVG; the actual mark (green bubble + cursive dm,
			    `CodmLogoIcon`) IS that shape's source, so it stays. */}
			<div className="flex items-center gap-2.5 px-1">
				<CodmLogoIcon className="h-9 w-auto shrink-0" />
				<div className="flex min-w-0 flex-col gap-0.5">
					{/* eslint-disable-next-line local/no-hardcoded-jsx-text -- "CODM" is the wordmark
					    (brand iconography, same in every locale), not translatable copy. */}
					<span className="text-[15px] leading-none font-extrabold tracking-tight text-foreground">CODM</span>
					{settings && <span className="font-mono text-[11px] leading-none text-caption-foreground">{settings.appVersion}</span>}
				</div>
			</div>

			<nav className="flex flex-col gap-1">
				<NavItem to="/dashboard" icon={IconHome} label={t('nav.home')} />
				<NavItem to="/workspaces" icon={IconFolder} label={t('nav.workspaces')} count={workspaceCount} />
				<NavItem to="/issues" icon={IconListDetails} label={t('nav.issues')} count={issueCount} />
				<NavItem to="/channels" icon={IconAntennaBars5} label={t('nav.channels')} count={channelCount} />
				<NavItem to="/settings" icon={IconSettings} label={t('nav.settings')} />
			</nav>

			<div className="flex min-h-0 flex-1 flex-col gap-2">
				{/* D3 — the list header speaks the new section-label voice (bold at body size, hairline
				    under the whole row), not the uppercase eyebrow. The hairline spans label AND the
				    add action, so the preset sits on the row container and the label inherits its type. */}
				<div className={cn(sectionLabel, 'flex items-center justify-between px-2')}>
					<span>{t('console.threads')}</span>
					<Link
						to="/attach"
						aria-label={t('console.attachThread')}
						// Verde na referência — é a única ação de criar da sidebar, e o verde é a cor de ação do sistema.
						className="flex size-6 items-center justify-center rounded-asymmetric-sm text-primary transition-colors hover:bg-sidebar-accent"
					>
						<IconPlus className="size-4" />
					</Link>
				</div>

				<div className="flex flex-col gap-0.5 overflow-y-auto">
					{/* skeleton → empty → list: while the dashboard read is in flight the list shows
					    placeholder rows — "Nenhuma conversa ainda" is reserved for a CONFIRMED empty. */}
					{!dashboard ? (
						<ThreadRowsSkeleton />
					) : threads.length === 0 ? (
						<p className="px-3 py-1 text-sm text-muted-foreground">{t('console.noThreadsYet')}</p>
					) : (
						threads.map(thread => (
							<Link
								key={thread.threadId}
								to="/threads/$threadId"
								params={{ threadId: thread.threadId }}
								className={cn(rowBase, 'h-12')}
								activeProps={{ className: rowActive }}
								inactiveProps={{ className: rowIdle }}
							>
								{/* A FOTO quando o contato (ou o GRUPO) tem uma, iniciais quando não — o `src` sai da
								    função da SDK, nunca de uma url montada à mão. */}
								<ThreadAvatar
									name={thread.displayName}
									src={thread.hasAvatar ? contactAvatarUrl(thread.channelId, thread.externalId) : undefined}
									channelKind={thread.channelKind}
									size="sm"
								/>
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
		<Link to={to} className={rowBase} activeProps={{ className: rowActive }} inactiveProps={{ className: rowIdle }}>
			{({ isActive }) => (
				<>
					<Glyph className="size-4 shrink-0" />
					<span className="flex-1 truncate text-md">{label}</span>
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

// Local, never exported: placeholder thread rows with the SAME height/inset as the real ones,
// so the list doesn't jump when the dashboard read lands.
function ThreadRowsSkeleton() {
	return (
		<div className="flex flex-col gap-0.5">
			<Skeleton className="h-12 rounded-asymmetric-sm" />
			<Skeleton className="h-12 rounded-asymmetric-sm" />
			<Skeleton className="h-12 rounded-asymmetric-sm" />
		</div>
	)
}
