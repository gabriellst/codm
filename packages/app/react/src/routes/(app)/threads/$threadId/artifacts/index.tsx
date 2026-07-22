import { createFileRoute } from '@tanstack/react-router'
import { ArtifactsSection } from '../-components/ArtifactsSection'

export const Route = createFileRoute('/(app)/threads/$threadId/artifacts/')({
	component: RouteComponent,
})

function RouteComponent() {
	const { threadId } = Route.useParams()
	return <ArtifactsSection threadId={threadId} />
}
