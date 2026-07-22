import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/RouteError'
import { z } from 'zod'
import i18n from '@/lib/i18n'
import { ResetPasswordForm, RequestPasswordResetForm, ResetPasswordSidebar } from './-components'

const resetPasswordSearchSchema = z.object({
	token: z.string().optional(),
})

export const Route = createFileRoute('/reset-password/')({
	ssr: true,
	staticData: { breadcrumb: i18n.t('auth.resetPassword.breadcrumb') },
	validateSearch: search => resetPasswordSearchSchema.parse(search),
	component: RouteComponent,
	errorComponent: RouteError,
})

function RouteComponent() {
	const { token } = Route.useSearch()

	return (
		<main className="w-full h-full flex min-h-screen">
			<section className="flex-1 flex flex-col items-center justify-center py-8 px-8 lg:px-16 xl:px-24 2xl:px-36 bg-background overflow-y-auto">
				<div className="w-full max-w-md">{token ? <ResetPasswordForm token={token} /> : <RequestPasswordResetForm />}</div>
			</section>
			<ResetPasswordSidebar className="w-full lg:w-13/24" />
		</main>
	)
}
