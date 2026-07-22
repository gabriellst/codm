import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
	ssr: true,
	beforeLoad: () => {
		throw redirect({ to: '/dashboard' })
	},
})
