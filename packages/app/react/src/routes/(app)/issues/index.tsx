import { createFileRoute } from '@tanstack/react-router'
import { IssuesOverviewSection } from './-components/IssuesOverviewSection'

interface IssuesSearch {
	archived: boolean
}

export const Route = createFileRoute('/(app)/issues/')({
	validateSearch: (search: Record<string, unknown>): IssuesSearch => ({ archived: search.archived === true }),
	component: RouteComponent,
})

function RouteComponent() {
	return <IssuesOverviewSection />
}
