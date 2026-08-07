import { createFileRoute } from '@tanstack/react-router'
import i18n from '@/lib/i18n'
import { RouteError } from '@/components/RouteError'
import { LoginSection } from './-components/LoginSection'

/**
 * `/login` — reached two ways: a direct visit, or `CloudSessionGate` (`components/console/`,
 * wraps `(app)`'s Outlet) redirecting here when the keychain has no device token (SP2 spec
 * Decision 5, AC-3). Full-bleed on purpose — no sidebar, no chrome beyond the window title bar
 * every route gets from `__root.tsx` — this IS the "tela cheia" the login gate promises.
 */
export const Route = createFileRoute('/login/')({
	staticData: { breadcrumb: i18n.t('nav.login') },
	errorComponent: RouteError,
	component: RouteComponent,
})

function RouteComponent() {
	return (
		<main className="flex h-full flex-col">
			<LoginSection className="flex-1" />
		</main>
	)
}
