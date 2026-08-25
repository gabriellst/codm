import { createFileRoute } from '@tanstack/react-router'
import { WorkspacesSection } from './-components/WorkspacesSection'

export const Route = createFileRoute('/(app)/workspaces/')({
	component: RouteComponent,
})

function RouteComponent() {
	return <WorkspacesSection />
}
