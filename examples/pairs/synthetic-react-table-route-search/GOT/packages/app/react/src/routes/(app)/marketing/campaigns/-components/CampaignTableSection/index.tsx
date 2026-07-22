// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-react-table-route-search
// task:        synthetic-react-table-route-search
// stamp:       agent-wave1-38ff876
// docTreeHash: 213519a54e23
// model:       sonnet
// graded:      2026-07-22T00:18:07.921Z
// source:      packages/app/react/src/routes/(app)/marketing/campaigns/-components/CampaignTableSection/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { useMemo, type ComponentProps } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { VariantProps } from 'class-variance-authority'
import { IconDatabaseOff } from '@tabler/icons-react'

import {
	useListProductAdCampaigns,
	MarketingPlatformEnum,
	CampaignStatusEnum,
	type CampaignStatus,
	type MarketingPlatform,
} from '@codedm/client-typescript/typescript'
import { useLocale, useMoney } from '@/hooks'
import { DataTable, DataTableContent, DataTableSearch, DataTablePagination, type ColumnDef } from '@/components/DataTable'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { useCampaignSelectionStore } from '../../-stores/useCampaignSelectionStore'
import { CampaignSortOrderEnum, type CampaignItem } from '../..'

const routeApi = getRouteApi('/(app)/marketing/campaigns/')

type BadgeVariant = VariantProps<typeof badgeVariants>['variant']

const CAMPAIGN_STATUS_VARIANT: Record<CampaignStatus, BadgeVariant> = {
	[CampaignStatusEnum.ACTIVE]: 'success',
	[CampaignStatusEnum.PAUSED]: 'warning',
	[CampaignStatusEnum.ARCHIVED]: 'secondary',
}

const PLATFORM_FILTER_ALL = 'ALL' as const
const PLATFORMS = Object.values(MarketingPlatformEnum)

export function CampaignTableSection({ className, ...props }: ComponentProps<'div'>) {
	const { t } = useTranslation()
	const locale = useLocale()
	const formatMoney = useMoney()
	const search = routeApi.useSearch()
	const navigate = routeApi.useNavigate()

	const selectedIds = useCampaignSelectionStore(s => s.selectedIds)
	const selectAll = useCampaignSelectionStore(s => s.selectAll)
	const clearSelection = useCampaignSelectionStore(s => s.clearSelection)

	const { data, isPending, isError } = useListProductAdCampaigns({
		page: search.page,
		limit: search.limit,
		search: search.search,
		platform: search.platform,
	})

	const columns: ColumnDef<CampaignItem>[] = useMemo(
		() => [
			{
				id: 'name',
				accessorKey: 'name',
				header: t('marketing.campaigns.columns.name'),
				meta: { sortKey: 'name' },
			},
			{
				id: 'platform',
				accessorKey: 'platform',
				header: t('marketing.campaigns.columns.platform'),
				cell: ({ getValue }) => t(`enums.MarketingPlatform.${getValue<MarketingPlatform>()}`),
			},
			{
				id: 'status',
				accessorKey: 'status',
				header: t('marketing.campaigns.columns.status'),
				cell: ({ getValue }) => {
					const status = getValue<CampaignStatus>()
					return (
						<Badge variant={CAMPAIGN_STATUS_VARIANT[status]}>{t(`enums.CampaignStatus.${status}`)}</Badge>
					)
				},
			},
			{
				id: 'spend',
				accessorKey: 'spend',
				header: t('marketing.campaigns.columns.spend'),
				meta: { align: 'right', sortKey: 'spend' },
				cell: ({ row }) => formatMoney(row.original.spend),
			},
			{
				id: 'createdAt',
				accessorKey: 'createdAt',
				header: t('marketing.campaigns.columns.createdAt'),
				cell: ({ getValue }) => new Date(getValue<string>()).toLocaleDateString(locale),
			},
		],
		[t, locale, formatMoney],
	)

	return (
		<div className={cn('flex flex-col gap-4', className)} {...props}>
			{selectedIds.length > 0 && (
				<div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/40 px-4 py-2">
					<span className="text-sm text-muted-foreground">{t('marketing.campaigns.selection.selectedCount', { count: selectedIds.length })}</span>
					<Button variant="outline" size="sm" onClick={clearSelection}>
						{t('marketing.campaigns.selection.clearSelection')}
					</Button>
				</div>
			)}

			{isError ? (
				<p className="text-sm text-muted-foreground">{t('marketing.campaigns.loadError')}</p>
			) : (
				<DataTable<CampaignItem>
					columns={columns}
					getRowId={row => row.id}
					data={data?.items ?? []}
					total={data?.total ?? 0}
					totalPages={data?.totalPages ?? 1}
					isLoading={isPending}
					page={search.page}
					limit={search.limit}
					search={search.search ?? ''}
					sortBy={search.sortBy}
					sortOrder={search.sortOrder}
					selectedIds={selectedIds}
					onSelectionChange={selectAll}
					onPageChange={page => navigate({ search: prev => ({ ...prev, page }) })}
					onLimitChange={limit => navigate({ search: prev => ({ ...prev, limit, page: 1 }) })}
					onSearchChange={value => navigate({ search: prev => ({ ...prev, search: value || undefined, page: 1 }) })}
					onSortChange={key =>
						navigate({
							search: prev => ({
								...prev,
								sortBy: key,
								sortOrder: prev.sortOrder === CampaignSortOrderEnum.ASC ? CampaignSortOrderEnum.DESC : CampaignSortOrderEnum.ASC,
							}),
						})
					}
				>
					<DataTableContent
						emptyState={
							<Empty className="py-12">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<IconDatabaseOff />
									</EmptyMedia>
									<EmptyTitle>{t('marketing.campaigns.empty.title')}</EmptyTitle>
									<EmptyDescription>{t('marketing.campaigns.empty.description')}</EmptyDescription>
								</EmptyHeader>
							</Empty>
						}
					>
						<div className="flex items-center gap-3 p-4">
							<DataTableSearch placeholder={t('marketing.campaigns.toolbar.searchPlaceholder')} className="max-w-xs" />

							<Select
								value={search.platform ?? PLATFORM_FILTER_ALL}
								onValueChange={value =>
									navigate({
										search: prev => ({
											...prev,
											platform: value == null || value === PLATFORM_FILTER_ALL ? undefined : value,
											page: 1,
										}),
									})
								}
							>
								<SelectTrigger aria-label={t('marketing.campaigns.toolbar.platformFilterAriaLabel')} className="w-48">
									<SelectValue>
										{search.platform ? t(`enums.MarketingPlatform.${search.platform}`) : t('marketing.campaigns.toolbar.allPlatforms')}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={PLATFORM_FILTER_ALL}>{t('marketing.campaigns.toolbar.allPlatforms')}</SelectItem>
									{PLATFORMS.map(platform => (
										<SelectItem key={platform} value={platform}>
											{t(`enums.MarketingPlatform.${platform}`)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</DataTableContent>

					<DataTablePagination />
				</DataTable>
			)}
		</div>
	)
}
