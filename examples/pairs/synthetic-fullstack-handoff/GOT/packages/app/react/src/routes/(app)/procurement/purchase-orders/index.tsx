import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { zodValidator } from '@/lib/zod-validator'
import { listPurchaseOrdersQueryParamsSchema } from '@codedm/client-typescript/typescript'

import { Button } from '@/components/ui/button'
import { useDialogStore } from '@/stores/useDialogStore'

import { PurchaseOrderSection } from './-components/PurchaseOrderSection'
import { CreatePurchaseOrderDialog } from './-components/CreatePurchaseOrderDialog'

export const Route = createFileRoute('/(app)/procurement/purchase-orders/')({
	staticData: { breadcrumb: 'Ordens de Compra' },
	validateSearch: zodValidator(listPurchaseOrdersQueryParamsSchema),
	component: RouteComponent,
})

function RouteComponent() {
	const { t } = useTranslation()
	const { show } = useDialogStore()

	return (
		<div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8">
			<div className="flex items-center justify-between gap-4">
				<h1 className="text-2xl font-bold text-foreground">{t('purchaseOrders.pageTitle')}</h1>
				<Button onClick={() => show(<CreatePurchaseOrderDialog />)} aria-label={t('purchaseOrders.createButton')}>
					{t('purchaseOrders.createButton')}
				</Button>
			</div>

			<PurchaseOrderSection />
		</div>
	)
}
