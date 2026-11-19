import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/RouteError'
import i18n from '@/lib/i18n'
import { BatchDetailSection } from './-components/BatchDetailSection'

/** One BATCH of a conversation (fase 4, item 5) — the message that listed several requests, and where each one went. */
export const Route = createFileRoute('/(app)/threads/$threadId/batches/$batchCode/')({
	staticData: { breadcrumb: i18n.t('nav.batches') },
	errorComponent: RouteError,
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8 flex flex-col gap-6">
			<BatchDetailSection />
		</div>
	)
}
