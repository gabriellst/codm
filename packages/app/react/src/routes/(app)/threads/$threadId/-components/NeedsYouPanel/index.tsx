import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
	getHomeDashboardQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	useGetNeedsYouPanel,
	useResolveStop,
} from '@codm/client-typescript/typescript'
import type { GetNeedsYouPanelQueryResponse } from '@codm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { resolutionIsPrimary } from '@/components/console/glyphs'

type Stop = GetNeedsYouPanelQueryResponse['stops'][number]

/** Active stops on a thread with per-kind resolution actions (T14). Renders nothing when clear. */
export function NeedsYouPanel({ threadId, className }: { threadId: string } & Pick<ComponentProps<typeof Card>, 'className'>) {
	const { t } = useTranslation()
	const { data } = useGetNeedsYouPanel(threadId)

	// The subscription lives in `useThreadRealtime`, mounted once by the `$threadId` layout: both
	// `integration.thread.stop_raised` (this panel fills) and `integration.thread.stop_resolved` (this
	// panel clears) invalidate `getNeedsYouPanelQueryKey` directly off the raw wire fact (B5) — no
	// enriched `browser.*` frame, no server-side status recompute standing in for either direction.
	const stops = data?.stops ?? []
	if (stops.length === 0) return null

	return (
		<Card className={cn('mb-4 border-warning/50', className)}>
			<div className="flex items-center justify-between border-b border-border px-5 py-3">
				<span className="inline-flex items-center gap-2 font-semibold text-foreground">
					{t('session.needsYou')} <span className="text-sm font-normal text-muted-foreground">{stops.length}</span>
				</span>
				<span className="text-sm text-muted-foreground">{t('session.agentStopped')}</span>
			</div>
			<div className="flex flex-col divide-y divide-border">
				{stops.map(stop => (
					<StopRow key={stop.stopId} threadId={threadId} stop={stop} />
				))}
			</div>
		</Card>
	)
}

function StopRow({ threadId, stop }: { threadId: string; stop: Stop }) {
	const queryClient = useQueryClient()
	const resolve = useResolveStop()

	const onResolve = (resolution: Stop['availableResolutions'][number]) => {
		resolve.mutate(
			{ stopId: stop.stopId, data: { resolution } },
			{
				onSuccess: () => {
					queryClient.invalidateQueries({ queryKey: getNeedsYouPanelQueryKey(threadId) })
					queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) })
					queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
				},
			},
		)
	}

	return (
		<div className="flex flex-wrap items-center gap-3 px-5 py-3">
			<Badge variant="outline" className="shrink-0">
				{enumLabel('StopKind', stop.kind)}
			</Badge>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<span className="font-medium text-foreground">{stop.title}</span>
				<span className="truncate text-sm text-muted-foreground">{stop.detail}</span>
			</div>
			<span className="shrink-0 text-xs text-muted-foreground">{stop.raisedAt}</span>
			<div className="flex shrink-0 gap-2">
				{stop.availableResolutions.map(resolution => (
					<Button
						key={resolution}
						size="sm"
						variant={resolutionIsPrimary[resolution] ? 'default' : 'outline'}
						disabled={resolve.isPending}
						onClick={() => onResolve(resolution)}
					>
						{enumLabel('StopResolution', resolution)}
					</Button>
				))}
			</div>
		</div>
	)
}
