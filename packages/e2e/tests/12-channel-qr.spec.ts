import { test, expect } from '../utils/test'
import { dialog } from '../utils/selectors'
import { authenticateCloudSession } from '../utils/given/cloud'

/**
 * CHANNEL QR PAIRING — AC-9 (.specs/2026-08-10-eixo-ambiente-go-design.md D12). The Go gateway rides
 * a REAL third webServer in this suite now (scripts/run-e2e.ts, playwright.config.ts), booted
 * CODM_ENV=e2e over the SAME scratch SQLite file the TS daemon writes to. This is the first spec
 * that proves the QR pairing screen end to end — no phone, no injected event, no TS-side test seam:
 * clicking "Conectar canal" hits the REAL gateway (through api-ts's `forwardToChannel` proxy), which
 * plays the scripted `defaultE2eScenario()` (`internal/channel/overlay.go`) through the SAME
 * mapper → outbox → handler → projector pipeline a real whatsmeow pairing would drive.
 *
 * ### Why the QR assertion is not a race against the connect response
 * `ConnectChannelHandler` (Go) always returns the FIRST QR frame SYNCHRONOUSLY on the connect
 * response — `GetQRChannel` fills and closes the buffered frame channel before the handler ever
 * touches the async pairing clock, so the browser sees the code the instant the mutation resolves,
 * no poll involved.
 *
 * ### Why CONNECTED used to be a race — and isn't any more
 * What WAS racy is CONNECTED arriving too soon after: `defaultE2eScenario()` originally auto-paired
 * with `AutoPairAfter: 0`, so the scenario's background pairing clock (a separate goroutine) could
 * flip the projected status before `ConnectChannelForm`'s first `useGetChannel` poll ever observed
 * CONNECTING — an unobservable window, not a real state to assert on. Fixed at the SOURCE (T10, Go
 * side, not a spec-side sleep/retry): `defaultE2eScenario()` now waits 2s before pairing, comfortably
 * longer than the round trip any Playwright assertion needs to observe the QR for real.
 *
 * ### Selectors
 * `qrcode.react`'s `QRCodeSVG` renders an unlabeled `<svg>` — no accessible name to select by. This
 * follows the same precedent `11-artifact-preview.spec.ts` set for `<video>`/`<audio>`: a literal
 * element locator scoped to the dialog, paired with the "waiting to scan" text as the accessible half
 * of the same assertion. `.first()` is structural, not a race hedge — the QR's own `<svg>` precedes
 * the waiting hint's small `<Spinner>` `<svg>` in DOM order (ConnectChannelForm's `qr` branch renders
 * the QR container before the hint paragraph).
 */
test('conectar canal — QR do roteiro aparece na tela → auto-pareamento → CONNECTED no console', async ({ page, goto }) => {
	// AutoPairAfter (2s) + outbox dispatch + the 2s useGetChannel poll interval stack comfortably
	// under the 30s file default, but this keeps the budget explicit rather than borderline.
	test.setTimeout(60_000)

	// CloudSessionGate wraps every (app) route (packages/app/react/src/routes/(app)/route.tsx) —
	// seed the device-token secret before the first navigation, same as every other browser spec.
	await authenticateCloudSession(page)
	await goto('/channels')

	await page.getByRole('button', { name: 'Conectar canal' }).click()

	const modal = dialog(page)
	await expect(modal.getByText('Parear WhatsApp')).toBeVisible()

	// The scripted first frame (codm-e2e-qr-1, defaultE2eScenario) — returned synchronously by the
	// connect mutation. Both signals of ConnectChannelForm's `qr` branch, asserted together.
	await expect(modal.locator('svg').first()).toBeVisible()
	await expect(modal.getByText('Aguardando você escanear o código…')).toBeVisible()

	// The scenario auto-pairs after 2s through the REAL mapper → outbox → handler → projector chain
	// — exactly the room the bumped AutoPairAfter (overlay.go) buys this poll.
	await expect(modal.getByText('WhatsApp conectado')).toBeVisible({ timeout: 15_000 })
	await expect(modal.getByText('Este canal está vinculado e pronto para rotear mensagens.')).toBeVisible()
})
