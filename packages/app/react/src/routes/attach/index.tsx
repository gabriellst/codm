import { createFileRoute } from '@tanstack/react-router'
import { AttachThreadWizard } from './-components/AttachThreadWizard'

export const Route = createFileRoute('/attach/')({
	component: AttachThreadWizard,
})
