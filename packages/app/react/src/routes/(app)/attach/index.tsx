import { createFileRoute } from '@tanstack/react-router'
import { RouteError } from '@/components/RouteError'
import { AttachThreadWizard } from './-components/AttachThreadWizard'

// C2 (founder, 11/08) — attach LIVES INSIDE `(app)` now: same `/attach` URL (the group is
// pathless), but the screen inherits the console shell — rail, SupervisionBanner, pills,
// the SSE mount. `OnboardingGate` only redirects while `completedAt` is absent, and skipping
// fills it, so the setup-checklist path still reaches this route. The onboarding wizard keeps
// rendering the CONTACT/AGENTS/REVIEW step components WITHOUT this shell — step components
// must never assume the chrome exists.
export const Route = createFileRoute('/(app)/attach/')({
	component: AttachThreadWizard,
	errorComponent: RouteError,
})
