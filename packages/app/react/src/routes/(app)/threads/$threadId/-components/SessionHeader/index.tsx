import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconPlayerPause, IconPlayerPlay, IconSettings2 } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import {
	getHomeDashboardQueryKey,
	getSessionChatQueryKey,
	usePauseThread,
	useResumeThread,
	useGetSessionChat,
} from '@codm/client-typescript/typescript'
import type { GetSessionChatQueryResponse } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ThreadAvatar } from '@/components/console/ThreadAvatar'
import { enumLabel } from '@/lib'
import { Dot } from '@/components/console/StatusDot'
import { providerLabel } from '@/components/console/glyphs'
import { useDialogStore } from '@/stores/useDialogStore'
import { ThreadSettingsDialog } from '../ThreadSettingsDialog'

type Session = GetSessionChatQueryResponse

/**
 * How autonomously this thread is running, in the operator's language (D5).
 *
 * The daemon used to send this as a finished English sentence on `autonomyCaption`, which no frontend
 * i18n could reach. It never needed to: `paused` and `mentionGate` are on the same payload, so the
 * caption is a pure function of state the browser already holds.
 */
function autonomyCaption(t: (key: string, opts?: Record<string, unknown>) => string, session: Session): string {
	if (session.paused) return t('session.autonomyPaused')
	if (session.mentionGate.enabled) return t('session.autonomyMentionGated', { tag: session.mentionGate.tag })
	return t('session.autonomyFull')
}

const TABS = [
	{ labelKey: 'session.tabChat', to: '/threads/$threadId' as const },
	{ labelKey: 'session.tabIssues', to: '/threads/$threadId/issues' as const },
	{ labelKey: 'session.tabArtifacts', to: '/threads/$threadId/artifacts' as const },
]

/**
 * The session masthead shared by the Chat / Issues / Artifacts tabs (D3).
 *
 * ### Two rows, which is the design's shape and was not this component's
 * It used to be five stacked bands — a back button on its own line, identity, a pill-group tab
 * switcher floated right, a row of provider pills, then the autonomy caption. The design puts
 * identity and controls on ONE row and tabs on a second, with everything secondary demoted into a
 * single quiet mono line under the name (workspace path · providers). The back button is gone with
 * them: the sidebar is the thread list, so it navigated to a place already on screen.
 *
 * ### Sticky — the founder's call, and a deliberate departure
 * The design's own header sits in normal flow and scrolls away. The founder asked for it to stay, so
 * it does. That costs a fixed band at the top of the scroll container, and the band has to clear
 * `AgentsRunningPill` — which the `(app)` layout pins at `top-5 right-6`, i.e. floating over exactly
 * this space. So the page's top padding moves OFF the route wrapper and INTO this header: the header
 * owns the clearance, the geometry never changes between scrolled and unscrolled, and the pill cannot
 * collide with the icon buttons on the right of row one.
 */
export function SessionHeader({ threadId, className, ...props }: ComponentProps<'div'> & { threadId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const pathname = useRouterState({ select: s => s.location.pathname })
	const { data, isLoading } = useGetSessionChat(threadId)
	const show = useDialogStore(s => s.show)
	const pause = usePauseThread()
	const resume = useResumeThread()

	// Server-driven freshness belongs to `useThreadRealtime` (the layout mounts it). What stays here is
	// the OPTIMISTIC path: pause/resume is a local mutation whose result the operator expects to see at
	// once, without waiting for a round trip through the event stream.
	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) })
		queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
	}

	const activeTab = pathname.endsWith('/artifacts')
		? '/threads/$threadId/artifacts'
		: pathname.includes('/issues')
			? '/threads/$threadId/issues'
			: '/threads/$threadId'

	return (
		<div className={cn('sticky top-0 z-10 -mx-6 flex shrink-0 flex-col bg-route-background px-6 pt-12', className)} {...props}>
			<div className="flex items-center gap-3.5 pb-4">
				{isLoading || !data ? (
					<Skeleton className="h-12 w-64" />
				) : (
					<>
						<ThreadAvatar name={data.thread.displayName} channelKind={data.thread.channelKind} size="lg" />
						<div className="flex min-w-0 flex-1 flex-col gap-1.5">
							<div className="flex flex-wrap items-center gap-2">
								<h1 className="heading-display truncate text-xl text-foreground md:text-2xl">{data.thread.displayName}</h1>
								<span
									className={cn(
										'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
										data.thread.status === 'RUNNING' ? 'bg-primary text-primary-foreground' : 'border border-input text-foreground',
									)}
								>
									<Dot
										className={
											data.thread.status === 'RUNNING'
												? 'bg-primary-foreground'
												: data.thread.status === 'NEEDS_ATTENTION'
													? 'bg-warning'
													: 'bg-caption-foreground/50'
										}
									/>
									{enumLabel('ThreadStatus', data.thread.status)}
								</span>
							</div>
							{/* Everything secondary on ONE quiet mono line — the design's `path · providers`. */}
							<span className="truncate font-mono text-xs text-caption-foreground">
								{data.thread.workspacePath}
								{data.thread.providers.length > 0 && ` · ${data.thread.providers.map(p => providerLabel[p]).join(', ')}`}
							</span>
						</div>

						<div className="flex shrink-0 items-center gap-2">
							{data.paused ? (
								<Button
									variant="outline"
									size="icon"
									aria-label={t('session.resume')}
									title={t('session.resume')}
									className="rounded-full"
									disabled={resume.isPending}
									onClick={() => resume.mutate({ threadId }, { onSuccess: invalidate })}
								>
									<IconPlayerPlay />
								</Button>
							) : (
								<Button
									variant="outline"
									size="icon"
									aria-label={t('session.pause')}
									title={t('session.pause')}
									className="rounded-full"
									disabled={pause.isPending}
									onClick={() => pause.mutate({ threadId }, { onSuccess: invalidate })}
								>
									<IconPlayerPause />
								</Button>
							)}

							<Button
								variant="outline"
								size="icon"
								aria-label={t('session.threadSettings')}
								title={t('session.threadSettings')}
								className="rounded-full"
								onClick={() => show(<ThreadSettingsDialog threadId={threadId} />)}
							>
								<IconSettings2 />
							</Button>
						</div>
					</>
				)}
			</div>

			{/* Row two: tabs underlined against the row's own rule, caption pushed to the far right. */}
			<div className="flex items-center gap-4 border-b border-border">
				{TABS.map(tab => (
					<Link
						key={tab.to}
						to={tab.to}
						params={{ threadId }}
						className={cn(
							'-mb-px border-b-2 px-1 pb-2.5 pt-1 text-sm font-semibold transition-colors',
							// D2 — this is a hand-rolled `line`-style tab strip (route Links, not the `Tabs`
							// primitive — Base UI's Tabs.Root doesn't compose with per-tab routes). The reference
							// measures the SAME pattern the `Tabs` primitive already encodes for its `line`
							// variant: only the underline recolors to `--primary`, the label stays foreground —
							// see `components/ui/tabs.tsx`'s `after:bg-primary` for the primitive's own version
							// of this rule. This strip was drifting from it with a plain `border-foreground`
							// (black) underline — that's the "tabs sem verde" the founder was seeing.
							activeTab === tab.to ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
						)}
					>
						{t(tab.labelKey)}
					</Link>
				))}
				{data && <span className="ml-auto truncate pb-2.5 text-xs text-caption-foreground">{autonomyCaption(t, data)}</span>}
			</div>
		</div>
	)
}
