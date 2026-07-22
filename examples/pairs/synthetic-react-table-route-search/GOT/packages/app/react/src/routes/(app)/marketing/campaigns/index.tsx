// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-react-table-route-search
// task:        synthetic-react-table-route-search
// stamp:       agent-wave1-38ff876
// docTreeHash: 213519a54e23
// model:       sonnet
// graded:      2026-07-22T00:18:07.921Z
// source:      packages/app/react/src/routes/(app)/marketing/campaigns/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'

import { listProductAdCampaignsQueryParamsSchema, type ListProductAdCampaignsQueryResponse } from '@template/client-typescript/typescript'
import { zodValidator } from '@/lib/zod-validator'
import { RouteError } from '@/components/RouteError'
import { CampaignTableSection } from './-components/CampaignTableSection'

export type CampaignItem = ListProductAdCampaignsQueryResponse['items'][number]

export const CampaignSortOrderEnum = {
	ASC: 'ASC',
	DESC: 'DESC',
} as const

export type CampaignSortOrder = (typeof CampaignSortOrderEnum)[keyof typeof CampaignSortOrderEnum]

const campaignsSearchSchema = listProductAdCampaignsQueryParamsSchema.and(
	z.object({
		sortBy: z.string().optional().default('name'),
		sortOrder: z.enum(CampaignSortOrderEnum).optional().default(CampaignSortOrderEnum.DESC),
	}),
)

export type CampaignsSearchParams = z.infer<typeof campaignsSearchSchema>

export const Route = createFileRoute('/(app)/marketing/campaigns/')({
	staticData: { breadcrumb: 'Campanhas de Anúncios' },
	validateSearch: zodValidator(campaignsSearchSchema),
	errorComponent: RouteError,
	component: RouteComponent,
})

function RouteComponent() {
	const { t } = useTranslation()

	return (
		<div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8 flex flex-col gap-6">
			<header className="flex flex-col gap-1">
				<h1 className="text-2xl font-bold text-foreground">{t('marketing.campaigns.title')}</h1>
				<p className="text-sm text-muted-foreground">{t('marketing.campaigns.subtitle')}</p>
			</header>

			<CampaignTableSection />
		</div>
	)
}
