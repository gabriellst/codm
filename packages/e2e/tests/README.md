# CODM E2E flows

Cross-stack canonical flows exercised through Playwright against the REAL stack the harness can boot
on its own: the TS daemon in `real` mode over an EMBEDDED file-backed SQLite store (a scratch
`CODM_DATA_DIR`, no external Postgres/Redis) plus the app-react console — booted by
`playwright.config.ts` webServer, orchestrated by `scripts/run-e2e.ts`.

The Go Channel Gateway is **not** booted. Gateway ingress is simulated at the integration-event seam by
the test-only `POST /v1/_test/gateway` endpoint (mounted only under `CODM_ENV=e2e`): it seeds a CONNECTED
channel row and publishes `channel_message.received` straight into the daemon's in-process
ExternalMediator. The agent runner + provider detector are stubbed under `CODM_ENV=e2e` (no real CLI).

| # | Spec | Flow | State |
|---|------|------|-------|
| 3 | `03-owner-create` | create Owner → SetActiveOwner (a no-op under the single-operator collapse) → owner is LISTED via BFF GetUserInfo | ✅ |
| 4 | `04-inbound-issue` | (b) inject inbound message → issue materializes with its slug key → the stubbed agent session runs (issue → WORKING) | ✅ |
| 5 | `05-whisper-direct` | (c) composer mode guard — whisper accepted only while LIVE, direct only while PAUSED | ✅ |
| 6 | `06-onboarding-attach` | (a) onboarding checklist completes once channel + workspace + thread exist; the attach-thread wizard read reflects them | ✅ |
| 7 | `07-issue-archive-restore` | (e) archive an issue → it lands in `archived[]` → restore → it returns to an active status group | ✅ |
| 8 | `08-stop-resolve` | (d) stop raised → needs-you callout → resolve | ⏭️ honest skip — the e2e stub AgentRunner exits 0 and never raises an approval/auth stop (no hermetic stop-raising path) |
| 9 | `09-sse-pill` | (f) SSE live update — agents-running pill reacts without reload | ⏭️ honest skip — the stub session completes synchronously, so there is no stable "running" window to observe |

Support layer: `utils/test.ts` (typed `goto`/`network` fixtures for UI specs; API-flow specs never
launch chromium), `utils/given/` (operator SDK client + the `given*` helpers + the `gateway` ingress
seam), `utils/i18n.ts` (assert against the app's own locale strings, never hardcoded copy).

**Copy in assertions comes from the catalog — and this is now GATED.** `utils/i18n.ts` exports a `t()`
whose key type is derived from `src/locales/pt.json`, so a renamed key is a `tsc` error instead of a
test that mysteriously stops finding an element. Assert `t('channels.pairConnectedTitle')`, never the
literal `'WhatsApp conectado'`.

This was doctrine with no teeth until 2026-08-18: the rule existed in this one line, `utils/i18n.ts`
existed, and **zero test files imported it** — 7 assertions across two specs hardcoded copy, one of
them (`'Converse com seu código'`) being verbatim the value of `onboarding.slide1Title`. A copy edit
would have broken an unrelated spec with `Unable to find an element with the text: …`, which reads
like a broken feature rather than a stale string.

The rail is `packages/app/react/tests/architecture/i18n-assertions.test.ts` (I18N-01/02). Its
predicate is exact in both directions: a literal is a violation **only if it is a leaf value in
`pt.json`**, so a `data-testid`, URL or selector can never be flagged, while real user-facing copy is
in the catalog by construction. It lives in the react lane because `bun run test` is
`--exclude=e2e` — a rail placed here would never run in CI. The failure message names the exact key
to use.

**Naming, and it carries meaning — do not flatten it.** `given*` seeds a PRECONDITION and is a plain
import, always. `inject*` / `run*` deliver the STIMULUS — the *when* of the test, not its setup;
`injectInboundMessage` is the event the spec exists to observe, so calling it `givenInboundMessage`
would file the thing under test as scenery. `seedConnectedChannel` pairs with `injectInboundMessage`
on purpose: both POST to the same `/v1/_test/gateway` seam that stands in for the Go gateway this
harness does not boot — `seed` writes the row, `inject` publishes the event.

A given is **never** a Playwright fixture. There was one (`given.freshUser`) until 2026-08-17, and it
depended on nothing and wrapped a single function — pure indirection, and the only helper in the
package shaped that way. A fixture earns its place with setup/teardown, a dependency on `page`, or
per-test cleanup; a plain function that takes a session has none of those.

Run: `bun run test` (from `packages/e2e`) or `bun e2e` (from the root).
