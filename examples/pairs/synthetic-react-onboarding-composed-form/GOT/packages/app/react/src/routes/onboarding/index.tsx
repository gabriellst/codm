// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-react-onboarding-composed-form
// task:        synthetic-react-onboarding-composed-form
// stamp:       agent-wave1-38ff876
// docTreeHash: 213519a54e23
// model:       sonnet
// graded:      2026-07-21T23:05:55.662Z
// source:      packages/app/react/src/routes/onboarding/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/RouteError'
import i18n from '@/lib/i18n'
import { ConnectWizard } from './-components/ConnectWizard'

export const Route = createFileRoute('/onboarding/')({
	staticData: { breadcrumb: i18n.t('onboarding.breadcrumb') },
	errorComponent: RouteError,
	component: RouteComponent,
})

function RouteComponent() {
	// Thin shell — URL contract + layout only. The wizard orchestrates its own steps,
	// form and mutation inside ConnectWizard (a Section under -components/).
	return <ConnectWizard />
}
