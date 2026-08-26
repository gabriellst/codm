import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '../utils/test'
import { givenFreshUser } from '../utils/given'
import { authenticateCloudSession } from '../utils/given/cloud'
import { createDemoCursor } from '../utils/cursor'
import { t } from '../utils/i18n'

// The roteiro's DATA, not app copy — `t()` doesn't apply (these never appear in `pt.json`). Named
// here so a change to the scripted scenario has exactly one place to follow in this spec.
/** `mock.ContactSeed{Name: "Ada Lovelace"}` — `packages/api/go/internal/channel/overlay.go`, `defaultE2eScenario()`. */
const ROTEIRO_CONTACT_NAME = 'Ada Lovelace'
/** `providerLabel[ProviderKind.CLAUDE_CODE]` (`components/console/glyphs.tsx`), DETECTED by the e2e
 *  column's `MockProviderDetector` (`packages/api/typescript/src/agent/services/ProviderDetector/MockProviderDetector.ts`). */
const ROTEIRO_PROVIDER_NAME = 'Claude Code'

/**
 * DEMO — the full onboarding wizard, clicked start to finish, recorded to video
 * (`PW_VIDEO=on`) with the animated cursor (`utils/cursor.ts`). This is a PROMOTIONAL artifact,
 * not a correctness gate: assertions below are LEVE (a heading/label visible per step) — just
 * enough that the recording only "passes" if the whole journey actually rendered.
 *
 * ### Why this is gated behind DEMO=on, and why that gate is not optional
 * `06-onboarding-attach.spec.ts` explains it at length: the single-operator collapse
 * (`OperatorMiddleware` stamps one constant `ownerId` on every request) makes `Onboarding` ONE
 * shared row for the whole suite, and `completedAt` only ever moves null → set. Once ANY
 * lower-numbered spec completes onboarding (06 does, on purpose, so 09-12 can reach the console),
 * every later spec's `getOnboarding` sees `completedAt` already set and `/dashboard` never
 * redirects to `/onboarding` again — the wizard becomes unobservable for the rest of that suite
 * run. Numbering this file `90-` keeps it out of the normal alpha-numeric run order in *intent*,
 * but numbering alone does not fix the shared-state problem — only running it in ISOLATION does.
 * So this test skips itself unless `DEMO=on` is set:
 *   - `DEMO=on PW_VIDEO=on bun scripts/run-e2e.ts tests/90-demo-onboarding.spec.ts` passes ONLY
 *     this file to Playwright. `scripts/run-e2e.ts` mints a brand-new scratch `CODM_DATA_DIR`
 *     per invocation (a fresh empty SQLite file) — this test is the ONLY caller that ever touches
 *     `/ui/onboarding` in that run, so it observes the honest "not completed yet" state.
 *   - A normal `bun scripts/run-e2e.ts` (no args) runs the WHOLE suite, 03 through 12, in one
 *     scratch dir — 06 completes onboarding early, so by the time 90 would run, the wizard is
 *     already gone. Skipping under the default (no `DEMO` env) is what keeps this file from
 *     failing the normal suite instead of just being redundant with it.
 *
 * ### The permission step (FULL_DISK_ACCESS) — never clicked, and never seamed either
 * The task asked to interact with whatever the browser renders honestly for the permission step,
 * or fall back to a seam and document it. Neither applies here, and it's worth being precise about
 * why: `FULL_DISK_ACCESS` is not merely disabled or gated behind a "continue anyway" affordance in
 * the browser build — it structurally never enters the wizard's step list at all.
 * `OnboardingFlow` composes `onboardingSteps(pending)` from `useSystemPreconditionsStore(state =>
 * state.pending)`, and that store's data comes from `BrowserSystemPreconditionsService.statuses()`
 * (`packages/app/react/src/services/SystemPreconditionsService/BrowserSystemPreconditionsService.ts`),
 * which returns `[]` UNCONDITIONALLY — by design (see that file's own docblock: "a browser tab has
 * none of these preconditions... reporting a pendency would show a web console a macOS Settings
 * screen it will never see"). With `pending` always `[]`, `onboardingSteps([])` never includes
 * `FULL_DISK_ACCESS` — the wizard goes straight from the 3 intro slides to the 5 setup steps to
 * `FINAL`. There is no card to click, no "skip" affordance to honestly click instead, and no
 * server-side seam that could inject one (this is client-side host detection, not database state)
 * — same conclusion `06-onboarding-attach.spec.ts` already documents for its own (non-demo) case.
 * The real thing (the repair button, the two-step "clear denial → open Settings" flow) is desktop
 * behavior, covered by Rust tests + `FullDiskAccessCard.test.tsx`/`useSystemPreconditionProbe.test.tsx`
 * — out of reach for a Chromium-only harness by construction.
 *
 * ### Map: clicked vs. seam, and why
 *   1. slides (VALUE/HOW/CONTROL)  → CLICKED ("Próximo")
 *   2. permission (FULL_DISK_ACCESS) → NEVER RENDERS in browser — no click, no seam (see above)
 *   3. channel (CHANNEL)           → CLICKED nothing to START (the embedded `ConnectChannelForm`
 *                                     auto-connects on mount, unlike the dialog-driven `/channels`
 *                                     flow in `12-channel-qr.spec.ts`) — the QR + auto-pairing
 *                                     (roteiro `defaultE2eScenario`, Go `overlay.go`, AutoPairAfter
 *                                     2s) are watched, then "Próximo" is CLICKED to advance
 *   4. workspace (WORKSPACE)       → CLICKED (the "+ Adicionar uma pasta" ROW reveals the manual
 *                                     path input — real temp folder, filled — then "Próximo" PATCHes
 *                                     it into the onboarding draft and advances, one click; 2026-08-24
 *                                     onboarding-attach-ux audit items 1+2, row refined the same day;
 *                                     2026-08-26 draft/atomic-commit rewrite swapped the POST for a
 *                                     PATCH — the real `Workspace` only materializes at step 6)
 *   5. contact/agents/review       → CLICKED (Ada Lovelace from the roteiro's `ContactSeed`,
 *                                     "Claude Code" from the e2e column's `MockProviderDetector` —
 *                                     each row click both records AND PATCHes its own draft group —
 *                                     then "Próximo" just advances, no mutation of its own since the
 *                                     2026-08-26 rewrite)
 *   6. final (FINAL)               → CLICKED ("Começar" fires `CompleteOnboarding` — the atomic
 *                                     commit that FINALLY materializes the workspace + thread from
 *                                     the draft, 2026-08-26 rewrite)
 * Nothing here uses a given/SDK seam to fast-forward wizard state — every step is driven through
 * the same browser surface a real operator would use, per the task's honesty-over-theater rule.
 *
 * ### 2026-08-24 update — onboarding-attach-ux audit (WORKSPACE tiles+row, one-click confirm+advance)
 * `OnboardingWorkspaceStep` was rewritten from a plain `AddWorkspaceForm` embed (its own "Adicionar
 * pasta" submit button, separate from the footer's "Próximo") into a folder tile grid with a
 * dashed add ROW below it ("+ Adicionar uma pasta", `workspaces.addFolderRow`) — a founder
 * follow-up the same day replaced an earlier dashed-SQUARE-tile version of the same affordance
 * with this row, closer to the step's own list-of-folders shape. Clicking it opens the native OS
 * folder picker when the port reports capable, or — on this Chromium-only harness, which never is
 * (`filePicker.supportsFolderPicker()` resolves false; investigated and confirmed genuine: the File
 * System Access API only ever yields a directory HANDLE, never an absolute path, so
 * `BrowserFilePickerService` staying incapable is correct, not a gap) — reveals the SAME manual
 * path input as before. Filling it no longer POSTs by itself; blurring it (once valid) collapses
 * it into a folder CARD, and "Próximo" is what actually advances (item 2, "confirmar + avançar"), so
 * step 6 below is one click shorter than it used to be. `ReviewStep` similarly dropped its own
 * inline "Vincular conversa" for the onboarding wizard (the adapter stopped passing `onFinish` to
 * it) — the footer "Próximo" just advances now, so step 9 lost its extra click too.
 *
 * ### 2026-08-26 update — draft/atomic-commit rewrite (reboot-loses-onboarding fix)
 * WORKSPACE/CONTACT/AGENTS/REVIEW stopped materializing their own aggregate the instant a step
 * confirmed (`AddWorkspace`/`AttachThread`) — every selection now PATCHes into a server-side draft
 * (`Onboarding.state`, `PATCH /ui/onboarding/step`) that survives a reboot, and ONLY "Começar" (step
 * 10, `CompleteOnboarding`) materializes the workspace + thread, atomically, from that draft. So
 * step 6's network wait moved from `/workspaces` to `/ui/onboarding/step`, and step 9 (REVIEW) no
 * longer waits for any response at all — its "Próximo" is a plain, synchronous advance.
 * `OnboardingFinalStep`'s "mention the agent" copy (2026-08-24 audit item 7) was GONE for one
 * regression window: `CompleteOnboarding` returned `void`, so there was no `threadId` left to mint a
 * mention tag from. RESTORED-THEN-MOVED (2026-08-26 follow-up): `CompleteOnboarding` now answers
 * `{ threadId: string | null }` again, but nothing on `OnboardingFinalStep` reads it anymore — that
 * card raced the very SPA navigate this same click triggers (`onSuccess` invalidated and navigated
 * away in the same tick it would have stashed the id) and the CTA it fed was NEVER actually observed
 * to paint. The CTA now lives on the DASHBOARD instead (`dashboard/-components/MentionCta`), driven
 * server-side by `GetHomeDashboard.mentionCta` — a field that survives the fresh page load the old
 * card's Zustand value never did. This spec still asserts the GENERIC body (`onboarding.finalBody`) on
 * the FINAL step, which is now the ONLY body that step ever renders. The dashboard CTA's own presence/
 * absence logic is covered deterministically in `MentionCta/index.services.test.tsx` (react harness
 * lane, real backend — `GetHomeDashboard` sits behind `OnboardingMiddleware`, so this needs a genuinely
 * completed onboarding underneath it, same reason a demo click here can't assert it live).
 *
 * ### FIXED (2026-08-25, founder live-test, item 3) — the SPA hop now lands, no hard reload needed
 * "Começar" fires `useCompleteOnboarding()`, whose `onSuccess` awaits an invalidate then calls the
 * router's own `navigate({ to: '/dashboard' })`. This USED TO never land here: `OnboardingGate`
 * (`components/console/OnboardingGate.tsx`) checks a module-level `required` flag
 * (`stores/useOnboardingStore.ts`) BEFORE it even looks at `completedAt`, `required` is latched
 * `true` by `onboardingRequiredHandler` (`lib/errors.ts`) the moment ANY request anywhere gets
 * `ONBOARDING_NOT_COMPLETED` — which step 1 below triggers on purpose (the fresh `/dashboard` visit
 * transiently renders the dashboard route before the redirect effect fires, and `getHomeDashboard`
 * 403s) — and nothing ever reset it, so the gate kept bouncing every subsequent `/dashboard`
 * navigate back to `/onboarding` even after `completedAt` was genuinely set. Fixed at the source,
 * two complementary changes: `completeOnboarding`'s `onSuccess` now calls
 * `useOnboardingStore.getState().reset()` (the SAME success path that just earned a genuine
 * `completedAt`, right before navigating) — belt-and-suspenders, `OnboardingGate` itself now
 * checks `data?.completedAt` BEFORE `required`, so a fresh confirmed read wins over a stale latch
 * from any OTHER stray 403 too. This spec now drives the REAL click → SPA navigate → `/dashboard`
 * path below, no hard `goto()` substitution. `06-onboarding-attach.spec.ts`'s browser case keeps
 * its own hard `goto()` — see that file for why: it completes onboarding via a raw SDK call, not a
 * button click, so there is no `completeOnboarding.onSuccess` in that flow to do the reset.
 */
test('demo: operador percorre o onboarding inteiro, do slide 1 ao dashboard', async ({ page, goto }) => {
	// biome-ignore lint/suspicious/noSkippedTests: intentional OPT-IN gate, see docblock — the demo only observes a fresh wizard when it is the ONLY spec in the run (DEMO=on isolated invocation); biome's unsafe fix was silently stripping this .skip on every commit.
	test.skip(
		process.env.DEMO !== 'on',
		'demo spec — opt-in via DEMO=on; the shared single-operator Onboarding row means it can only ' +
			'observe a fresh wizard when it is the ONLY spec touching /ui/onboarding in the run (see docblock)',
	)
	test.setTimeout(180_000)

	await givenFreshUser({})
	await authenticateCloudSession(page)

	const cursor = await createDemoCursor(page)

	// 1. Fresh operator lands on /dashboard, gets redirected to /onboarding by OnboardingGate.
	await goto('/dashboard')
	await expect(page).toHaveURL(/\/onboarding/)

	// The FIRST /dashboard render (before OnboardingGate's redirect effect fires) briefly mounts
	// the dashboard route, which fires `getHomeDashboard` and gets `ONBOARDING_NOT_COMPLETED` — a
	// real, harmless one-time toast (global MutationCache error handler), not a demo artifact. It
	// sits bottom-right for sonner's default 4s, exactly where the wizard's forward button lives —
	// left alone, it silently eats the first "Próximo" click (the demo cursor drives raw CDP
	// coordinates, not Playwright's actionability checks, so nothing here would surface that as a
	// click error). Wait it out before any clicking starts, rather than letting the video's own
	// pacing race it.
	await page
		.locator('[data-sonner-toast]')
		.first()
		.waitFor({ state: 'detached', timeout: 8_000 })
		.catch(() => {})

	// 2. Slide 1 — VALUE.
	await expect(page.getByRole('heading', { name: t('onboarding.slide1Title') })).toBeVisible()
	await page.waitForTimeout(500) // demo pacing — let the video breathe, not a wait-for-condition
	await cursor.click(page.getByRole('button', { name: t('onboarding.next') }), { circulate: true })

	// 3. Slide 2 — HOW.
	await expect(page.getByRole('heading', { name: t('onboarding.slide2Title') })).toBeVisible()
	await page.waitForTimeout(500) // demo pacing — let the video breathe, not a wait-for-condition
	await cursor.click(page.getByRole('button', { name: t('onboarding.next') }))

	// 4. Slide 3 — CONTROL.
	await expect(page.getByRole('heading', { name: t('onboarding.slide3Title') })).toBeVisible()
	await page.waitForTimeout(500) // demo pacing — let the video breathe, not a wait-for-condition
	await cursor.click(page.getByRole('button', { name: t('onboarding.next') }))

	// 5. CHANNEL — no FULL_DISK_ACCESS step in between (see docblock: it never renders in browser).
	// `ConnectChannelForm` is embedded directly here (not behind a "Conectar canal" dialog trigger
	// like `/channels`), so it starts connecting the moment it mounts — nothing to click to begin.
	// The scripted roteiro (`defaultE2eScenario`, Go `overlay.go`) serves a real QR frame
	// synchronously, then auto-pairs after 2s through the real mapper → outbox → handler → projector
	// chain, same as `12-channel-qr.spec.ts`.
	await expect(page.getByText(t('channels.pairWaitingScan'))).toBeVisible({ timeout: 10_000 })
	await expect(page.locator('main svg').first()).toBeVisible()
	await page.waitForTimeout(600) // let the QR sit on screen for the recording
	await expect(page.getByText(t('channels.pairConnectedTitle'))).toBeVisible({ timeout: 15_000 })
	await page.waitForTimeout(500) // demo pacing — let the video breathe, not a wait-for-condition
	await cursor.click(page.getByRole('button', { name: t('onboarding.next') }))

	// 6. WORKSPACE — a real folder on disk. The add affordance is a ROW ("+ Adicionar uma pasta",
	// founder refinement to item 1 — investigated whether the browser could open the File System
	// Access API's `showDirectoryPicker()` instead of falling back to typing: that API only ever
	// yields a `FileSystemDirectoryHandle`, never an absolute filesystem path — a browser security
	// invariant, not a missed capability — so `BrowserFilePickerService` stays honestly incapable and
	// `canPickFolder` gates to the manual input here, same as this Chromium-only harness always
	// exercised). Filling it only records the pending path (item 1); blurring it (clicking "Próximo"
	// next moves focus away) collapses it into the same folder CARD an already-registered workspace
	// renders as. "Próximo" is what actually advances (item 2) — no separate "Adicionar pasta" submit
	// inside the step.
	//
	// 2026-08-26 draft/atomic-commit rewrite: WORKSPACE no longer POSTs `/workspaces` on "Próximo" —
	// the path only PATCHes into the onboarding RASCUNHO (`/ui/onboarding/step`); the real `Workspace`
	// aggregate is materialized later, atomically with the thread, by "Começar" (step 10) alone.
	const workspacePath = mkdtempSync(join(tmpdir(), 'codm-e2e-demo-ws-'))
	await cursor.click(page.getByRole('button', { name: t('workspaces.addFolderRow') }))
	await expect(page.getByLabel(t('workspaces.projectFolder'))).toBeVisible()
	await cursor.fill(page.getByLabel(t('workspaces.projectFolder')), workspacePath)
	await page.waitForTimeout(500) // demo pacing — let the video breathe, not a wait-for-condition
	await Promise.all([
		page.waitForResponse(res => res.url().includes('/ui/onboarding/step') && res.request().method() === 'PATCH' && res.ok()),
		cursor.click(page.getByRole('button', { name: t('onboarding.next') }), { circulate: true }),
	])

	// 7. CONTACT — pick a contact seeded by the roteiro's `ContactSeed` (Go `overlay.go`,
	// `defaultE2eScenario`: "Ada Lovelace" / "Alan Turing"), synced into the shared SQLite `remotes`
	// table through the real gateway sync pipeline (`RemoteSnapshotProjector` →
	// `channel.remotes_synced`) once the channel connects. Generous timeout: that sync rides the
	// same connect event as CONNECTED above, but lands via a separate handler.
	await expect(page.getByRole('heading', { name: t('attach.stepThreadTitle') })).toBeVisible()
	const adaRow = page.getByRole('button', { name: ROTEIRO_CONTACT_NAME })
	await expect(adaRow).toBeVisible({ timeout: 15_000 })
	await page.waitForTimeout(400) // demo pacing — let the video breathe, not a wait-for-condition
	await cursor.click(adaRow)
	await page.waitForTimeout(400) // demo pacing — let the video breathe, not a wait-for-condition
	await cursor.click(page.getByRole('button', { name: t('onboarding.next') }))

	// 8. AGENTS — "Claude Code" is DETECTED/available under the e2e column's `MockProviderDetector`
	// (deterministic catalog, no filesystem probe).
	await expect(page.getByRole('heading', { name: t('attach.stepAgentsTitle') })).toBeVisible()
	const claudeCodeRow = page.locator('[role="button"]').filter({ hasText: ROTEIRO_PROVIDER_NAME })
	await page.waitForTimeout(400) // demo pacing — let the video breathe, not a wait-for-condition
	await cursor.click(claudeCodeRow)
	await page.waitForTimeout(400) // demo pacing — let the video breathe, not a wait-for-condition
	await cursor.click(page.getByRole('button', { name: t('onboarding.next') }))

	// 9. REVIEW — plain read + edit links since the 2026-08-26 draft/atomic-commit rewrite: REVIEW no
	// longer fires `useAttachThread` on "Próximo" (it used to, per the 2026-08-24 onboarding-attach-ux
	// audit item 2) — the thread is materialized later, atomically with the workspace, only when
	// "Começar" (step 10) commits the whole rascunho via `CompleteOnboarding`. "Próximo" here is
	// therefore a plain, synchronous advance — nothing to wait a network response for. AC-14 still
	// holds — the onboarding wizard never navigates away from /onboarding on its own; only the FINAL
	// step's "Começar" does that.
	await expect(page.getByRole('heading', { name: t('attach.stepReviewTitle') })).toBeVisible()
	await page.waitForTimeout(500) // demo pacing — let the video breathe, not a wait-for-condition
	await cursor.click(page.getByRole('button', { name: t('onboarding.next') }), { circulate: true })

	// 10. FINAL — "Começar" fires the real completion mutation (`useCompleteOnboarding`), which is
	// ALSO the moment the workspace + thread actually materialize (`CompleteOnboarding`'s atomic
	// commit, 2026-08-26). Awaited via its own response rather than trusting timing alone — the SPA
	// navigate below is now the REAL follow-up (item 3 fix), not a substitute.
	//
	// The "mention the agent" CTA no longer lives on this step (moved to the dashboard, 2026-08-26 —
	// see this file's own docblock, "2026-08-26 update") — FINAL only ever renders the generic body now.
	await expect(page.getByRole('heading', { name: t('onboarding.finalTitle') })).toBeVisible()
	await expect(page.getByText(t('onboarding.finalBody'))).toBeVisible()
	await page.waitForTimeout(600) // demo pacing — let the video breathe, not a wait-for-condition
	await Promise.all([
		page.waitForResponse(res => res.url().includes('/ui/onboarding/complete') && res.request().method() === 'POST' && res.ok()),
		cursor.click(page.getByRole('button', { name: t('onboarding.getStarted') }), { circulate: true }),
	])

	// 11. The real dashboard — via the app's OWN client-side navigate (item 3 fix: `completeOnboarding`'s
	// `onSuccess` resets the `required` latch before calling `navigate({ to: '/dashboard' })`, and
	// `OnboardingGate` now also prioritizes a fresh `completedAt` over that latch) — no hard `goto()`
	// substitution anymore. `toHaveURL` polls, so this also proves the SPA hop actually happens instead
	// of silently timing out and needing a fallback.
	await expect(page).toHaveURL(/\/dashboard/)
	await expect(page.getByRole('heading', { name: t('nav.home') })).toBeVisible()
	await page.waitForTimeout(500) // demo pacing — let the video breathe, not a wait-for-condition
})
