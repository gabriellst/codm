import { createFileRoute, Outlet, useMatches } from '@tanstack/react-router'
import { Sidebar } from '@/components/Navbar'
import { Header } from '@/components/Header'
import { cn } from '@/lib/utils'
import { Dialog } from '@/components/ui/dialog'
import { useDialogStore } from '@/stores/useDialogStore'
import { useDrawerStore } from '@/stores/useDrawerStore'
import { useServerEventSource } from '@/hooks'

export const Route = createFileRoute('/(app)')({
	component: AuthLayout,
})

function AuthLayout() {
	// One SSE connection for the whole authenticated app — children subscribe via useServerEvents.
	useServerEventSource()
	const matches = useMatches()
	const routeWrapperClassName = [...matches].reverse().find(m => m.staticData?.wrapperClassName)?.staticData.wrapperClassName
	const { content, open, hide } = useDialogStore()
	// Drawers (Sheets) own their own <Sheet> + read open/hide from the drawer store, so just mount content.
	const drawerContent = useDrawerStore(s => s.content)

	return (
		<div className="dark flex h-dvh overflow-hidden bg-route-background">
			<Sidebar />
			<main className="flex-1 overflow-hidden relative flex flex-col">
				<Header />
				<div className="flex-1 overflow-auto">
					<div className={cn(routeWrapperClassName ?? 'mx-auto max-w-[100rem] w-full')}>
						<Outlet />
					</div>
				</div>
			</main>
			<Dialog open={open} onOpenChange={isOpen => !isOpen && hide()}>
				{content}
			</Dialog>
			{drawerContent}
		</div>
	)
}
