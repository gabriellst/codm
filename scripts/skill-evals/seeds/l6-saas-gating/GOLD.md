# GOLD — l6-saas-gating (monetized resource: plans → quota → access removal)

The app-from-idea probe for the MONETIZATION layer. The build must INTEGRATE the template's
existing billing + quota machinery through its DECLARED seams — never fork or re-implement it.

## The idea (input)

"Projects, plan-gated: on the free plan an owner creates up to 2 projects; subscribing to a paid
plan (sandbox gateway, fake money) raises the limit; when the gateway reports the subscription
canceled, the owner is downgraded and excess projects are locked."

## Gold decomposition

- ONE new bounded context: `project` (Project aggregate — identity, `ARCHIVED`/`LOCKED` style
  lifecycle, at least one real invariant, e.g. a locked project rejects mutations with a named
  domain error). NO billing fork, NO quota fork, NO god-context.
- Contract lock FIRST: `PROJECTS` joins the `QuotaKey` wire enum in packages/contracts (+ regen
  `bun contracts` / `bun sdk`). The quota vocabulary is cross-boundary — it NEVER lives in src.
- Gating through the declared seams, in order:
  1. `PlanRegistry` quotas carry the `PROJECTS` policy per plan (free: hard limit 2; paid: higher).
  2. The merge root (src/shared/registry.ts) overrides quota's placeholder `QuotaUsageSource`
     with a real PROJECTS counter (count projects per owner) and `ResourceGovernorRegistry` with a
     PROJECTS governor (locks/unlocks excess) — the documented product-plug seam, appended AFTER
     the context spreads so last-write-wins replaces the placeholders.
  3. `CreateProject` consults `QuotaGate` and rejects at the limit with `QUOTA_LIMIT_EXCEEDED`.
  4. Cancellation flow: the gateway webhook raises `ExternalSubscriptionCanceledEvent` (billing,
     already live) → a handler downgrades the owner's entitlement → `ResourceLimitEnforcer` runs
     the PROJECTS governor → excess projects become locked (`RESOURCE_LOCKED_BY_PLAN` on access).
- Read side: usage surfaces through the existing `GetUsage`/`ListPlans` BFF queries (extend, don't
  duplicate).
- Frontend (react): a plans/paywall route (ListPlans + subscribe via the sandbox checkout hook), a
  projects route owning its data (usage indicator from GetUsage, create dialog validating the SDK
  schema, locked-state rendering via the typed errors/enums i18n catalogs in BOTH locales).
- e2e: ONE spec, API-first setup, asserting the arc subscribe → create-to-limit → quota error →
  cancel (sandbox webhook) → locked. Graded by READING (complete, active assertions).

## Traps (auto-FAIL)

- Re-implementing billing/quota logic inside `project` (parallel subscription state, hand-rolled
  counters) instead of the seams above.
- `PROJECTS` declared anywhere other than the contracts wire enum.
- Wiring counters/governors inside the quota context itself instead of the merge root.
- A stubbed/commented e2e spec.
