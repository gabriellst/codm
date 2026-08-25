import { createFileRoute } from '@tanstack/react-router'
import { SettingsSection } from './-components/SettingsSection'

export const Route = createFileRoute('/(app)/settings/')({
	component: RouteComponent,
})

function RouteComponent() {
	return <SettingsSection />
}
