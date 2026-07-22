import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/RouteError'
import { z } from 'zod'
import i18n from '@/lib/i18n'
import { SignUpForm, SignUpSidebar } from './-components'

const searchSchema = z.object({
	callback: z.string().optional(),
	email: z.email().optional(),
})

export const Route = createFileRoute('/sign-up/')({
	ssr: true,
	staticData: { breadcrumb: i18n.t('auth.signUp.breadcrumb') },
	validateSearch: search => searchSchema.parse(search ?? {}),
	component: RouteComponent,
	errorComponent: RouteError,
})

function RouteComponent() {
	const { callback, email } = Route.useSearch()

	return (
		<main className="w-full h-full flex min-h-screen">
			<section className="flex-1 flex flex-col items-center justify-center py-8 px-8 lg:px-16 xl:px-24 2xl:px-36 bg-background overflow-y-auto">
				<div className="w-full max-w-2xl">
					<SignUpForm callback={callback} email={email} />
				</div>
			</section>
			<SignUpSidebar className="w-full lg:w-13/24" />
		</main>
	)
}
