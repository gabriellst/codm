import { createFileRoute } from '@tanstack/react-router'
import { SessionIssuesSection } from '../-components/SessionIssuesSection'

export const Route = createFileRoute('/(app)/threads/$threadId/issues/')({
	component: RouteComponent,
})

function RouteComponent() {
	const { threadId } = Route.useParams()
	return <SessionIssuesSection threadId={threadId} />
}
