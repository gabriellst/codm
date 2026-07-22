import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(app)/dashboard/')({
	validateSearch: () => ({}),
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6 md:p-8">
			<div className="flex flex-col gap-2">
				<h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
				<p className="text-muted-foreground">Welcome to your dashboard overview.</p>
			</div>
		</div>
	)
}
