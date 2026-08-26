import { createFileRoute } from '@tanstack/react-router'
import { IssueDetailSection } from '../../-components/IssueDetailSection'

export const Route = createFileRoute('/(app)/threads/$threadId/issues/$issueId/')({
	component: RouteComponent,
})

function RouteComponent() {
	const { threadId, issueId } = Route.useParams()
	return <IssueDetailSection threadId={threadId} issueId={issueId} />
}
