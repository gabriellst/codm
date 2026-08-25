import { createFileRoute, Outlet } from '@tanstack/react-router'
import { Sidebar } from '@/components/Navbar'
import { AgentsRunningPill } from '@/components/console/AgentsRunningPill'
import { CloudSessionGate } from '@/components/console/CloudSessionGate'
import { OnboardingGate } from '@/components/console/OnboardingGate'
import { SupervisionBanner } from '@/components/console/SupervisionBanner'
import { UpdateReadyPill } from '@/components/console/UpdateReadyPill'
import { Dialog } from '@codm/app-ui/dialog'
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
			<div className="relative flex min-h-0 flex-1">
				<Sidebar />
				<main className="relative flex flex-1 flex-col overflow-hidden">
					{/* Persistent operating pulse, pinned above the scrolling content. */}
					<div className="pointer-events-none absolute right-10 top-4 z-20">
						<div className="pointer-events-auto">
							<AgentsRunningPill />
						</div>
					</div>
					{/* `min-h-0` é load-bearing, não cosmético: sem ele o flex item herda `min-height: auto`
					    e não encolhe abaixo do conteúdo. O `h-full` das telas passa a resolver contra uma
					    altura indefinida, a cadeia de altura quebra, e o scroller interno do `VirtualList`
					    nunca recebe caixa limitada — quem rolava era ESTE container, a partir do topo, e o
					    chat abria na mensagem mais antiga apesar do mount ancorado no fim já existir e ter
					    teste. O irmão em `__root.tsx` já trazia o `min-h-0`; este ficou para trás. */}
					<div className="min-h-0 flex-1 overflow-auto overflow-x-hidden">
						{/* Sem login os agentes param; console pede conta (spec Decision 5, AC-3) — gates the
						    Outlet only, never the sidebar/chrome around it, so a logged-out console still
						    reads as "the app, asking for an account" rather than a blank shell. */}
						<CloudSessionGate>
							{/* Onboarding guard (spec Decision 14), nested one level further in — same "gates
							    the Outlet only" property, checked AFTER the cloud session so an operator who
							    isn't logged in sees /login first, not /onboarding. */}
							<OnboardingGate>
								<Outlet />
							</OnboardingGate>
						</CloudSessionGate>
					</div>
				</main>
				{/* Floating over the sidebar's bottom-left corner (Claude Desktop's own placement) —
				    outside `main` so it hovers above BOTH the thread list and the routed content, and
				    reads from every authenticated screen. Renders null until an update is pending. */}
				<div className="pointer-events-none absolute bottom-4 left-4 z-30">
					<div className="pointer-events-auto">
						<UpdateReadyPill />
					</div>
				</div>
			</div>
			<Dialog open={open} onOpenChange={isOpen => !isOpen && hide()}>
				{content}
			</Dialog>
			{drawerContent}
		</div>
	)
}
