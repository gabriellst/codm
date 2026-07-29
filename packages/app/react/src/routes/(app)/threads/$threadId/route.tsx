import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SessionHeader } from './-components/SessionHeader'
import { useThreadRealtime } from './-hooks/useThreadRealtime'

export const Route = createFileRoute('/(app)/threads/$threadId')({
	component: SessionLayout,
})

function SessionLayout() {
	const { threadId } = Route.useParams()
	// One subscription for the whole conversation: chat, issues and artifacts are tabs of ONE thread,
	// and a tab that is not currently mounted must still be fresh when the operator switches to it.
	useThreadRealtime(threadId)
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col px-6 pb-8 pt-20">
			<SessionHeader threadId={threadId} />
			<Outlet />
		</div>
	)
}
