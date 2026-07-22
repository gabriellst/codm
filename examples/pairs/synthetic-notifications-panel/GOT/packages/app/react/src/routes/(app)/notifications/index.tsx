// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-notifications-panel
// task:        synthetic-notifications-panel
// stamp:       agent-wave1-38ff876
// docTreeHash: b5bf4e130a09
// model:       sonnet
// graded:      2026-07-21T20:40:41.055Z
// source:      packages/app/react/src/routes/(app)/notifications/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { RouteError } from '@/components/RouteError'
import {
	listNotificationsQueryOptions,
	listNotificationsQueryParamsSchema,
	NotificationCategoryEnum,
	type ListNotificationsQueryResponse,
} from '@codedm/client-typescript/typescript'
import { zodValidator } from '@/lib/zod-validator'
import { useTranslation } from 'react-i18next'
import i18n from '@/lib/i18n'
import { NotificationFilterBar } from './-components/NotificationFilterBar'
import { NotificationListSection } from './-components/NotificationListSection'

export type NotificationItem = ListNotificationsQueryResponse['items'][number]

const notificationsSearchSchema = listNotificationsQueryParamsSchema.and(
	z.object({
		category: z.enum(NotificationCategoryEnum).optional(),
	}),
)

export type NotificationsSearchParams = z.infer<typeof notificationsSearchSchema>

export const Route = createFileRoute('/(app)/notifications/')({
	staticData: { breadcrumb: i18n.t('nav.notifications') },
	validateSearch: zodValidator(notificationsSearchSchema),
	// listNotificationsQueryOptions has no `category` param (backend doesn't filter by it —
	// NotificationListSection filters client-side), so deps mirror only the supported fields.
	loaderDeps: ({ search }) => ({ page: search.page, limit: search.limit, unreadOnly: search.unreadOnly }),
	loader: async ({ context, deps }) => {
		await context.queryClient.ensureQueryData(listNotificationsQueryOptions(deps)).catch(() => null)
	},
	errorComponent: RouteError,
	component: RouteComponent,
})

function RouteComponent() {
	const { t } = useTranslation()

	return (
		<div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8 flex flex-col gap-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-foreground">{t('notificationsPage.title')}</h1>
					<p className="text-sm text-muted-foreground">{t('notificationsPage.subtitle')}</p>
				</div>
			</header>
			<NotificationFilterBar />
			<NotificationListSection />
		</div>
	)
}
