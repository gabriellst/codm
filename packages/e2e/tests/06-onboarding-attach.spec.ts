import { test, expect } from '../utils/test'
import { getOnboarding, completeOnboarding, getHomeDashboard, getAttachThreadWizard } from '@codm/client-typescript/typescript'
import { givenAttachedThread, authenticateCloudSession } from '../utils/given'

/**
 * ONBOARDING WIZARD — journey (currentStep/completedAt), the middleware gate it unlocks, the setup
 * flags it derives from the DB, and the one browser-level proof of the redirect it drives.
 *
 * ### Why the three cases below are ORDER-DEPENDENT (unlike most specs in this suite)
 * CODM is single-operator (founder decision 2): `OperatorMiddleware` stamps a CONSTANT `ownerId` on
 * every request (see `packages/e2e/utils/given/api.ts`), so `Onboarding` — keyed one row per
 * `ownerId` (spec Decision 6/AC-3) — collapses to ONE row for the whole suite, shared and mutated by
 * every spec that touches it. `completedAt` only ever moves null → set (`Onboarding.complete()` is
 * idempotent, never un-sets), so "the operator has not completed onboarding yet" can only be observed
 * ONCE per suite run — by whichever case runs first. That case has to be the FIRST test declared in
 * this file, and this file has to be the FIRST spec (numerically) that calls anything under
 * `/ui/onboarding` — grep confirms 03/04/05 never do. The order below is deliberate:
 *
 *   1. AC-1 (not completed yet — observes the shared null state, must run first)
 *   2. the browser case (still observes null — case 1 above only READ, never wrote — then completes
 *      it itself and proves the dashboard opens)
 *   3. AC-2 (completes it again — a no-op per `Onboarding.complete()`'s own idempotency contract —
 *      and asserts the postcondition the spec names: completedAt set, guarded read unlocked)
 *
 * This ordering is also PRODUCT-LOAD-BEARING, not just a test convenience: `06` sits right before the
 * browser-driving specs `09`–`11` precisely so onboarding is completed by the time they navigate the
 * console — `OnboardingGate` (spec Decision 14) would otherwise redirect them to `/onboarding` too.
 */

test('AC-1: a fresh operator has not completed onboarding, and the guarded read refuses', async ({ given }) => {
	const user = await given.freshUser({})
	const client = user.session.client

	const onboarding = await getOnboarding({ client })
	expect(onboarding.completedAt).toBeNull()

	// GetHomeDashboard declares `OnboardingMiddleware` (spec Decision 10) — every OTHER `/ui/onboarding*`
	// controller and every setup-step controller (connect channel, add workspace, attach thread)
	// deliberately does NOT, which is what keeps the wizard itself reachable before completion.
	await expect(getHomeDashboard({ client })).rejects.toMatchObject({ code: 'ONBOARDING_NOT_COMPLETED' })
})

/**
 * What this case deliberately does NOT try to prove: any `SystemPrecondition` step (Rust
 * `SystemPreconditionId` registry, the Full Disk Access repair flow, `tccutil`, the `focus`
 * re-probe). In a Playwright-driven Chromium page there is no Tauri host underneath —
 * `BrowserSystemPreconditionsService` (the web platform implementation behind the
 * `SystemPreconditionsService` port) reports ZERO pendencies BY DESIGN, so a browser spec can never
 * observe a `SystemPrecondition` step appear in the wizard or the dashboard's deferred-items panel.
 * That is a HOST fact, not a UI fact, and it is covered where the host lives:
 *   - the repair/probe/tccutil mechanics — Rust tests in `packages/app/tauri/src-tauri/src/
 *     system_preconditions/`
 *   - the console's REACTION to a probe result (a step appearing/disappearing on `focus`, the probe
 *     hook never navigating) — `packages/app/react/src/hooks/useSystemPreconditionProbe.test.tsx`
 *     and `packages/app/react/src/components/console/OnboardingGate.test.tsx` (the guard that reads
 *     the probe's store and decides whether to navigate — the probe hook itself never does, AC-18).
 * This spec also never launches the real Tauri desktop app or a real WhatsApp pairing — both are out
 * of reach for this suite by design (Chromium against the web build only).
 */
test('operator console redirects to /onboarding until completed, then opens the dashboard', async ({ given, goto, page }) => {
	const user = await given.freshUser({})
	const client = user.session.client

	// `(app)` nests `OnboardingGate` INSIDE `CloudSessionGate` (packages/app/react/src/routes/(app)/
	// route.tsx) — a real login is checked FIRST. This suite has no OAuth flow to drive, so
	// `authenticateCloudSession` seeds the same client-side secret a real login would leave behind
	// (see its own docstring), purely to get PAST that outer gate and exercise the onboarding one.
	await authenticateCloudSession(page)

	// Still the shared null state from the case above (nobody has completed it yet) — the console
	// guard (`OnboardingGate`) sends a not-yet-onboarded operator to `/onboarding` on ANY `(app)` route,
	// never rendering the console shell underneath (spec Decision 14, AC-1).
	await goto('/dashboard')
	await expect(page).toHaveURL(/\/onboarding/)
	await expect(page.getByRole('heading', { name: 'Converse com seu código' })).toBeVisible()

	// Complete via the SDK, not by clicking through the wizard: the setup steps pair a real channel by
	// QR code (`CHANNEL`) — not automatable without a real WhatsApp — and this case exists to prove the
	// GUARD's reaction to `completedAt`, not to re-drive the setup steps (those are unit-tested at
	// `packages/app/react/src/routes/onboarding/-components/steps.test.ts`).
	await completeOnboarding({ client })

	// A fresh navigation (not the same SPA session) re-fetches `GetOnboarding` and the guard now lets
	// the console through — `HomeSection` renders `HomeDashboard` (not `SetupChecklist`) because 04/05
	// already seeded a connected channel + workspace + attached thread for this same shared operator.
	await goto('/dashboard')
	await expect(page).toHaveURL(/\/dashboard/)
	await expect(page.getByRole('heading', { name: 'Início' })).toBeVisible()
})

test('AC-2: completing onboarding grants completedAt and unlocks the guarded read', async ({ given }) => {
	const user = await given.freshUser({})
	const client = user.session.client

	// Idempotent by the entity's own contract (`Onboarding.complete()`: "concluir de novo não remarca a
	// data") — the previous case already flipped `completedAt` through the browser. Calling it again
	// here still proves the endpoint's postcondition honestly: it does not require being the FIRST
	// caller, only that after calling it, both facts AC-2 names hold.
	await completeOnboarding({ client })

	const onboarding = await getOnboarding({ client })
	expect(onboarding.completedAt).not.toBeNull()

	const dashboard = await getHomeDashboard({ client })
	expect(typeof dashboard.agentsRunningNow).toBe('number')
})

// AC-3 ("O progresso é uma linha por ownerId; um segundo operador tem onboarding independente") is
// NOT coverable from this suite. `OperatorMiddleware` (packages/api/typescript/src/auth/middlewares/
// OperatorMiddleware.ts) stamps a HARDCODED `OPERATOR_ID` constant onto `ctx.ownerId` on every
// request, unconditionally — there is no cookie, header, or session lookup to vary it. `createOwner`
// mints a new `Owner` row but never becomes the resolved `ownerId` (see the no-op documented in
// `03-owner-create.spec.ts`), so two `given.freshUser()` calls — or two `createOwner()` calls — both
// resolve to the SAME `ownerId`, and therefore the same `Onboarding` row. Proving AC-3 would require
// either a second real operator identity (out of scope: this repo's whole product is single-operator
// today) or reaching into the DB directly (forbidden by this suite's own canon — SDK calls only, see
// `.claude/skills/e2e/SKILL.md` §"Why SDK Calls, Not Direct DB"). Row-per-`ownerId` independence is
// instead covered at the repository layer: `packages/api/typescript/src/ui/repositories/
// OnboardingRepository/DrizzleOnboardingRepository.test.ts`, which can construct two distinct
// `ownerId`s directly without going through the operator-collapsed HTTP surface.

/**
 * AC-9 — derived setup satisfaction (channel CONNECTED, workspace registered, thread attached), the
 * cross-context BFF read `GetOnboarding` absorbed from the extinct `GetSetupChecklist` (spec
 * Decision 9/AC-13). This is unrelated to `completedAt` — a setup flag can be true while the wizard
 * journey is still open, and vice versa — so it runs independently of the cases above.
 *
 * Single-operator shared DB: the flags are owner-global, so this asserts only the ORDER-INDEPENDENT
 * positive direction (all-done after completing the flow), never an "initially empty" state another
 * spec's seeding could have advanced.
 */
test('onboarding setup flags complete once channel + workspace + thread exist', async ({ given }) => {
	const user = await given.freshUser({})
	const client = user.session.client

	// The wizard read is reachable and enumerates providers before anything is attached.
	const wizardBefore = await getAttachThreadWizard({}, { client })
	expect(Array.isArray(wizardBefore.providers)).toBe(true)

	// Complete the flow the wizard performs (connected channel → workspace → attached thread).
	await givenAttachedThread(user.session)

	const onboarding = await getOnboarding({ client })
	expect(onboarding.channelDone).toBe(true)
	expect(onboarding.workspaceDone).toBe(true)
	expect(onboarding.threadDone).toBe(true)

	// The wizard now offers at least one CONNECTED channel to attach against.
	const wizardAfter = await getAttachThreadWizard({}, { client })
	expect(wizardAfter.channels.length).toBeGreaterThan(0)
})
