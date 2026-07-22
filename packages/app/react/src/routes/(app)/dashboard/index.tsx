import { createFileRoute } from '@tanstack/react-router'
import { HomeSection } from './-components/HomeSection'

export const Route = createFileRoute('/(app)/dashboard/')({
	component: RouteComponent,
})

function RouteComponent() {
	return <HomeSection />
}
