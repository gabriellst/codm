import { createFileRoute } from '@tanstack/react-router'

import { PageViewSection } from './-components/PageViewSection'
import { PageTreeNav } from './-components/PageTreeNav'

export const Route = createFileRoute('/(app)/workspaces/$workspaceId/pages/$pageId/')({
	staticData: { breadcrumbs: [{ label: 'Workspaces', to: '/workspaces' }, { label: 'Página' }] },
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<div className="flex flex-1 overflow-hidden">
			<PageTreeNav className="overflow-y-auto py-6 pl-6 md:pl-8" />
			<div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8">
				<PageViewSection />
			</div>
		</div>
	)
}
