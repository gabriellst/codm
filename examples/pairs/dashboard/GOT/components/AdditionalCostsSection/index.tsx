// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-ORIGIN · want→got corpus · examples/pairs/dashboard
// repo:    template-fullstack
// branch:  feat/template-polyglot
// source:  packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/index.tsx
// role:    Section — owns useGetDashboard; builds cost rows from additionalCost, national-only draftOrders
// Corpus reference copy (purged product vocabulary renamed to neutral identifiers — product-residue rail) — NOT a live module. Do not import it.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi } from '@tanstack/react-router'
import { useGetDashboard } from '@codedm/client-typescript/typescript'
import type { GetDashboard200 } from '@codedm/client-typescript/typescript'

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { GradientIconBadge } from '@/components/ui/gradient-icon-badge'
import { BalanceIcon, CardIcon, CashIcon, LockIcon, OrderBlockIcon, ReturnIcon, ToolIcon } from '@/components/ui/icons'
import type { IconComponent } from '@/components/ui/icons'
import { sumMoney, type Money } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useViewScopeStore } from '@/stores'
import { useMoney } from '@/hooks'

import { DiscountCostsToggle } from './DiscountCostsToggle'
import { AdditionalCostRow } from './AdditionalCostRow'
import { CostTooltipLines, OperationalTooltip } from './CostTooltips'

const routeApi = getRouteApi('/(app)/dashboard/')

type AdditionalCost = GetDashboard200['additionalCost']

// Rows summed into the header total + rendered in order. Typed off the additionalCost schema so the
// row set AND the loading skeleton stay in sync. (draftOrders is national-only + informational, so
// it's appended separately and excluded from the total.)
const COST_KEYS = ['chargeback', 'refund', 'taxes', 'operational', 'warranty'] as const satisfies readonly (keyof AdditionalCost)[]

interface CostRowView {
	key: string
	icon: IconComponent
	label: string
	value: string
	tooltip: ReactNode
}

/**
 * Additional Costs card — the period's cost categories read from `GetDashboard`'s `additionalCost`
 * top-level, each row revealing its sub-breakdown on hover (operational uses a custom titled
 * tooltip). Owns the dashboard query, feeds rows by props. Works in mono (single-store) and
 * consolidated (multi-store) view scope. `draftOrders` shows only in *_NATIONAL.
 * All copy is i18n-driven; currency formatting follows the active locale via useMoney.
 */
export function AdditionalCostsSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const formatMoney = useMoney()
	const { startDate, endDate, productIds } = routeApi.useSearch()
	const viewScope = useViewScopeStore(s => s.viewScope)
	const { data, isPending, isError } = useGetDashboard({ viewScope, startDate, endDate, productIds })

	const view = useMemo(() => {
		if (!data) return null

		const ac = data.additionalCost

		const byKey: Record<(typeof COST_KEYS)[number], { icon: IconComponent; label: string; total: Money; tooltip: ReactNode }> = {
			chargeback: {
				icon: CardIcon,
				label: t('dashboard.additionalCosts.rows.chargeback'),
				total: ac.chargeback.byStatus.total.value,
				tooltip: (
					<CostTooltipLines
						lines={[
							{ label: t('dashboard.additionalCosts.tooltip.open'), value: formatMoney(ac.chargeback.byStatus.segments.OPEN.value) },
							{ label: t('dashboard.additionalCosts.tooltip.lost'), value: formatMoney(ac.chargeback.byStatus.segments.LOST.value) },
							{ label: t('dashboard.additionalCosts.tooltip.won'), value: formatMoney(ac.chargeback.byStatus.segments.WON.value) },
							{ label: t('dashboard.additionalCosts.tooltip.fees'), value: formatMoney(ac.chargeback.fees.value) },
						]}
					/>
				),
			},
			refund: {
				icon: ReturnIcon,
				label: t('dashboard.additionalCosts.rows.refund'),
				total: ac.refund.value,
				tooltip: (
					<CostTooltipLines lines={[{ label: t('dashboard.additionalCosts.tooltip.total'), value: formatMoney(ac.refund.value) }]} />
				),
			},
			taxes: {
				icon: BalanceIcon,
				label: t('dashboard.additionalCosts.rows.taxes'),
				total: sumMoney([ac.taxes.ads.value, ac.taxes.others.value]),
				tooltip: (
					<CostTooltipLines
						lines={[
							{ label: t('dashboard.additionalCosts.tooltip.ads'), value: formatMoney(ac.taxes.ads.value) },
							{ label: t('dashboard.additionalCosts.tooltip.others'), value: formatMoney(ac.taxes.others.value) },
						]}
					/>
				),
			},
			operational: {
				icon: ToolIcon,
				label: t('dashboard.additionalCosts.rows.operational'),
				total: ac.operational.total.value,
				tooltip: <OperationalTooltip operational={ac.operational} />,
			},
			warranty: {
				icon: LockIcon,
				label: t('dashboard.additionalCosts.rows.warranty'),
				total: ac.warranty.value,
				tooltip: (
					<CostTooltipLines lines={[{ label: t('dashboard.additionalCosts.tooltip.total'), value: formatMoney(ac.warranty.value) }]} />
				),
			},
		}

		const rows: CostRowView[] = COST_KEYS.map(key => {
			const r = byKey[key]
			return { key, icon: r.icon, label: r.label, value: formatMoney(r.total), tooltip: r.tooltip }
		})

		// draftOrders — national only (the discriminated union carries it on the *_NATIONAL variants);
		// informational (count + value of draft orders), not summed into the total.
		if (data.kind === 'SINGLE_NATIONAL' || data.kind === 'MULTI_NATIONAL') {
			const draftOrders = data.additionalCost.draftOrders
			rows.push({
				key: 'draftOrders',
				icon: OrderBlockIcon,
				label: t('dashboard.additionalCosts.rows.draftOrders'),
				value: formatMoney(draftOrders.value.value),
				tooltip: (
					<CostTooltipLines lines={[{ label: t('dashboard.additionalCosts.tooltip.count'), value: String(draftOrders.count.value) }]} />
				),
			})
		}

		const headerTotal = formatMoney(sumMoney(COST_KEYS.map(key => byKey[key].total)))
		return { headerTotal, rows }
	}, [data, t, formatMoney])

	return (
		<Card className={cn('gap-4 p-6', className)} {...props}>
			<div className="flex items-center gap-4">
				<GradientIconBadge icon={CashIcon} />
				<div className="flex min-w-0 flex-col gap-2">
					<span className="text-muted-foreground text-lg font-medium">{t('dashboard.additionalCosts.title')}</span>
					{isPending ? (
						<Skeleton className="mt-1 h-8 w-32" />
					) : (
						<span className="truncate text-3xl font-bold text-foreground">{view ? view.headerTotal : '—'}</span>
					)}
				</div>
			</div>

			<DiscountCostsToggle className="mx-2" />

			<div className="border-t border-border/60" />

			<div className="flex flex-col gap-3" role="list" aria-label={t('dashboard.additionalCosts.listAria')}>
				{isPending ? (
					COST_KEYS.map(key => <Skeleton key={key} className="h-5 w-full" />)
				) : isError || !view ? (
					<p className="text-sm text-muted-foreground">{t('dashboard.additionalCosts.loadError')}</p>
				) : (
					view.rows.map(row => (
						<AdditionalCostRow key={row.key} icon={row.icon} label={row.label} value={row.value} tooltip={row.tooltip} />
					))
				)}
			</div>
		</Card>
	)
}
