import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SessionHeader } from './-components/SessionHeader'

export const Route = createFileRoute('/(app)/threads/$threadId')({
	component: SessionLayout,
})

function SessionLayout() {
	const { threadId } = Route.useParams()
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col px-6 pb-8 pt-20">
			<SessionHeader threadId={threadId} />
			<Outlet />
		</div>
	)
}
