import { useMemo } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
	useListPurchaseOrders,
	useCancelPurchaseOrder,
	listPurchaseOrdersQueryKey,
	PurchaseOrderStatusEnum,
	type ListPurchaseOrdersQueryResponse,
} from '@codedm/client-typescript/typescript'

import { DataTable, DataTableContent, DataTablePagination, DataTableSearch, type ColumnDef } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMoney, useServerEvents } from '@/hooks'
import { useDialogStore } from '@/stores/useDialogStore'
import { cn } from '@/lib/utils'

type PurchaseOrderItem = ListPurchaseOrdersQueryResponse['items'][number]

const routeApi = getRouteApi('/(app)/procurement/purchase-orders/')

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'destructive'> = {
	[PurchaseOrderStatusEnum.DRAFT]: 'default',
	[PurchaseOrderStatusEnum.PLACED]: 'success',
	[PurchaseOrderStatusEnum.CANCELLED]: 'destructive',
}

export function PurchaseOrderListSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const navigate = routeApi.useNavigate()
	const queryClient = useQueryClient()
	const formatMoney = useMoney()
	const { confirm } = useDialogStore()
	const { mutateAsync: cancelOrder } = useCancelPurchaseOrder()

	const { page, limit, search, status } = routeApi.useSearch()

	const { data, isPending } = useListPurchaseOrders({ page, limit, status })

	useServerEvents('integration.shared.purchase_order.recorded', () =>
		queryClient.invalidateQueries({ queryKey: listPurchaseOrdersQueryKey() }),
	)

	const items = data?.items ?? []
	const total = data?.total ?? 0
	const totalPages = data?.totalPages ?? 0

	async function handleCancelOrder(id: string) {
		const ok = await confirm({
			title: t('purchaseOrders.cancelConfirm.title'),
			description: t('purchaseOrders.cancelConfirm.description'),
			actionLabel: t('purchaseOrders.cancelConfirm.action'),
			variant: 'destructive',
		})
		if (ok) await cancelOrder({ id })
	}

	const columns = useMemo<ColumnDef<PurchaseOrderItem>[]>(
		() => [
			{
				id: 'supplierName',
				header: t('purchaseOrders.table.supplierName'),
				accessorKey: 'supplierName',
				cell: ({ row }) => <span className="font-medium text-foreground">{row.original.supplierName}</span>,
			},
			{
				id: 'status',
				header: t('purchaseOrders.table.status'),
				accessorKey: 'status',
				cell: ({ row }) => (
					<Badge variant={STATUS_VARIANT[row.original.status] ?? 'default'}>
						{t(`enums.PurchaseOrderStatus.${row.original.status}`)}
					</Badge>
				),
				meta: { width: '120px' },
			},
			{
				id: 'totalAmount',
				header: t('purchaseOrders.table.totalAmount'),
				accessorKey: 'totalAmountCents',
				cell: ({ row }) => formatMoney({ amountCents: row.original.totalAmountCents, currency: row.original.currency }),
				meta: { align: 'right', width: '140px' },
			},
			{
				id: 'actions',
				header: '',
				cell: ({ row }) =>
					row.original.status !== PurchaseOrderStatusEnum.CANCELLED ? (
						<Button
							variant="ghost"
							size="sm"
							className="text-destructive hover:text-destructive"
							onClick={() => handleCancelOrder(row.original.id)}
						>
							{t('purchaseOrders.cancelConfirm.action')}
						</Button>
					) : null,
				meta: { width: '100px', align: 'right' },
			},
		],
		[t, formatMoney],
	)

	const skeletonRows = Array.from({ length: limit }, (_, i) => i)

	return (
		<div className={cn('flex flex-col gap-6', className)} {...props}>
			<DataTable
				columns={columns}
				getRowId={r => r.id}
				data={items}
				total={total}
				totalPages={totalPages}
				isLoading={isPending}
				page={page}
				limit={limit}
				search={search}
				onPageChange={p => navigate({ search: prev => ({ ...prev, page: p }) })}
				onLimitChange={l => navigate({ search: prev => ({ ...prev, limit: l, page: 1 }) })}
				onSearchChange={s => navigate({ search: prev => ({ ...prev, search: s, page: 1 }) })}
			>
				<div className="flex flex-col gap-3">
					<DataTableSearch placeholder={t('purchaseOrders.searchPlaceholder')} />
					<DataTableContent
						emptyState={<div className="py-10 text-center text-muted-foreground text-sm">{t('purchaseOrders.emptyState')}</div>}
						loadingState={
							<div className="flex flex-col gap-2 p-2">
								{skeletonRows.map(i => (
									<Skeleton key={i} className="h-10 w-full rounded-md" />
								))}
							</div>
						}
					/>
					<DataTablePagination />
				</div>
			</DataTable>
		</div>
	)
}
