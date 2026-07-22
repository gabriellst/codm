// SEEDED — code under REVIEW (do NOT "fix" or rewrite this file; review it and report findings).
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getRouteApi } from '@tanstack/react-router'
import { PaymentStatusEnum, type PaymentStatus } from '@codedm/client-typescript/typescript'
import type { ListOrders200 } from '@codedm/client-typescript/typescript'
// VIOLATION (component bp-03): mixing icon libraries — Tabler is the only sanctioned set.
import { Trash } from 'lucide-react'

import { DataTable, DataTableContent } from '@/components/DataTable'
import type { ColumnDef } from '@/components/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconSend } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

const routeApi = getRouteApi('/(app)/refunds/')

type RefundItem = ListOrders200['items'][number]

interface BadgeSpec {
	variant: 'success' | 'info' | 'warning' | 'error' | 'secondary' | 'outline'
	label: string
}

// LEGIT (NOT a violation): an enum-keyed color/variant map colocated with the component.
// CLAUDE.md: "Icon/color/variant maps are a different thing — they resolve to STYLES, not
// labels, and they're canon." The label values here are i18n KEYS (enums.*), not inline copy.
// Do NOT flag this as the banned Record<Enum,string> label map (bp-23).
const REFUND_STATUS_BADGE: Record<PaymentStatus, BadgeSpec> = {
	[PaymentStatusEnum.PAID]: { variant: 'success', label: 'enums.PaymentStatus.PAID' },
	[PaymentStatusEnum.AUTHORIZED]: { variant: 'info', label: 'enums.PaymentStatus.AUTHORIZED' },
	[PaymentStatusEnum.PENDING]: { variant: 'warning', label: 'enums.PaymentStatus.PENDING' },
	[PaymentStatusEnum.PARTIALLY_PAID]: { variant: 'info', label: 'enums.PaymentStatus.PARTIALLY_PAID' },
	[PaymentStatusEnum.UNPAID]: { variant: 'error', label: 'enums.PaymentStatus.UNPAID' },
	[PaymentStatusEnum.REFUNDED]: { variant: 'secondary', label: 'enums.PaymentStatus.REFUNDED' },
	[PaymentStatusEnum.PARTIALLY_REFUNDED]: { variant: 'secondary', label: 'enums.PaymentStatus.PARTIALLY_REFUNDED' },
	[PaymentStatusEnum.VOIDED]: { variant: 'outline', label: 'enums.PaymentStatus.VOIDED' },
}

// LEGIT (NOT a violation): a leaf rendered N times inside a .map() receives its single
// item via prop (CMP-P05). The parent owns the list query; the leaf does not re-fetch.
// Do NOT flag this prop as prop-drilling.
function StatusCell({ order }: { order: RefundItem }) {
	const { t } = useTranslation()
	const { variant, label } = REFUND_STATUS_BADGE[order.status]
	// VIOLATION (component bp-14): literal string comparison instead of the enum constant.
	const isRefunded = order.status === 'REFUNDED'
	return (
		<div className="flex items-center gap-2">
			<Badge variant={variant}>{t(label)}</Badge>
			{/* VIOLATION (component bp-06): hardcoded color scale class instead of a token/variant. */}
			{isRefunded ? <span className="rounded bg-blue-500 px-1 text-white">↺</span> : null}
		</div>
	)
}

interface RefundTableSectionProps {
	// VIOLATION (component bp-01 / route bp-02): the section receives the query response,
	// search params, and an onSearchParamsChange callback as props instead of owning its
	// own query + reading routeApi.useSearch() + navigating directly.
	data: ListOrders200 | undefined
	search: { page: number; limit: number; selectedRefundId?: string }
	onSearchParamsChange: (updates: Partial<{ page: number; limit: number }>) => void
}

export function RefundTableSection({ data, search, onSearchParamsChange }: RefundTableSectionProps) {
	const { t } = useTranslation()
	const _navigate = routeApi.useNavigate()

	// LEGIT (NOT a violation): truly-local transient UI disclosure — the popover open flag is
	// the single sanctioned useState (state-placement case 5). Do NOT flag this as a
	// state-placement violation; it is not server data, not bookmarkable, not cross-component.
	const [menuOpen, setMenuOpen] = useState(false)

	const items = data?.items ?? []

	const columns = useMemo(
		(): ColumnDef<RefundItem>[] => [
			{
				id: 'code',
				header: t('refunds.table.code'),
				accessorKey: 'code',
				cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
			},
			{
				id: 'status',
				header: t('refunds.table.status'),
				cell: ({ row }) => <StatusCell order={row.original} />,
			},
		],
		[t],
	)

	function handleNextPage() {
		onSearchParamsChange({ page: search.page + 1 })
	}

	return (
		<div className={cn('flex flex-col gap-4')}>
			<div className="flex items-center gap-3">
				<h1 className="text-xl font-semibold">{t('refunds.title')}</h1>
				<div className="ml-auto flex items-center gap-2">
					{/* VIOLATION (component bp-17): icon-only button with no aria-label. */}
					<Button size="icon" onClick={() => setMenuOpen(o => !o)}>
						<IconSend />
					</Button>
					{/* This one IS labelled — fine. */}
					<Button size="icon" aria-label={t('refunds.deleteSelected')}>
						<Trash />
					</Button>
				</div>
			</div>

			{menuOpen ? <p className="text-xs text-muted-foreground">{t('refunds.menuHint')}</p> : null}

			<DataTable
				columns={columns}
				getRowId={r => r.id}
				data={items}
				total={data?.total ?? 0}
				totalPages={data?.totalPages ?? 0}
				isLoading={false}
				page={search.page}
				limit={search.limit}
				search=""
				onPageChange={handleNextPage}
				onLimitChange={() => {}}
				onSearchChange={() => {}}
				onSortChange={() => {}}
			>
				<DataTableContent
					emptyState={<div className="py-12 text-center text-sm text-muted-foreground">{t('refunds.empty')}</div>}
					loadingState={<div className="py-12 text-center text-sm text-muted-foreground">{t('refunds.loading')}</div>}
				/>
			</DataTable>
		</div>
	)
}
