import { createFileRoute } from '@tanstack/react-router'
import { IssuesOverviewSection } from './-components/IssuesOverviewSection'
import { SystemHealthSection } from './-components/SystemHealthSection'

interface IssuesSearch {
	archived: boolean
}

export const Route = createFileRoute('/(app)/issues/')({
	validateSearch: (search: Record<string, unknown>): IssuesSearch => ({ archived: search.archived === true }),
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<div className="flex flex-col">
			{/* Fase 4, item 7 — the health strip on top of the board. */}
			<SystemHealthSection className="mx-6 mt-6" />
			<IssuesOverviewSection className="pt-8" />
		</div>
	)
}
