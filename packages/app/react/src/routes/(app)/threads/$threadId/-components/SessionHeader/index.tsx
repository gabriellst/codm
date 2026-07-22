import { IconChevronLeft, IconPlayerPause, IconPlayerPlay, IconSettings2 } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import {
	getHomeDashboardQueryKey,
	getSessionChatQueryKey,
	usePauseThread,
	useResumeThread,
	useGetSessionChat,
} from '@codedm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useServerEvents } from '@/hooks'
import { ThreadAvatar } from '@/components/console/ThreadAvatar'
import { Dot, threadStatusLabel } from '@/components/console/StatusDot'
import { channelLabel, providerGlyph, providerLabel } from '@/components/console/glyphs'
import { ThreadSettingsDialog } from '../ThreadSettingsDialog'

const TABS = [
	{ label: 'Chat', to: '/threads/$threadId' as const },
	{ label: 'Issues', to: '/threads/$threadId/issues' as const },
	{ label: 'Artifacts', to: '/threads/$threadId/artifacts' as const },
]

/** The session masthead shared by the Chat / Issues / Artifacts tabs: identity, control-plane state, tab switcher. */
export function SessionHeader({ threadId }: { threadId: string }) {
	const router = useRouter()
	const queryClient = useQueryClient()
	const pathname = useRouterState({ select: s => s.location.pathname })
	const { data, isLoading } = useGetSessionChat(threadId)
	const pause = usePauseThread()
	const resume = useResumeThread()

	useServerEvents('browser.thread_status_changed', event => {
		if (event.threadId === threadId) queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) })
	})

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
		<div className="flex shrink-0 flex-col gap-4 pb-4">
			<Button variant="secondary" size="icon" aria-label="Back" className="rounded-full" onClick={() => router.history.back()}>
				<IconChevronLeft />
			</Button>

			<div className="flex flex-wrap items-center justify-between gap-4">
				{isLoading || !data ? (
					<Skeleton className="h-12 w-64" />
				) : (
					<div className="flex items-center gap-3">
						<ThreadAvatar name={data.thread.displayName} channelKind={data.thread.channelKind} size="lg" />
						<div className="flex flex-col">
							<h1 className="heading-display text-2xl text-foreground md:text-3xl">{data.thread.displayName}</h1>
							<span className="font-mono text-sm text-muted-foreground">
								{channelLabel[data.thread.channelKind]} · {data.thread.workspacePath}
							</span>
						</div>
					</div>
				)}

				<div className="inline-flex items-center gap-1 rounded-full bg-secondary p-1">
					{TABS.map(tab => (
						<Link
							key={tab.to}
							to={tab.to}
							params={{ threadId }}
							className={cn(
								'rounded-full px-3.5 py-1 text-sm font-medium transition-colors',
								activeTab === tab.to ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
							)}
						>
							{tab.label}
						</Link>
					))}
				</div>
			</div>

			{data && (
				<div className="flex flex-wrap items-center gap-2">
					{data.thread.providers.map(provider => {
						const Glyph = providerGlyph[provider]
						return (
							<span
								key={provider}
								className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-foreground"
							>
								<Glyph className="size-4" /> {providerLabel[provider]}
							</span>
						)
					})}

					<span
						className={cn(
							'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium',
							data.thread.status === 'RUNNING' ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground',
						)}
					>
						<Dot
							className={
								data.thread.status === 'RUNNING'
									? 'bg-success'
									: data.thread.status === 'NEEDS_ATTENTION'
										? 'bg-warning'
										: 'bg-muted-foreground/40'
							}
						/>
						{threadStatusLabel[data.thread.status]}
					</span>

					{data.paused ? (
						<Button
							variant="outline"
							size="sm"
							disabled={resume.isPending}
							onClick={() => resume.mutate({ threadId }, { onSuccess: invalidate })}
						>
							<IconPlayerPlay data-icon="inline-start" /> Resume
						</Button>
					) : (
						<Button
							variant="outline"
							size="sm"
							disabled={pause.isPending}
							onClick={() => pause.mutate({ threadId }, { onSuccess: invalidate })}
						>
							<IconPlayerPause data-icon="inline-start" /> Pause
						</Button>
					)}

					<ThreadSettingsDialog
						threadId={threadId}
						trigger={
							<Button variant="outline" size="sm">
								<IconSettings2 data-icon="inline-start" /> Thread settings
							</Button>
						}
					/>
				</div>
			)}

			{data && <p className="text-sm text-muted-foreground">{data.autonomyCaption}</p>}
		</div>
	)
}
