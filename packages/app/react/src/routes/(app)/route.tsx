import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Sidebar } from '@/components/Navbar'
import { AgentsRunningPill } from '@/components/console/AgentsRunningPill'
import { Dialog } from '@/components/ui/dialog'
import { useDialogStore } from '@/stores/useDialogStore'
import { useDrawerStore } from '@/stores/useDrawerStore'
import { useServerEventSource } from '@/hooks'

export const Route = createFileRoute('/(app)')({
	component: AuthLayout,
})

function AuthLayout() {
	// One SSE connection for the whole authenticated console — children subscribe via useServerEvents.
	useServerEventSource()
	const { content, open, hide } = useDialogStore()
	const drawerContent = useDrawerStore(s => s.content)

	return (
		<div className="flex h-dvh overflow-hidden bg-route-background text-foreground">
			<Sidebar />
			<main className="relative flex flex-1 flex-col overflow-hidden">
				{/* Persistent operating pulse, pinned above the scrolling content. */}
				<div className="pointer-events-none absolute right-6 top-5 z-20">
					<div className="pointer-events-auto">
						<AgentsRunningPill />
					</div>
				</div>
				<div className="flex-1 overflow-auto">
					<Outlet />
				</div>
			</main>
			<Dialog open={open} onOpenChange={isOpen => !isOpen && hide()}>
				{content}
			</Dialog>
			{drawerContent}
		</div>
	)
}
