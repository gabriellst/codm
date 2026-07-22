// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-ORIGIN · want→got corpus · examples/pairs/dashboard
// repo:    template-fullstack
// branch:  feat/template-polyglot
// source:  packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/CostTooltips.tsx
// role:    Tooltip builders — CostTooltipLines + titled OperationalTooltip
// Verbatim copy kept as corpus reference — NOT a live module. Do not import it.
// ─────────────────────────────────────────────────────────────────────────────
import { useTranslation } from 'react-i18next'
import type { GetDashboard200 } from '@codedm/client-typescript/typescript'

import { enumLabel } from '@/lib/enums'
import { useMoney } from '@/hooks'

export interface CostTooltipLine {
	label: string
	value: string
}

/** Standard breakdown tooltip: left-aligned `label: value` lines. */
export function CostTooltipLines({ lines }: { lines: CostTooltipLine[] }) {
	return (
		<div className="flex flex-col gap-1">
			{lines.map(line => (
				<div key={line.label} className="flex justify-between gap-2">
					<span className="text-muted-foreground">{line.label}:</span>
					<span className="font-medium text-foreground">{line.value}</span>
				</div>
			))}
		</div>
	)
}

type OperationalDetail = GetDashboard200['additionalCost']['operational']

/**
 * Operational tooltip — a titled list of each operational cost (`name (freq)` / amount). Takes the
 * `additionalCost.operational` detail entry directly and owns its own i18n + currency formatting.
 */
export function OperationalTooltip({ operational }: { operational: OperationalDetail }) {
	const { t } = useTranslation()
	const formatMoney = useMoney()

	return (
		<div className="flex min-w-44 flex-col gap-1.5">
			<div className="text-center font-semibold text-foreground">{t('dashboard.additionalCosts.tooltip.operationalTitle')}</div>
			{operational.items.length ? (
				operational.items.map(item => (
					<div key={item.id} className="flex items-center justify-between gap-6">
						<span className="text-muted-foreground">
							{item.name} ({enumLabel('OperationalCostRecurrency', item.frequency)})
						</span>
						<span className="font-medium text-foreground">{formatMoney({ amountCents: item.amountCents, currency: item.currency })}</span>
					</div>
				))
			) : (
				<div className="text-center text-muted-foreground">{t('dashboard.additionalCosts.tooltip.noCosts')}</div>
			)}
		</div>
	)
}
