// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-ORIGIN · want→got corpus · examples/pairs/dashboard
// repo:    template-fullstack
// branch:  feat/template-polyglot
// source:  packages/app/react/src/routes/(app)/dashboard/-components/PixelFunnelSection/index.tsx
// role:    Section — owns useGetPixelFunnel; composes 5 stage columns + conversion/carts rail over a grid Card
// Corpus reference copy (purged product vocabulary renamed to neutral identifiers — product-residue rail) — NOT a live module. Do not import it.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { IconPercentage, IconShoppingCart } from '@tabler/icons-react'
import { format } from 'date-fns'
import { useGetPixelFunnel } from '@template/client-typescript/typescript'
import { useViewScopeStore } from '@/stores'
import { useMoney } from '@/hooks'
import { formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { FunnelStageColumn } from '../FunnelStageColumn'
import { FunnelSummaryStat } from '../FunnelSummaryStat'
import { buildStageRows } from './funnel'

const routeApi = getRouteApi('/(app)/dashboard/')
const asYmd = (iso: string) => format(new Date(iso), 'yyyy-MM-dd')

interface PixelFunnelSectionProps extends React.ComponentProps<'section'> {}

/** Faint grid behind the card content, at separator opacity. */
function GridBackdrop() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 opacity-40 bg-[repeating-linear-gradient(to_right,transparent,transparent_calc(20%-1px),var(--border)_calc(20%-1px),var(--border)_20%),repeating-linear-gradient(to_bottom,transparent,transparent_31px,var(--border)_31px,var(--border)_32px)]"
		/>
	)
}

function FunnelSkeleton() {
	return (
		<div className="relative z-10 flex flex-1 gap-3">
			{Array.from({ length: 5 }).map((_, i) => (
				<Skeleton key={i} className="h-44 flex-1" />
			))}
		</div>
	)
}

/**
 * PixelFunnelSection — the dashboard's pixel conversion funnel: one integrated Card with 5 stage
 * columns (vertical dividers) + a conversion-rate/carts rail (horizontal divider) over a faint grid.
 * Owns the `useGetPixelFunnel` query; reads the view scope from the global store and the date range
 * from the route's URL search; renders money via `useMoney()` and percentages via `formatPercent`.
 */
export function PixelFunnelSection({ className, ...props }: PixelFunnelSectionProps) {
	const { t } = useTranslation()
	const formatMoney = useMoney()
	const viewScope = useViewScopeStore(s => s.viewScope)
	const { startDate, endDate } = routeApi.useSearch()

	const { data } = useGetPixelFunnel({ viewScope, startDate: asYmd(startDate), endDate: asYmd(endDate) })

	return (
		<section aria-label={t('pixelFunnel.title')} className={cn(className)} {...props}>
			<Card className="relative flex flex-row gap-0 overflow-hidden rounded-[1.5rem] p-5">
				<GridBackdrop />
				{!data ? (
					<FunnelSkeleton />
				) : !data.hasPixel ? (
					<Empty className="relative z-10 border-none">
						<EmptyHeader>
							<EmptyTitle>{t('pixelFunnel.empty.title')}</EmptyTitle>
							<EmptyDescription>{t('pixelFunnel.empty.description')}</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button>{t('pixelFunnel.empty.cta')}</Button>
						</EmptyContent>
					</Empty>
				) : (
					<>
						<div className="relative z-10 flex flex-1 items-stretch" role="list" aria-label={t('pixelFunnel.title')}>
							{buildStageRows(data).map((row, i) => (
								<div key={row.key} className="flex flex-1 items-stretch">
									{i > 0 ? <Separator orientation="vertical" className="mx-1" /> : null}
									<FunnelStageColumn row={row} />
								</div>
							))}
						</div>
						<Separator orientation="vertical" className="mx-4" />
						<div className="relative z-10 flex w-56 shrink-0 flex-col justify-between">
							<FunnelSummaryStat
								icon={IconPercentage}
								label={t('pixelFunnel.conversionRate')}
								hint={t('pixelFunnel.conversionRateHint')}
								value={formatPercent(data.conversionRate.value)}
								deltaPct={data.conversionRate.deltaPct ?? undefined}
							/>
							<Separator className="my-4" />
							<FunnelSummaryStat
								icon={IconShoppingCart}
								label={t('pixelFunnel.carts')}
								hint={t('pixelFunnel.cartsHint')}
								value={formatMoney(data.carts.value.value)}
								deltaPct={data.carts.value.deltaPct ?? undefined}
							/>
						</div>
					</>
				)}
			</Card>
		</section>
	)
}
