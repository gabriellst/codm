import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@/lib/zod-validator'
import { z } from 'zod'
import { purchaseOrderStatusSchema } from '@codedm/client-typescript/typescript'

import { PurchaseOrderListSection } from './-components/PurchaseOrderListSection'

export const purchaseOrdersSearchSchema = z.object({
	page: z.coerce.number<number>().int().min(1).default(1),
	limit: z.coerce.number<number>().int().min(1).max(100).default(20),
	search: z.string().default(''),
	status: purchaseOrderStatusSchema.optional(),
})

export type PurchaseOrdersSearch = z.infer<typeof purchaseOrdersSearchSchema>

export const Route = createFileRoute('/(app)/procurement/purchase-orders/')({
	validateSearch: zodValidator(purchaseOrdersSearchSchema),
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8">
			<PurchaseOrderListSection />
		</div>
	)
}
