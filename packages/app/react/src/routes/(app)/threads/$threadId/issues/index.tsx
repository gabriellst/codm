import { createFileRoute } from '@tanstack/react-router'
import { SessionIssuesSection } from '../-components/SessionIssuesSection'

/** The conversation's kanban — `done` shows the finished column (shareable, so it lives in the URL). */
interface SessionIssuesSearch {
	done: boolean
}

export const Route = createFileRoute('/(app)/threads/$threadId/issues/')({
	// Same reading as the cross-thread board's `archived`: anything but a literal `true` is the default.
	validateSearch: (search: Record<string, unknown>): SessionIssuesSearch => ({ done: search.done === true }),
	component: RouteComponent,
})

function RouteComponent() {
	const { threadId } = Route.useParams()
	return <SessionIssuesSection threadId={threadId} />
}
