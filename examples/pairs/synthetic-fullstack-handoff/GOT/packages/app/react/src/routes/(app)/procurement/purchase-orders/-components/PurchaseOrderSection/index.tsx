import { useMemo } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
	useListPurchaseOrders,
	listPurchaseOrdersQueryKey,
	useCancelPurchaseOrder,
	PurchaseOrderStatusEnum,
	type PurchaseOrderStatus,
	type ListPurchaseOrdersQueryResponse,
} from '@template/client-typescript/typescript'

import { DataTable, DataTableContent, DataTableSearch, DataTablePagination, type ColumnDef } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMoney, useServerEvents } from '@/hooks'
import { useDialogStore } from '@/stores/useDialogStore'
import { cn } from '@/lib/utils'

type PurchaseOrderItem = ListPurchaseOrdersQueryResponse['items'][number]

const routeApi = getRouteApi('/(app)/procurement/purchase-orders/')

type BadgeVariant = 'secondary' | 'default' | 'destructive'

const STATUS_BADGE_VARIANT: Record<PurchaseOrderStatus, BadgeVariant> = {
	[PurchaseOrderStatusEnum.DRAFT]: 'secondary',
	[PurchaseOrderStatusEnum.PLACED]: 'default',
	[PurchaseOrderStatusEnum.CANCELLED]: 'destructive',
}

export function PurchaseOrderSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const navigate = routeApi.useNavigate()
	const queryClient = useQueryClient()
	const formatMoney = useMoney()
	const { confirm } = useDialogStore()

	const { page, limit, search, status } = routeApi.useSearch()

	const { data } = useListPurchaseOrders({ page, limit, search, status })

	useServerEvents('integration.shared.purchase_order.recorded', () => {
		queryClient.invalidateQueries({ queryKey: listPurchaseOrdersQueryKey() })
	})

	const cancelPurchaseOrder = useCancelPurchaseOrder({
		mutation: {
			onSuccess: () => {
				toast.success(t('purchaseOrders.cancelSuccess'))
				queryClient.invalidateQueries({ queryKey: listPurchaseOrdersQueryKey() })
			},
		},
	})

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
					<Badge variant={STATUS_BADGE_VARIANT[row.original.status]}>
						{t(`enums.PurchaseOrderStatus.${row.original.status}`)}
					</Badge>
				),
				meta: { width: '120px' },
			},
			{
				id: 'totalAmount',
				header: t('purchaseOrders.table.totalAmount'),
				accessorKey: 'totalAmountCents',
				cell: ({ row }) =>
					formatMoney({ amountCents: row.original.totalAmountCents, currency: row.original.totalAmountCurrency }),
				meta: { align: 'right', width: '140px' },
			},
			{
				id: 'createdAt',
				header: t('purchaseOrders.table.createdAt'),
				accessorKey: 'createdAt',
				cell: ({ row }) => (
					<span className="text-sm text-muted-foreground">{format(new Date(row.original.createdAt), 'dd/MM/yyyy')}</span>
				),
				meta: { width: '120px' },
			},
			{
				id: 'actions',
				header: '',
				cell: ({ row }) => {
					const isCancellable = row.original.status !== PurchaseOrderStatusEnum.CANCELLED
					return (
						<div className="flex items-center justify-end gap-1">
							{isCancellable && (
								<Button
									variant="ghost"
									size="sm"
									aria-label={t('purchaseOrders.table.cancelAriaLabel')}
									onClick={async () => {
										const confirmed = await confirm({
											title: t('purchaseOrders.cancelConfirm.title'),
											description: t('purchaseOrders.cancelConfirm.description'),
											actionLabel: t('purchaseOrders.cancelConfirm.action'),
											cancelLabel: t('purchaseOrders.cancelConfirm.cancel'),
											variant: 'destructive',
										})
										if (confirmed) {
											cancelPurchaseOrder.mutate({ purchaseOrderId: row.original.id })
										}
									}}
								>
									{t('purchaseOrders.table.cancelLabel')}
								</Button>
							)}
						</div>
					)
				},
				meta: { width: '100px' },
			},
		],
		[t, formatMoney, confirm, cancelPurchaseOrder],
	)

	const skeletonRows = Array.from({ length: limit }, (_, i) => i)

	return (
		<div className={cn('flex flex-col gap-6', className)} {...props}>
			{data === undefined ? (
				<div className="flex flex-col gap-2">
					{skeletonRows.map(i => (
						<Skeleton key={i} className="h-10 w-full rounded-md" />
					))}
				</div>
			) : (
				<DataTable
					columns={columns}
					getRowId={r => r.id}
					data={data.items}
					total={data.total}
					totalPages={data.totalPages}
					isLoading={false}
					page={page}
					limit={limit}
					search={search ?? ''}
					onPageChange={p => navigate({ search: prev => ({ ...prev, page: p }) })}
					onLimitChange={l => navigate({ search: prev => ({ ...prev, limit: l, page: 1 }) })}
					onSearchChange={s => navigate({ search: prev => ({ ...prev, search: s || undefined, page: 1 }) })}
				>
					<DataTableSearch placeholder={t('purchaseOrders.searchPlaceholder')} />
					<DataTableContent
						emptyState={
							<div className="py-10 text-center text-muted-foreground text-sm">{t('purchaseOrders.emptyState')}</div>
						}
					/>
					<DataTablePagination />
				</DataTable>
			)}
		</div>
	)
}
