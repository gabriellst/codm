import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
	getHomeDashboardQueryKey,
	getNeedsYouPanelQueryKey,
	getSessionChatQueryKey,
	useGetNeedsYouPanel,
	useResolveStop,
} from '@codedm/client-typescript/typescript'
import type { GetNeedsYouPanelQueryResponse } from '@codedm/client-typescript/typescript'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { useServerEvents } from '@/hooks'
import { resolutionIsPrimary, resolutionLabel, stopLabel } from '@/components/console/glyphs'

type Stop = GetNeedsYouPanelQueryResponse['stops'][number]

/** Active stops on a thread with per-kind resolution actions (T14). Renders nothing when clear. */
export function NeedsYouPanel({ threadId }: { threadId: string }) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const { data } = useGetNeedsYouPanel(threadId)

	useServerEvents('browser.stop_raised', event => {
		if (event.threadId === threadId) queryClient.invalidateQueries({ queryKey: getNeedsYouPanelQueryKey(threadId) })
	})

	const stops = data?.stops ?? []
	if (stops.length === 0) return null

	return (
		<Card className="mb-4 border-warning/50">
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
				{stopLabel[stop.kind]}
			</Badge>
			<div className="flex min-w-0 flex-1 flex-col">
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
						{resolutionLabel[resolution]}
					</Button>
				))}
			</div>
		</div>
	)
}
