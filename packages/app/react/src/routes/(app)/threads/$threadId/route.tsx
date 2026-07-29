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
		// No `pt-*` here: the sticky SessionHeader owns the top clearance, so the band it reserves is
		// the same scrolled or not, and `AgentsRunningPill` keeps floating in it rather than over it.
		<div className="mx-auto flex w-full flex-col px-6 gap-2">
			<SessionHeader threadId={threadId} />
			<Outlet />
		</div>
	)
}
