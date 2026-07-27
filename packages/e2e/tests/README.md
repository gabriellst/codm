# CodeDM E2E flows

Cross-stack canonical flows exercised through Playwright against the REAL stack the harness can boot
on its own: the TS daemon in `real` mode over an EMBEDDED file-backed SQLite store (a scratch
`CODEDM_DATA_DIR`, no external Postgres/Redis) plus the app-react console — booted by
`playwright.config.ts` webServer, orchestrated by `scripts/run-e2e.ts`.

The Go Channel Gateway is **not** booted. Gateway ingress is simulated at the integration-event seam by
the test-only `POST /v1/_test/gateway` endpoint (mounted only under `CODEDM_E2E`): it seeds a CONNECTED
channel row and publishes `channel_message.received` straight into the daemon's in-process
ExternalMediator. The agent runner + provider detector are stubbed under `CODEDM_E2E` (no real CLI).

| # | Spec | Flow | State |
|---|------|------|-------|
| 3 | `03-owner-create` | create Owner → SetActiveOwner (a no-op under the single-operator collapse) → owner is LISTED via BFF GetUserInfo | ✅ |
| 4 | `04-inbound-issue` | (b) inject inbound message → issue materializes with its slug key → the stubbed agent session runs (issue → WORKING) | ✅ |
| 5 | `05-whisper-direct` | (c) composer mode guard — whisper accepted only while LIVE, direct only while PAUSED | ✅ |
| 6 | `06-onboarding-attach` | (a) onboarding checklist completes once channel + workspace + thread exist; the attach-thread wizard read reflects them | ✅ |
| 7 | `07-issue-archive-restore` | (e) archive an issue → it lands in `archived[]` → restore → it returns to an active status group | ✅ |
| 8 | `08-stop-resolve` | (d) stop raised → needs-you callout → resolve | ⏭️ honest skip — the e2e stub AgentRunner exits 0 and never raises an approval/auth stop (no hermetic stop-raising path) |
| 9 | `09-sse-pill` | (f) SSE live update — agents-running pill reacts without reload | ⏭️ honest skip — the stub session completes synchronously, so there is no stable "running" window to observe |

Support layer: `utils/test.ts` (browser-free `given.freshUser` — the operator session is API-only, so
API-flow specs never launch chromium; typed `goto`/`network` remain for any UI spec that opts into
`page`), `utils/given/` (operator SDK client + `givenAttachedThread` + the `gateway` ingress seam),
`utils/i18n.ts` (assert against the app's own locale strings, never hardcoded copy).

Run: `bun run test` (from `packages/e2e`) or `bun e2e` (from the root).
