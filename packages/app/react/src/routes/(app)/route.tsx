import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Sidebar } from '@/components/Navbar'
import { AgentsRunningPill } from '@/components/console/AgentsRunningPill'
import { SupervisionBanner } from '@/components/console/SupervisionBanner'
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
		// `h-full`, not `h-dvh`: the integrated title bar (AppChrome) is mounted in `__root.tsx` — it
		// belongs to the WINDOW, not to the authenticated console — and has already taken its band out
		// of the viewport. Sizing against the viewport here would push the console past the window's
		// bottom edge by the height of the bar.
		<div className="flex h-full flex-col overflow-hidden bg-route-background text-foreground">
			{/* Runtime supervision, above everything and outside the scroll: a dead gateway means the
			    channel is deaf, and the operator has to see that from any screen. Renders null while
			    the fleet is healthy. */}
			<SupervisionBanner />
			<div className="flex min-h-0 flex-1">
				<Sidebar />
				<main className="relative flex flex-1 flex-col overflow-hidden">
					{/* Persistent operating pulse, pinned above the scrolling content. */}
					<div className="pointer-events-none absolute right-10 top-4 z-20">
						<div className="pointer-events-auto">
							<AgentsRunningPill />
						</div>
					</div>
					<div className="flex-1 overflow-auto">
						<Outlet />
					</div>
				</main>
			</div>
			<Dialog open={open} onOpenChange={isOpen => !isOpen && hide()}>
				{content}
			</Dialog>
			{drawerContent}
		</div>
	)
}
