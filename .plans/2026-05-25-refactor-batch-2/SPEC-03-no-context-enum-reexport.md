# SPEC-03: No bounded context re-exports wire enums — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in a RED→GREEN cycle where applicable. Keep `bun tsc` green
> after every commit.

**Goal:** Delete the wire-enum re-export blocks from `sales/enums/index.ts`, `marketing/enums/index.ts`, and `billing/enums/index.ts`; repoint the two consumers that import wire enums via the context barrel (`marketing/entities/AdSpend.ts`, `marketing/entities/Campaign.ts`) to import directly from `@template/contracts-typescript/wire/enums`; delete any barrel that becomes empty and drop its re-export from the context index. Every other consumer in these three contexts already imports directly from the wire package and requires no change.

**Architecture:** Pure delete-and-repoint refactor. No new files. After SPEC-02 lands the `…Schema` symbols these barrels re-export will no longer exist — this task removes the re-export blocks so the barrels compile again (or are deleted if empty). No runtime behavior changes.

**Tech Stack:** TypeScript + Bun (packages/api/typescript/)

**Spec:** .specs/2026-05-25-refactor-batch-2/SPEC-03-no-context-enum-reexport.md

**Tasks:** 4

**Estimated minutes:** 25

> **Planner note — consumer audit.** A full grep of `src/` confirms that the only two files routing wire-enum imports through a context barrel are `marketing/entities/AdSpend.ts` (imports `MarketingPlatform`, `MarketingPlatformSchema`, `AdSpendType`, `AdSpendTypeSchema`, `AdSpendGroupBy`, `AdSpendGroupBySchema`, `CurrencyCode`, `CurrencyCodeSchema` from `../enums`) and `marketing/entities/Campaign.ts` (imports `MarketingPlatformSchema`, `CampaignStatusSchema` from `../enums`). All other files in sales, billing, and marketing already use `@template/contracts-typescript/wire/enums` directly.

> **Planner note — barrel fate.** After removing the wire re-export blocks: `sales/enums/index.ts` becomes empty (no domain-local enums) → delete the file + drop `export * from './enums'` from the sales context index if present. `marketing/enums/index.ts` becomes empty → same treatment. `billing/enums/index.ts` becomes empty → same treatment. None of the three context top-level `index.ts` files export `* from './enums'` today (confirmed: they use `BoundedContext.create` with `controllers`/`internalHandlers`/`externalHandlers` — no enum barrel re-export), so no context index changes are needed.

> **Planner note — placeholder barrels unaffected.** `auth/enums/index.ts` re-exports local `UserRole` — untouched. `notifications/enums/index.ts` and `ui/enums/index.ts` are empty placeholder comments — untouched (SPEC-17 removes `ui`; notifications is a placeholder).

---

## Task 1: Remove wire re-export block from `sales/enums/index.ts` and delete the file

**Files:**
- Delete: `packages/api/typescript/src/sales/enums/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum
**Depends on:** (none)

- [ ] **Step 1: Confirm no domain-local enums in the barrel**

  Read `packages/api/typescript/src/sales/enums/index.ts`. The file contains only:
  ```
  export { PaymentStatus, PaymentStatusSchema, PaymentMethod, PaymentMethodSchema,
           PaymentGateway, PaymentGatewaySchema, TransactionKind, TransactionKindSchema,
           TransactionStatus, TransactionStatusSchema, DisputeStatus, DisputeStatusSchema,
           OrderTransactionFeeType, OrderTransactionFeeTypeSchema, SalesPlatform, SalesPlatformSchema,
           CurrencyCode, CurrencyCodeSchema, PixelEventType, PixelEventTypeSchema }
  from '@template/contracts-typescript/wire'
  ```
  All 10 enums are wire enums (generated under `packages/contracts/generated/typescript/src/wire/enums/`). No domain-local enum files exist under `src/sales/enums/`. The entire barrel is wire re-exports — delete the whole file.

- [ ] **Step 2: Confirm no consumer routes through this barrel**

  Run:
  ```bash
  grep -rn "from '\.\./enums'\|from '\.\/enums'\|sales/enums" \
    packages/api/typescript/src/sales --include="*.ts"
  ```
  Expected: zero matches (all sales files already import from `@template/contracts-typescript/wire` or `@template/contracts-typescript/wire/enums` directly).

- [ ] **Step 3: Delete the file**

  ```bash
  git rm packages/api/typescript/src/sales/enums/index.ts
  ```

- [ ] **Step 4: Verify `bun tsc` clean**

  Run: `cd packages/api/typescript && bun tsc --noEmit`
  Expected: 0 errors.

  If the `enums/` directory is now empty, also remove it:
  ```bash
  rmdir packages/api/typescript/src/sales/enums 2>/dev/null || true
  ```

- [ ] **Step 5: Commit**

  ```bash
  git commit -m "refactor(sales): delete wire-enum re-export barrel (SPEC-03 Task 1)"
  ```

---

## Task 2: Remove wire re-export block from `billing/enums/index.ts` and delete the file

**Files:**
- Delete: `packages/api/typescript/src/billing/enums/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum
**Depends on:** (none — independent of Task 1)

- [ ] **Step 1: Confirm no domain-local enums in the barrel**

  Read `packages/api/typescript/src/billing/enums/index.ts`. The file contains only:
  ```
  export { PlanTier, PlanTierSchema, PlanPeriod, PlanPeriodSchema,
           BillingPlatform, BillingPlatformSchema, PlanFeature, PlanFeatureSchema,
           SubscriptionEventType, SubscriptionEventTypeSchema }
  from '@template/contracts-typescript/wire/enums'
  ```
  All 5 enums are wire enums. No domain-local enum files exist under `src/billing/enums/`. Delete the whole file.

- [ ] **Step 2: Confirm no consumer routes through this barrel**

  Run:
  ```bash
  grep -rn "from '\.\./enums'\|from '\.\/enums'\|billing/enums" \
    packages/api/typescript/src/billing --include="*.ts"
  ```
  Expected: zero matches (all billing files already import from `@template/contracts-typescript/wire/enums` directly).

- [ ] **Step 3: Delete the file**

  ```bash
  git rm packages/api/typescript/src/billing/enums/index.ts
  ```

- [ ] **Step 4: Verify `bun tsc` clean**

  Run: `cd packages/api/typescript && bun tsc --noEmit`
  Expected: 0 errors.

  If the `enums/` directory is now empty, also remove it:
  ```bash
  rmdir packages/api/typescript/src/billing/enums 2>/dev/null || true
  ```

- [ ] **Step 5: Commit**

  ```bash
  git commit -m "refactor(billing): delete wire-enum re-export barrel (SPEC-03 Task 2)"
  ```

---

## Task 3: Repoint `marketing/entities/` consumers; remove wire re-export block and delete `marketing/enums/index.ts`

**Files:**
- Modify: `packages/api/typescript/src/marketing/entities/AdSpend.ts` — repoint `../enums` import to `@template/contracts-typescript/wire/enums`
- Modify: `packages/api/typescript/src/marketing/entities/Campaign.ts` — repoint `../enums` import to `@template/contracts-typescript/wire/enums`
- Delete: `packages/api/typescript/src/marketing/enums/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /entity
**Depends on:** (none — independent of Tasks 1–2)

- [ ] **Step 1: Repoint `AdSpend.ts`**

  In `packages/api/typescript/src/marketing/entities/AdSpend.ts`, replace the import that reads:
  ```ts
  import {
    MarketingPlatform,
    MarketingPlatformSchema,
    AdSpendType,
    AdSpendTypeSchema,
    AdSpendGroupBy,
    AdSpendGroupBySchema,
    type CurrencyCode,
    CurrencyCodeSchema,
  } from '../enums'
  ```
  with:
  ```ts
  import {
    MarketingPlatform,
    MarketingPlatformSchema,
    AdSpendType,
    AdSpendTypeSchema,
    AdSpendGroupBy,
    AdSpendGroupBySchema,
    type CurrencyCode,
    CurrencyCodeSchema,
  } from '@template/contracts-typescript/wire/enums'
  ```

  Note: after SPEC-02, `…Schema` symbols will be removed — but SPEC-03 runs after SPEC-02 and only the re-export block goes here. If running before SPEC-02, leave `…Schema` references as-is; they remain valid until SPEC-02 lands. This task's sole concern is eliminating the routing through `../enums`.

- [ ] **Step 2: Repoint `Campaign.ts`**

  In `packages/api/typescript/src/marketing/entities/Campaign.ts`, replace:
  ```ts
  import { MarketingPlatformSchema, CampaignStatusSchema } from '../enums'
  ```
  with:
  ```ts
  import { MarketingPlatformSchema, CampaignStatusSchema } from '@template/contracts-typescript/wire/enums'
  ```

- [ ] **Step 3: Confirm no remaining consumer routes through the marketing barrel**

  Run:
  ```bash
  grep -rn "from '\.\./enums'\|from '\.\/enums'\|marketing/enums" \
    packages/api/typescript/src/marketing --include="*.ts"
  ```
  Expected: zero matches.

- [ ] **Step 4: Confirm no domain-local enums in the barrel**

  Read `packages/api/typescript/src/marketing/enums/index.ts`. The file contains only:
  ```
  export { MarketingPlatform, MarketingPlatformSchema, CampaignStatus, CampaignStatusSchema,
           AdSpendType, AdSpendTypeSchema, AdSpendGroupBy, AdSpendGroupBySchema,
           CurrencyCode, CurrencyCodeSchema }
  from '@template/contracts-typescript/wire'
  ```
  All 5 enums are wire enums. No domain-local enum files exist under `src/marketing/enums/`. Delete the whole file.

- [ ] **Step 5: Delete the file**

  ```bash
  git rm packages/api/typescript/src/marketing/enums/index.ts
  ```

- [ ] **Step 6: Verify `bun tsc` clean + tests pass**

  Run: `cd packages/api/typescript && bun tsc --noEmit`
  Expected: 0 errors.

  Run: `cd packages/api/typescript && bun test src/marketing/`
  Expected: all tests pass.

  If the `enums/` directory is now empty, also remove it:
  ```bash
  rmdir packages/api/typescript/src/marketing/enums 2>/dev/null || true
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add packages/api/typescript/src/marketing/entities/AdSpend.ts \
          packages/api/typescript/src/marketing/entities/Campaign.ts
  git commit -m "refactor(marketing): repoint entity enum imports to wire; delete re-export barrel (SPEC-03 Task 3)"
  ```

---

## Task 4: Verification — zero wire re-exports inside any context enum barrel

**Files:** (none modified)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum
**Depends on:** 1, 2, 3

- [ ] **Step 1: Run the acceptance-criteria grep**

  Run:
  ```bash
  grep -rn "export {" packages/api/typescript/src/*/enums/index.ts \
    --include="*.ts" 2>/dev/null | \
    grep "@template/contracts-typescript/wire"
  ```
  Expected: **zero matches** — no `export { … } from '@template/contracts-typescript/wire'` or `/wire/enums` inside any `src/<ctx>/enums/index.ts`.

  Also confirm no stray relative re-exports remain:
  ```bash
  grep -rn "from '\.\./enums'\|from '\.\/enums'" \
    packages/api/typescript/src/sales \
    packages/api/typescript/src/marketing \
    packages/api/typescript/src/billing \
    --include="*.ts"
  ```
  Expected: **zero matches**.

- [ ] **Step 2: Full type-check**

  Run: `cd packages/api/typescript && bun tsc --noEmit`
  Expected: 0 errors.

- [ ] **Step 3: Affected test suites**

  Run: `cd packages/api/typescript && bun test src/sales/ src/marketing/ src/billing/`
  Expected: all tests pass.

- [ ] **Step 4: Verify auth/enums and placeholder barrels are untouched**

  ```bash
  cat packages/api/typescript/src/auth/enums/index.ts
  ```
  Expected: still exports `UserRole` from `./UserRole`.

  ```bash
  cat packages/api/typescript/src/notifications/enums/index.ts
  cat packages/api/typescript/src/ui/enums/index.ts
  ```
  Expected: still empty placeholder comments (unmodified).
