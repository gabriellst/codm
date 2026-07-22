# Marketing Canonical Aggregates — Phase 0 Contract Lock — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer gate (emit-openapi compile / regen-produces-expected-bindings).
> This is a contracts-only Phase 0 spec — no aggregate code, no runtime tests; the
> gates ARE the verification.

**Goal:** Lock the marketing wire-event contract so Spec β (Go aggregates + TS link
table + AdSpend rename) and Spec γ+ (Facebook pipelines) can be brainstormed and
built in parallel against a clean, minimal contract surface.

**Architecture:** Delete the 6 over-built marketing wire events (`*Updated` / `*Recorded`
/ `*Completed`) that have zero TS/Go consumers under the redirected "events only feed
link table" rule. Add two account-status enums (`BusinessAccountStatus`,
`AdAccountStatus`) consumed by the Go-side aggregates in Spec β. Add a
`MarketingBusinessAccountDiscoveredEvent` mirroring the existing AdAccount discovery
event, and add a `businessAccountExternalId` denorm field to the existing AdAccount
discovery event so the TS-side polymorphic link table can join. Regenerate
`packages/contracts/generated/{go,typescript}/wire/` bindings as the contract-lock
gate.

**Tech Stack:** TypeSpec (`@typespec/openapi3`), Nx (`bun emit-openapi`, `bun sdk`),
Bun (`bun tsc`, `bun run test`).

**Spec:** .specs/2026-05-28-marketing-canonical-aggregates-phase-0-contract-lock-design.md
**Tasks:** 3
**Estimated minutes:** 30

---

## Task T1: Reshape marketing wire-event surface

**Files to write:**
- Delete: `packages/contracts/wire/events/campaign-updated.tsp`
- Delete: `packages/contracts/wire/events/campaign-status-changed.tsp`
- Delete: `packages/contracts/wire/events/ad-set-updated.tsp`
- Delete: `packages/contracts/wire/events/ad-updated.tsp`
- Delete: `packages/contracts/wire/events/ad-spend-recorded.tsp`
- Delete: `packages/contracts/wire/events/marketing-reconciliation-completed.tsp`
- Create: `packages/contracts/wire/events/marketing-business-account-discovered.tsp`
- Modify: `packages/contracts/wire/events/marketing-ad-account-discovered.tsp` — add `businessAccountExternalId: string` field; refresh model doc to mention the BM parent
- Modify: `packages/contracts/wire/events/index.tsp` — remove the 6 deleted imports + retire the now-empty "BK Dash Marketing events (iter 41c Group C ...)" section; add the new BM discovery import alongside the existing AdAccount discovery import under the Integration events group
- Modify: `packages/api/typescript/src/marketing/handlers/external.ts` — drop the OnMarketingReconciliationCompleted deferred comment block

**Files to read:**
- `packages/contracts/wire/events/index.tsp`
- `packages/contracts/wire/events/marketing-ad-account-discovered.tsp`
- `packages/contracts/wire/events/_base.tsp`
- `packages/api/typescript/src/marketing/handlers/external.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Skills:** (none — TypeSpec contract surface management)
**Depends on:** (none)

### Step T1.1 — Delete the 6 deprecated event .tsp files

```bash
rm packages/contracts/wire/events/campaign-updated.tsp \
   packages/contracts/wire/events/campaign-status-changed.tsp \
   packages/contracts/wire/events/ad-set-updated.tsp \
   packages/contracts/wire/events/ad-updated.tsp \
   packages/contracts/wire/events/ad-spend-recorded.tsp \
   packages/contracts/wire/events/marketing-reconciliation-completed.tsp
```

### Step T1.2 — Create `marketing-business-account-discovered.tsp`

Write `packages/contracts/wire/events/marketing-business-account-discovered.tsp`:

```typespec
import "./_base.tsp";

namespace TemplateContracts;

@doc("Published by go-worker during a MarketingPlatform handshake when a BusinessAccount becomes visible to BK Dash through the given StoreIntegration. TS Marketing upserts a row in `store_integration_marketing_access` with `accessType=BUSINESS_ACCOUNT`.")
model MarketingBusinessAccountDiscoveredEvent extends IntegrationEvent {
  name: "integration.shared.marketing_business_account.discovered";

  @doc("Marketing platform the business account belongs to.")
  platform: MarketingPlatform;

  @doc("Provider's native business-account id.")
  businessAccountExternalId: string;

  @doc("Human-readable business-account name from the provider (surfaced in the merchant's pick list).")
  accountName: string;

  @doc("Provider's StoreIntegration externalId — drives tenant resolution downstream.")
  storeIntegrationExternalId: string;
}
```

### Step T1.3 — Revise `marketing-ad-account-discovered.tsp` to add `businessAccountExternalId`

Modify `packages/contracts/wire/events/marketing-ad-account-discovered.tsp`:

```diff
 import "./_base.tsp";

 namespace TemplateContracts;

-@doc("Published by go-worker during a MarketingPlatform handshake when an ad account becomes visible to BK Dash. TS Integration projects the discovery into the StoreIntegration's adAccounts list so the merchant can pick which accounts to ingest.")
+@doc("Published by go-worker during a MarketingPlatform handshake when an ad account becomes visible to BK Dash through the given StoreIntegration. TS Marketing upserts a row in `store_integration_marketing_access` with `accessType=AD_ACCOUNT`, denormalizing the parent BusinessAccount externalId so queries can group ad-accounts by BM without a cross-BC SDK roundtrip.")
 model MarketingAdAccountDiscoveredEvent extends IntegrationEvent {
   name: "integration.shared.marketing_ad_account.discovered";

   @doc("Marketing platform the ad account belongs to.")
   platform: MarketingPlatform;

   @doc("Provider's native ad-account id.")
   adAccountExternalId: string;

+  @doc("Provider's native parent business-account id — denormalized for link-row queries.")
+  businessAccountExternalId: string;
+
   @doc("Human-readable ad-account name from the provider (surfaced in the merchant's pick list).")
   accountName: string;

   @doc("Provider's StoreIntegration externalId — drives tenant resolution downstream.")
   storeIntegrationExternalId: string;

   @doc("Ad-account default currency from the provider. Stored alongside spend rows so analytics know what to convert.")
   currency: CurrencyCode;
 }
```

### Step T1.4 — Update `index.tsp` (remove 6, add 1)

Modify `packages/contracts/wire/events/index.tsp`. Two edits:

**Edit A — remove the entire "BK Dash Marketing events" group (6 imports + comment):**

```diff
-// BK Dash Marketing events (iter 41c Group C — go-worker → TS Marketing/Analytics)
-import "./campaign-updated.tsp";
-import "./campaign-status-changed.tsp";
-import "./ad-set-updated.tsp";
-import "./ad-updated.tsp";
-import "./ad-spend-recorded.tsp";
-import "./marketing-reconciliation-completed.tsp";
-
 // BK Dash Tracking events (iter 41c Group D — go-worker → TS Tracking/Sales)
 import "./pixel-event-recorded.tsp";
```

**Edit B — add the new BM discovery import next to the existing AdAccount one** (under the "BK Dash Integration events (iter 41c Group E ...)" group):

```diff
 import "./integration-last-sync-updated.tsp";
+import "./marketing-business-account-discovered.tsp";
 import "./marketing-ad-account-discovered.tsp";
 import "./integration-progress-updated.tsp";
```

### Step T1.5 — Clean up the OnMarketingReconciliationCompleted comment in `external.ts`

Modify `packages/api/typescript/src/marketing/handlers/external.ts`:

```diff
 // External handlers — subscribe to integration events from other BCs / Go.
 //
 // DEFERRED (iter 272 audit closure):
 //   - OnStoreIntegrationDataWipeRequested → needs an
 //     aggregate-erasing repo surface on Marketing side
 //     (CampaignRepository.deleteByStoreIntegration / similar).
 //     Lands paired with that repo work, NOT a missing handler.
-//   - OnMarketingReconciliationCompleted → no real v1 consumer; the
-//     cache-invalidation use case was dropped per memory
-//     `no-speculative-cache-layer`. Re-evaluate when a cache layer
-//     ships.
 export {}
```

### Step T1.6 — Verify TypeSpec compiles cleanly

Run:

```bash
bun emit-openapi
```

Expected: exit 0; no TypeSpec compile errors. The emitted `openapi.json` files no
longer contain `CampaignUpdatedEvent`, `CampaignStatusChangedEvent`,
`AdSetUpdatedEvent`, `AdUpdatedEvent`, `AdSpendRecordedEvent`,
`MarketingReconciliationCompletedEvent`; they include
`MarketingBusinessAccountDiscoveredEvent` and `MarketingAdAccountDiscoveredEvent`
(with the new `businessAccountExternalId` field).

### Step T1.7 — Verify deletions + additions + revisions

```bash
ls packages/contracts/wire/events/ | grep -E '^(campaign-updated|campaign-status-changed|ad-set-updated|ad-updated|ad-spend-recorded|marketing-reconciliation-completed)\.tsp$' && echo BAD || echo OK
test -f packages/contracts/wire/events/marketing-business-account-discovered.tsp && echo OK || echo BAD
grep -q 'businessAccountExternalId' packages/contracts/wire/events/marketing-ad-account-discovered.tsp && echo OK || echo BAD
grep -E '^import "./(campaign-updated|campaign-status-changed|ad-set-updated|ad-updated|ad-spend-recorded|marketing-reconciliation-completed)\.tsp";$' packages/contracts/wire/events/index.tsp && echo BAD || echo OK
grep -q 'marketing-business-account-discovered.tsp' packages/contracts/wire/events/index.tsp && echo OK || echo BAD
grep -q OnMarketingReconciliationCompleted packages/api/typescript/src/marketing/handlers/external.ts && echo BAD || echo OK
```

Expected: six `OK` lines.

---

## Task T2: Add BusinessAccountStatus + AdAccountStatus enums

**Files to write:**
- Create: `packages/contracts/wire/enums/business-account-status.tsp`
- Create: `packages/contracts/wire/enums/ad-account-status.tsp`
- Modify: `packages/contracts/wire/main.tsp` — add two import lines under the `// Marketing` enum group

**Files to read:**
- `packages/contracts/wire/enums/campaign-status.tsp` (canonical enum shape)
- `packages/contracts/wire/main.tsp` (registration pattern)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Skills:** (none — TypeSpec enum authoring)
**Depends on:** (none)

### Step T2.1 — Create `business-account-status.tsp`

Write `packages/contracts/wire/enums/business-account-status.tsp`:

```typespec
namespace TemplateContracts;

@doc("BusinessAccount lifecycle status as BK Dash derived from the provider's native state (Meta business_status, Google MCC status, TikTok BC status).")
enum BusinessAccountStatus {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
  UNKNOWN: "UNKNOWN",
}
```

### Step T2.2 — Create `ad-account-status.tsp`

Write `packages/contracts/wire/enums/ad-account-status.tsp`:

```typespec
namespace TemplateContracts;

@doc("AdAccount lifecycle status as BK Dash derived from the provider's native state (Meta account_status int, Google AccountStatus, TikTok advertiser status).")
enum AdAccountStatus {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
  UNKNOWN: "UNKNOWN",
}
```

### Step T2.3 — Register both enums in `main.tsp`

Modify `packages/contracts/wire/main.tsp`:

```diff
 // Marketing
 import "./enums/campaign-status.tsp";
 import "./enums/ad-spend-type.tsp";
 import "./enums/ad-spend-group-by.tsp";
+import "./enums/business-account-status.tsp";
+import "./enums/ad-account-status.tsp";
```

### Step T2.4 — Verify TypeSpec compiles with the new enums

Run:

```bash
bun emit-openapi
```

Expected: exit 0; emitted `openapi.json` files include `BusinessAccountStatus` and
`AdAccountStatus` schema definitions.

### Step T2.5 — Verify enums registered

```bash
test -f packages/contracts/wire/enums/business-account-status.tsp && echo OK || echo BAD
test -f packages/contracts/wire/enums/ad-account-status.tsp && echo OK || echo BAD
grep -q 'business-account-status.tsp' packages/contracts/wire/main.tsp && echo OK || echo BAD
grep -q 'ad-account-status.tsp' packages/contracts/wire/main.tsp && echo OK || echo BAD
```

Expected: four `OK` lines.

---

## Task T3: Contract Lock — SDK regen

**Files to write:**
- Regen: `packages/contracts/generated/go/wire/enums.go`
- Regen: `packages/contracts/generated/go/wire/events.go`
- Regen: `packages/contracts/generated/typescript/src/wire/enums.ts`
- Regen: `packages/contracts/generated/typescript/src/wire/events/_imports.ts`
- Regen: `packages/contracts/generated/typescript/src/wire/events/index.ts`
- Regen: `packages/contracts/generated/typescript/src/wire/events/marketing-business-account-discovered.ts` (new)
- Regen: `packages/contracts/generated/typescript/src/wire/events/marketing-ad-account-discovered.ts` (modified)
- Regen: deletion of `packages/contracts/generated/typescript/src/wire/events/{campaign-updated,campaign-status-changed,ad-set-updated,ad-updated,ad-spend-recorded,marketing-reconciliation-completed}.ts`

**Files to read:** (none — regen is mechanical)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T2

### Step T3.1 — Regenerate OpenAPI + SDK bindings

```bash
bun emit-openapi && bun sdk
```

Expected: both commands exit 0. The codegen rewrites generated Go + TS wire files
to reflect the .tsp changes from T1 and T2.

### Step T3.2 — Verify generated artifacts changed as expected

```bash
git status --short packages/contracts/generated/
```

Expected lines (subset; exact filenames may vary slightly with the codegen
implementation):

- ` M packages/contracts/generated/go/wire/enums.go` (gained `BusinessAccountStatus` + `AdAccountStatus`)
- ` M packages/contracts/generated/go/wire/events.go` (gained `MarketingBusinessAccountDiscoveredEvent`; lost the 6 deleted; `MarketingAdAccountDiscoveredEvent` gained `BusinessAccountExternalID`)
- ` M packages/contracts/generated/typescript/src/wire/enums.ts`
- `?? packages/contracts/generated/typescript/src/wire/events/marketing-business-account-discovered.ts` (new)
- ` D packages/contracts/generated/typescript/src/wire/events/campaign-updated.ts`
- ` D packages/contracts/generated/typescript/src/wire/events/campaign-status-changed.ts`
- ` D packages/contracts/generated/typescript/src/wire/events/ad-set-updated.ts`
- ` D packages/contracts/generated/typescript/src/wire/events/ad-updated.ts`
- ` D packages/contracts/generated/typescript/src/wire/events/ad-spend-recorded.ts`
- ` D packages/contracts/generated/typescript/src/wire/events/marketing-reconciliation-completed.ts`
- ` M packages/contracts/generated/typescript/src/wire/events/marketing-ad-account-discovered.ts` (added `businessAccountExternalId` to schema + class)
- ` M packages/contracts/generated/typescript/src/wire/events/_imports.ts`
- ` M packages/contracts/generated/typescript/src/wire/events/index.ts`

### Step T3.3 — Spot-check the generated Go enum file

```bash
grep -E 'BusinessAccountStatus|AdAccountStatus' packages/contracts/generated/go/wire/enums.go | head -10
```

Expected: lines defining both enum types (`type BusinessAccountStatus string`,
constants `BusinessAccountStatusACTIVE = "ACTIVE"`, etc., same for AdAccountStatus).

### Step T3.4 — Spot-check the generated Go events file

```bash
grep -E 'MarketingBusinessAccountDiscoveredEvent|BusinessAccountExternalID' packages/contracts/generated/go/wire/events.go | head -10
```

Expected: definitions of the new event struct + the new field on
`MarketingAdAccountDiscoveredEvent`.

### Step T3.5 — Confirm deleted event types are absent from generated Go

```bash
grep -E 'CampaignUpdatedEvent|CampaignStatusChangedEvent|AdSetUpdatedEvent|AdUpdatedEvent|AdSpendRecordedEvent|MarketingReconciliationCompletedEvent' packages/contracts/generated/go/wire/events.go && echo BAD || echo OK
```

Expected: `OK` (no matches).

### Step T3.6 — Confirm deleted event types are absent from generated TS

```bash
ls packages/contracts/generated/typescript/src/wire/events/ | grep -E '^(campaign-updated|campaign-status-changed|ad-set-updated|ad-updated|ad-spend-recorded|marketing-reconciliation-completed)\.ts$' && echo BAD || echo OK
```

Expected: `OK` (no matches).

### Step T3.7 — Full type check across all workspaces

```bash
bun tsc
```

Expected: 0 errors. The grep audit in the spec confirmed no TS/Go consumer
references the deleted events, so the regen drop should compile cleanly.

### Step T3.8 — Full test suite (Go + TS, excluding e2e)

```bash
bun run test
```

Expected: all tests pass; no test asserts on the deleted event types.

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun run test` — Go + TS test suites pass
- [ ] `bun emit-openapi` — TypeSpec compiles
- [ ] `bun sdk` — generated bindings regenerate without error
- [ ] AC mapping (every spec AC → ≥1 verifying gate; no test files exist for a
      contract-only spec, so gates are CLI commands):
  - AC-1 → T1 Step T1.1 (`rm` of 6 .tsp files) + T1.7 verification
  - AC-2 → T1 Step T1.2 (create `marketing-business-account-discovered.tsp`) + T1.7 verification
  - AC-3 → T1 Step T1.3 (revise `marketing-ad-account-discovered.tsp` to add `businessAccountExternalId`) + T1.7 verification
  - AC-4 → T1 Step T1.4 (index.tsp edits: remove 6 + add 1) + T1.7 verification
  - AC-5 → T1.6 / T2.4 / T3.1 (all `bun emit-openapi` invocations exit 0)
  - AC-6 → T3 Steps T3.3, T3.4, T3.5, T3.6 (generated bindings spot-checks)
  - AC-7 → T2 Steps T2.1, T2.2 (both enum files created) + T2.3 (registered in `main.tsp`) + T2.5 verification
  - AC-8 → T1 Step T1.5 (delete OnMarketingReconciliationCompleted comment) + T1.7 verification
  - AC-9 → T3 Step T3.7 (`bun tsc` clean)
  - AC-10 → T3 Step T3.8 (`bun run test` passes)

## Notes

- **No new env vars or library additions.** This spec touches only the contracts BC's
  TypeSpec sources plus a generated-file regen. Existing `bun emit-openapi` / `bun sdk`
  / `bun tsc` / `bun run test` scripts cover all gates.
- **No e2e relevance.** Phase 0 contract lock has no user-observable behavior; the
  `bun e2e` step in the canonical Final Validation block is omitted on purpose.
- **No `/sdk` skill content beyond the regen commands.** This Task chain isn't adding
  controllers — it edits TypeSpec and triggers the existing regen pipeline. The
  `/sdk` skill is listed on T3 only because that's where the regen executes.
- **Spec β is the next brainstorm.** Forward Scope in the spec preview seeds it:
  Go-side 6 aggregates + Drizzle migration + TS polymorphic
  `store_integration_marketing_access` link table with `active`/`validFrom`/`validTo`
  columns + `AdSpend` → `AdSpendManual` rename. The contract lock landing here is
  what unblocks parallel brainstorming of Spec β + Spec γ+ (Facebook pipelines).
- **Why all three Tasks use `haiku`:** every step is mechanical — file deletion, small
  TypeSpec edits, regen commands, grep verifications. There is no design judgment
  inside any Task; the design lives in the spec. Sonnet would be overkill.
- **T1 + T3 merger rationale:** the original 4-Task plan had T1 (delete events + index.tsp
  cleanup) and T3 (add BM event + revise AdAccount event + index.tsp addition) both
  modifying `packages/contracts/wire/events/index.tsp`. Pre-flight's "no two parallel
  Tasks have overlapping filesWrites" check would have failed. Merging them into a
  single wire-event-surface Task removes the overlap and keeps T2 independently
  parallelizable.
- **Known `validate-plan` warning (PR-19, T3 → T1):** the code-graph doesn't trace
  `.tsp → generated bindings` edges for new files / deletions. T3 depends on T1 in
  the markdown ordering and via `Depends on: T2` (which is parallel-equivalent — both
  T1 and T2 land in wave 0, T3 in wave 1). The implicit ordering is preserved without
  declaring T1 as a dep, sidestepping the false-positive validation finding.
