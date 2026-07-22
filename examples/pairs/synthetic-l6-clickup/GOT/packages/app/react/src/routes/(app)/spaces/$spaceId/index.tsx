import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { zodValidator } from '@/lib/zod-validator'

import { SpaceViewToggle } from './-components/ViewToggle'
import { SpaceTasksSection } from './-components/SpaceTasksSection'

export const spaceSearchSchema = z.object({ view: z.enum(['list', 'board']).default('list') })

export type SpaceSearch = z.infer<typeof spaceSearchSchema>

export const Route = createFileRoute('/(app)/spaces/$spaceId/')({
	validateSearch: zodValidator(spaceSearchSchema),
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
			<SpaceViewToggle />
			<SpaceTasksSection />
		</div>
	)
}
