import { createFileRoute } from '@tanstack/react-router'
import { SettingsSection } from './-components/SettingsSection'
import { McpServersSection } from './-components/McpServersSection'

export const Route = createFileRoute('/(app)/settings/')({
	component: RouteComponent,
})

/**
 * T12 mounts `McpServersSection` here rather than inside `SettingsSection` itself — the exclusive
 * write-scope for this Task does not include `SettingsSection/index.tsx`. Same horizontal rhythm
 * (`mx-auto`/`w-full`/`px-6`) as that component's own wrapper, no repeated `pt-20` (the page's top
 * offset already comes from `SettingsSection`'s own `PageHeader` block above it).
 */
function RouteComponent() {
	return (
		<>
			<SettingsSection />
			<div className="mx-auto w-full px-6 pb-16">
				<McpServersSection />
			</div>
		</>
	)
}
