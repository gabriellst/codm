// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT-ORIGIN · want→got corpus · examples/pairs/dashboard
// repo:    template-fullstack
// branch:  feat/template-polyglot
// source:  packages/app/react/src/routes/(app)/dashboard/-components/AdditionalCostsSection/DiscountCostsToggle.tsx
// role:    Store-backed checkbox — cross-card discountAdditionalCosts display pref
// Verbatim copy kept as corpus reference — NOT a live module. Do not import it.
// ─────────────────────────────────────────────────────────────────────────────
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '../../-stores/useDashboardStore'

/**
 * Store-backed checkbox. Writing `discountAdditionalCosts` lets the other dashboard cards decide
 * whether to subtract additional costs from profit/margin. Not a URL param — it is a cross-card
 * display preference (see useDashboardStore).
 */
export function DiscountCostsToggle({ className, ...props }: ComponentProps<typeof Label>) {
	const { t } = useTranslation()
	const discountAdditionalCosts = useDashboardStore(s => s.discountAdditionalCosts)
	const setDiscountAdditionalCosts = useDashboardStore(s => s.setDiscountAdditionalCosts)
	const label = t('dashboard.additionalCosts.discountToggle')

	return (
		<Label className={cn('cursor-pointer gap-3 text-muted-foreground', className)} {...props}>
			<Checkbox
				checked={discountAdditionalCosts}
				onCheckedChange={checked => setDiscountAdditionalCosts(checked === true)}
				aria-label={label}
			/>
			{label}
		</Label>
	)
}
