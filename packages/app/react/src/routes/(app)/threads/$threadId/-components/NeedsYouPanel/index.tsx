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
import { alertActionButton, alertSurface } from '@/components/ui/surfaces'
import { enumLabel } from '@/lib'
import { cn } from '@/lib/utils'
import { resolutionIsPrimary } from '@/components/console/glyphs'

type Stop = GetNeedsYouPanelQueryResponse['stops'][number]

/**
 * Active stops on a thread with per-kind resolution actions (T14). Renders nothing when clear.
 *
 * D2 — this used to be a plain white `Card` with a `border-warning/50` hairline: a different visual
 * language than the dashboard's "precisa de você" callout (black surface, success-bright dot/CTA),
 * even though both panels mean the exact same thing on the same design. The reference's in-thread
 * version of this panel (embedded above the transcript) IS that same black+green surface, just
 * holding a LIST of stops instead of one summary — so this shares `alertSurface`/`alertActionButton`
 * from `components/ui/surfaces.ts` with the dashboard's `NeedsYouCallout` instead of re-deriving its
 * own palette. Same composition, two data shapes.
 */
export function NeedsYouPanel({ threadId, className }: { threadId: string } & Pick<ComponentProps<'div'>, 'className'>) {
	const { t } = useTranslation()
	const { data } = useGetNeedsYouPanel(threadId)

	// The subscription lives in `useThreadRealtime`, mounted once by the `$threadId` layout: both
	// `integration.thread.stop_raised` (this panel fills) and `integration.thread.stop_resolved` (this
	// panel clears) invalidate `getNeedsYouPanelQueryKey` directly off the raw wire fact (B5) — no
	// enriched `browser.*` frame, no server-side status recompute standing in for either direction.
	const stops = data?.stops ?? []
	if (stops.length === 0) return null

	return (
		<div className={cn('mb-4 overflow-hidden rounded-asymmetric-xl', alertSurface, className)}>
			<div className="flex items-center justify-between border-b border-background/10 px-5 py-3">
				<span className="inline-flex items-center gap-2 font-semibold">
					{t('session.needsYou')} <span className="text-sm font-normal text-background/60">{stops.length}</span>
				</span>
				<span className="text-sm text-background/60">{t('session.agentStopped')}</span>
			</div>
			<div className="flex flex-col divide-y divide-background/10">
				{stops.map(stop => (
					<StopRow key={stop.stopId} threadId={threadId} stop={stop} />
				))}
			</div>
		</div>
	)
}

function StopRow({ threadId, stop }: { threadId: string; stop: Stop }) {
	const queryClient = useQueryClient()
	// onSuccess lives on the MUTATION (hook options), not on `mutate()`'s second argument — the
	// latter is owned by the React Query observer and is dropped if this row unmounts before the
	// response lands (e.g. the operator navigates to another thread mid-request); the former
	// survives (component bp-30).
	const resolve = useResolveStop({
		mutation: {
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: getNeedsYouPanelQueryKey(threadId) })
				queryClient.invalidateQueries({ queryKey: getSessionChatQueryKey(threadId) })
				queryClient.invalidateQueries({ queryKey: getHomeDashboardQueryKey() })
			},
		},
	})

	const onResolve = (resolution: Stop['availableResolutions'][number]) => {
		resolve.mutate({ stopId: stop.stopId, data: { resolution } })
	}

	return (
		<div className="flex flex-wrap items-center gap-3 px-5 py-3">
			{/* D2 — the reference's stop-kind chip on this dark surface is an OUTLINE in success-bright
			    (border+text, transparent fill), not the plain neutral outline `Badge` renders by default. */}
			<Badge variant="outline" className="shrink-0 border-success-bright bg-transparent text-success-bright">
				{enumLabel('StopKind', stop.kind)}
			</Badge>
			<div className="flex min-w-0 flex-1 flex-col gap-1.5">
				<span className="font-medium">{stop.title}</span>
				<span className="truncate text-sm text-background/60">{stop.detail}</span>
			</div>
			<span className="shrink-0 text-xs text-background/60">{stop.raisedAt}</span>
			<div className="flex shrink-0 gap-2">
				{stop.availableResolutions.map(resolution => (
					<Button
						key={resolution}
						size="sm"
						variant={resolutionIsPrimary[resolution] ? 'default' : 'outline'}
						disabled={resolve.isPending}
						onClick={() => onResolve(resolution)}
						className={
							resolutionIsPrimary[resolution]
								? alertActionButton
								: // D2 — DERIVED, not measured (the reference's secondary "Negar" action on this
									// panel idles at a dim olive-green border/text with no
									// equivalent token in the system; approximated from --background opacity, the
									// same derivation pattern this surface already uses elsewhere (`text-background/60`
									// above). Hovers to the same success-bright the primary action fills, never a
									// generic `hover:border-primary` — that reads as the wrong green against black.
									'border-background/20 bg-transparent text-background/70 hover:border-success-bright hover:bg-transparent hover:text-success-bright active:bg-transparent'
						}
					>
						{enumLabel('StopResolution', resolution)}
					</Button>
				))}
			</div>
		</div>
	)
}
