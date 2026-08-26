import { createFileRoute } from '@tanstack/react-router'
import { ChannelsSection } from './-components/ChannelsSection'

export const Route = createFileRoute('/(app)/channels/')({
	component: RouteComponent,
})

function RouteComponent() {
	return <ChannelsSection />
}
