import { createFileRoute } from '@tanstack/react-router'
import { SessionChatSection } from './-components/SessionChatSection'

export const Route = createFileRoute('/(app)/threads/$threadId/')({
	component: RouteComponent,
})

function RouteComponent() {
	const { threadId } = Route.useParams()
	return <SessionChatSection threadId={threadId} />
}
