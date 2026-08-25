# Eval corpus premise audit — 50 tasks vs HEAD (v1.9)

Date: 2026-07-21 · HEAD at audit: 7dae52a02 · Method: 50 parallel premise auditors (sonnet) + adversarial
verifiers (opus) on every STALE claim, cross-checked against empirical wave-1 runs and the replay baseRef mechanism.

## Verdict resolution policy (strongest evidence wins)

1. **Empirical**: a wave-1 run at HEAD (PASS → OK; builder premise-refusal → STALE).
2. **Mechanism**: `replay-*` tasks pin `baseRef`; run.ts:742 checks out that ref into a throwaway worktree —
   the builder NEVER sees HEAD. Surfaces stripped at HEAD are irrelevant for them.
3. **Verify consensus**: audit + adversarial verify agreeing.
4. Conflicting verifies with no empirical data → OK* (watch first run).

## Result: 30 runnable · 20 stale (amended after wave-1 completed)

### Runnable (30)

- `holdout-lending-loan-aggregate` — CONFLICT between verifies — refutation cites concrete live surfaces; watch first run *(conflict-resolved — watch first run)*
- `holdout-library-genre-dashboard` — audit: presupposed surfaces live at HEAD
- `holdout-loans-route-status-filter` — audit: presupposed surfaces live at HEAD
- `replay-connect-integration-variant-forms` — replay task pins baseRef; harness builds at that ref, never HEAD
- `replay-fees-taxes-timeline-model` — replay task pins baseRef; harness builds at that ref, never HEAD
- `replay-integration-webhook-register` — replay task pins baseRef; harness builds at that ref, never HEAD
- `replay-internal-subscriptions-store-link` — replay task pins baseRef; harness builds at that ref, never HEAD
- `replay-pixel-funnel-section` — audit: presupposed surfaces live at HEAD
- `replay-product-cost-values-timeline` — replay task pins baseRef; harness builds at that ref, never HEAD
- `replay-statcard-shared-component` — audit: presupposed surfaces live at HEAD
- `synthetic-astro-landing-section` — audit: presupposed surfaces live at HEAD
- `synthetic-expo-notifications-screen` — audit: presupposed surfaces live at HEAD
- `synthetic-l3-debugging` — audit: presupposed surfaces live at HEAD
- `synthetic-l3-review-judgment` — verify refuted the stale claim
- `synthetic-l4-clarification` — audit: presupposed surfaces live at HEAD
- `synthetic-l4-planning` — verify refuted the stale claim
- `synthetic-l4-specification` — audit: presupposed surfaces live at HEAD
- `synthetic-l5-goal-adherence` — audit: presupposed surfaces live at HEAD
- `synthetic-l5-learnings-meta` — audit: presupposed surfaces live at HEAD
- `synthetic-l6-clickup` — audit: presupposed surfaces live at HEAD
- `synthetic-l6-mini-kanban` — audit: presupposed surfaces live at HEAD
- `synthetic-l6-mobile-habit-tracker` — CONFLICT between verifies — refutation cites concrete live surfaces; watch first run *(conflict-resolved — watch first run)*
- `synthetic-l6-notion` — audit: presupposed surfaces live at HEAD
- `synthetic-l6-saas-gating` — audit: presupposed surfaces live at HEAD
- `synthetic-notifications-panel` — audit: presupposed surfaces live at HEAD
- `synthetic-order-detail-read` — wave-1 PASS at HEAD overrides verify debate
- `synthetic-react-onboarding-composed-form` — wave-1 PASS at HEAD overrides verify debate
- `synthetic-react-primitive-variant` — audit: presupposed surfaces live at HEAD
- `synthetic-store-visualization-event` — wave-1 PASS at HEAD overrides verify debate
- `synthetic-react-table-route-search` — EMPIRICAL AMENDMENT: wave-1 builder PASSED at HEAD (found a live surface for the composed-search bundle); the CONFIRMED_STALE verdict was wrong

### Stale (20) — proposal per task

| Task | Fix | Detail |
|---|---|---|
| `feature-coupon-aggregate` | rewrite | Re-target the coupon aggregate onto a LIVE owner-scoped context instead of the deleted Sales BC. The task measures aggregate DDD discipline (axes CLASS-BASE, VALIDATION-PLACEMENT, OPTIONALITY, TELL-DONT-ASK, ERR-VOCAB, EVENT-EMISSION, TRANSACTION, ID-REPR) — none of that is Sales-specific, so it transplants cleanly. Host it in the live billing/ context (full BC at src/billing/ with entities/enums/ |
| `feature-pause-slice-wiring` | **manual** (verify output degenerate) | test |
| `synthetic-be-di-test-mode` | rewrite | The task has TWO independent staleness defects; seeding alone cannot fix both, so a rewrite is required. (1) TABLE — restore the legacy notifications.push_devices table so PGlite integration tests see it. Add to packages/contracts/db/schema/notifications.ts a `pushDevices = notificationsSchema.table('push_devices', {...})` with the exact legacy columns the prompt/judge assume: id uuid PK defaultRa |
| `synthetic-be-projection-digest` | seeds | Re-base the eval onto the last revision where the finance BC is live and green rather than re-authoring the richly-grounded probe. Concretely: set the task's baseRef (currently "") to 7f54066df (parent of the strip commit 369fb8985, 'chore: scoreboard checkpoint before clean-branch work'). At that ref the full presupposed surface exists exactly as the prompt describes: src/finance/events/{Operatio |
| `synthetic-be-wire-exposure` | rewrite | Re-target the slice from the deleted finance context onto the LIVE billing context under the ownerId tenancy convention — this preserves every axis the eval measures (wire-exposure, schema-derive money, validation-placement, err-vocab, event-emission, transaction, name-consistency) because all the required primitives survive at HEAD in billing/shared. Prefer rewrite over seeds: seeding would have  |
| `synthetic-e2e-notifications-flow` | rewrite | Re-target the task at the LIVE surfaces; seeds cannot help because seeding cannot un-real the ListNotifications read (claim 1) nor un-exist 05-notification-inbox.spec.ts (claim 2) — it could only patch claim 3, leaving the mock rationale dead. Three edits preserve the measured axes (E2E-DISCIPLINE, SDK-CONSUME, DATA-OWNERSHIP, NAME-CONSISTENCY):  (1) Drop the 'ListNotifications is a faker stub' pr |
| `synthetic-expo-form-state-subscribe` | seeds | Seed the pre-strip generated kit SDK slice into packages/client/dist/typescript/src/typescript so the frontend-only probe can consume it exactly as the prompt presupposes (the task already forbids regenerating the SDK, so a pre-existing generated dist is the aligned fix — no backend needed). Restore from the pre-strip SDK at/near docTreeHash 46468161d9ca (i.e. the parent of the strip commits fbf54 |
| `synthetic-fullstack-crud-realtime` | rewrite | Re-target the task's tenancy noun from the dead 'store' model onto the LIVE ownerId + RequireOwner convention; every other layer the probe measures (contracts -> api-ts procurement context -> api-go handler -> react live list -> e2e) is unaffected and buildable at HEAD, so this preserves the full compound cross-layer canon (DISC-UNION, EVENT-EMISSION, TRANSACTION, real-time SSE invalidation, NAME- |
| `synthetic-fullstack-handoff` | seeds | Re-harvest phases-1-3.patch against current v1.9 HEAD so its base-diff blobs match and its tenancy axis is ownerId, not storeId. Concretely, regenerate the seeded 'agent A' backend fixture — contracts (purchase-order-recorded integration event, PurchaseOrderStatus enum DRAFT/PLACED/CANCELLED, purchase_orders table + migration, both-language wire bindings), the TS `procurement` bounded context (ent |
| `synthetic-fullstack-plan` | seeds | Regenerate the seed patch against HEAD. |
| `synthetic-go-consumer-slice` | seeds | Add scripts/skill-evals/seeds/synthetic-go-consumer-slice/ (and a seeds field on the task yaml) that restores the exact measured surface before the builder runs, sourced from the strip-parent commit b157ceee8^ which still carries the intact sync context. Seed contents (Go-only, matching the task's 'do not touch contracts/TS' constraint): (a) packages/api/go/internal/sync/ subtree from b157ceee8^ — |
| `synthetic-go-controller-summary` | seeds | Reinject the pre-strip Go `sync` context so the builder has the sibling/enum/repo/module it is told to mirror and extend. Source everything from the parent of the strip commit, b157ceee8^ (i.e. `git show b157ceee8^:<path>`), restoring under packages/api/go/internal/sync/: controllers/list_sync_jobs.go and controllers/get_sync_status.go (sibling exemplars — Metadata/request/response/registration sh |
| `synthetic-go-entity-retry` | seeds | Add a seedCommands block to synthetic-go-entity-retry.yaml that restores a compilable slice of the pre-strip internal/sync context from commit b157ceee^ BEFORE the builder runs, e.g. `git checkout b157ceee^ -- packages/api/go/internal/sync/entities/sync_job.go packages/api/go/internal/sync/entities/sync_job_test.go packages/api/go/internal/sync/enums/sync_status.go packages/api/go/internal/sync/re |
| `synthetic-go-projector-activity` | rewrite | Re-target the probe at the LIVE tree; do NOT seed. Seeding would require restoring the whole stripped e-commerce sync module + store/third-party-integration domain AND adding IntegrationActivated/Deactivated events to packages/contracts — which the task itself forbids ('do not touch packages/contracts') and which contradicts the repo's permanent strip-to-generic-boilerplate direction. Rewrite pres |
| `synthetic-l3-brownfield` | rewrite | Re-target the brownfield edit at a LIVE aggregate instead of resurrecting the purged finance context. The probe measures 6 axes (BROWNFIELD-EDIT, OPTIONALITY, VALIDATION-PLACEMENT, NON-BREAKING-CONTRACT, SDK-PROPAGATION, REGRESSION-GREEN) — all content-agnostic; the finance/OperationalCost/vendorName specifics are incidental. Best live target: the `owner` context, which at HEAD has the identical s |
| `synthetic-l3-contract-evolution` | rewrite | Re-target the probe at the ONLY live frozen wire event at HEAD: integration.billing.subscription_changed (TypeSpec source packages/contracts/wire/events/billing-subscription-changed.tsp → generated Go struct SubscriptionChangedEvent in packages/contracts/generated/go/wire/events.go + generated TS packages/contracts/generated/typescript/src/wire/events/subscription-changed.ts). This preserves EXACT |
| `synthetic-l5-handoff-continuity` | rewrite | Re-target the L5 handoff-continuity probe at a LIVE bounded context; do NOT try to resurrect the 8 stripped e-commerce contexts (a seeds fix would have to re-inject the whole Sales BC — registry.ts, controllers/index.ts, handlers/ with a green suite, the full OrderOverride entity/event/repository/usecase/controller slice, AND contracts/db/schema/sales.ts registered in schema/index.ts, all re-wired |
| `synthetic-react-dashboard-chart` | seeds | Seed the pre-strip GetChart generated SDK subtree (frontend-only task — the SDK is a self-contained generated client, so seeding the TS files makes tsc green without any backend). Source everything from commit 944942989 (last commit carrying the full BFF-read family, before the fbf54aa42/b157ceee8/9edaa8186 strip). Files to inject into the harness workspace before the builder runs: (1) packages/cl |
| `synthetic-react-state-placement` | rewrite | Re-target the probe onto LIVE generic domains that survive de-templating (billing/invoices + notifications + owner), preserving all eight measured axes; the analytics/goal domain it currently presupposes was intentionally stripped, so seeding it back would re-inject product residue and require regenerating/committing a matching SDK dist (huge, brittle, and against the template's de-templated inten |
| `synthetic-react-storybook-data-component` | seeds | Add scripts/skill-evals/seeds/synthetic-react-storybook-data-component/ (or a seeds/inject field in the task YAML) that transiently restores the pre-strip slice from commit f051b8f96^ before the builder runs — this is the only fix that preserves ALL four axes (STORYBOOK-DATA-COMPONENT, MSW, GIVEN-STORES, I18N-PREVIEW); notably the unique GIVEN-STORES axis, which the surviving ProfileFormSection.st |

## Missing-surface summary (what the stale tasks presuppose)

- `feature-coupon-aggregate`: context: packages/api/typescript/src/sales/; file: OrderOverride entity/use case; file: packages/contracts/db/schema/sales.ts
- `feature-pause-slice-wiring`: context: SubscriptionTransition enum; event: SubscriptionPausedEvent; file: ExternalSubscriptionUpdatedEvent / ExternalSubscriptionUpdatedHandler
- `synthetic-be-di-test-mode`: db-table: notifications.push_devices table; context: src/identity/entities/FcmRegistrationToken.ts, src/identity/usecases/RegisterFcmToken.ts, and the 'identity' bounded context generally; other: DI-REG grader conventio
- `synthetic-be-projection-digest`: context: packages/api/typescript/src/finance/; event: finance domain events OperationalCostCreated/Updated/Deleted, WarrantyReserveCreated/Updated/Deleted, OperationalCostStatusOverridden, Taxes/Fees/FxRate events;
- `synthetic-be-wire-exposure`: context: finance bounded context; file: src/finance/entities/WarrantyReserve.ts and usecases/controllers/CreateWarrantyReserve; file: src/finance/entities/OperationalCost.ts and usecases/CreateOperationalCost.ts
- `synthetic-e2e-notifications-flow`: context: ListNotifications is a faker-backed stub whose body does not reflect writes; file: packages/e2e/tests/05-notification-inbox.spec.ts — pre-existing real; other: an email-notifications switch/control in th
- `synthetic-expo-form-state-subscribe`: sdk-hook: SDK hooks/schemas: useCreateKit, createKitMutationRequestSchema, listKitsQueryKey, useListProductsForKit, ProductCostTypeEnum, QuantityModifierEnum; context: 'Kit'/'Product' bounded context
- `synthetic-fullstack-crud-realtime`: other: storeId tenancy model / RequireStoreMember middleware; file: ListenEvents.ts BROWSER_EVENTS union; file: packages/contracts/db/schema/finance.ts
- `synthetic-fullstack-handoff`: other: seedCommands git-apply of scripts/skill-evals/seeds/synthetic-fullstack-handoff/phases-1-3.patch; file: packages/api/go/internal/sync/module.go; other: storeId-scoped tenancy model presupposed by the seed patch
- `synthetic-fullstack-plan`: other: seedCommands patch; context: TS `procurement` bounded context; file: Go `internal/sync` consumer module
- `synthetic-go-consumer-slice`: file: packages/api/go/internal/sync/; sdk-hook: wire.IntegrationDeactivatedIntegrationEvent / wire.IntegrationDeactivatedIntegrationEventName; context: TS 'Integration' bounded context publishing integration.shared.in
- `synthetic-go-controller-summary`: file: internal/sync/controllers/list_sync_jobs.go; file: internal/sync/enums/sync_status.go; file: internal/sync/repositories/syncjob/
- `synthetic-go-entity-retry`: file: internal/sync/entities/sync_job.go; file: internal/sync/entities/sync_job_test.go; file: internal/sync/usecases/
- `synthetic-go-projector-activity`: file: packages/api/go/internal/sync/; file: packages/api/go/internal/sync/repositories/syncjob/; event: wire.IntegrationActivatedIntegrationEvent / wire.IntegrationDeactivatedIntegrationEvent
- `synthetic-l3-brownfield`: context: packages/api/typescript/src/finance/; file: src/finance/entities/OperationalCost.ts; file: src/finance/usecases/CreateOperationalCost.ts, UpdateOperationalCost.ts, and OperationalCost.test.ts
- `synthetic-l3-contract-evolution`: file: packages/contracts/wire/events/pixel-event-recorded.tsp; file: packages/contracts/generated/typescript/src/wire/events/pixel-event-recorded.ts; file: packages/contracts/generated/go/wire/events.go — PixelEve
- `synthetic-l5-handoff-continuity`: context: packages/api/typescript/src/sales; file: OrderOverride slice in src/sales/; db-table: packages/contracts/db/schema/sales.ts
- `synthetic-react-dashboard-chart`: sdk-hook: GetChart BFF read endpoint / types/GetChart.ts; sdk-hook: ChartType / ChartTypeEnum / chartTypeSchema / getChartQueryParamsSchema / useGetChart exports from @template/client-typescript/typescript; sdk-ho
- `synthetic-react-state-placement`: context: Backend analytics/goal bounded context; sdk-hook: SDK hooks/schemas/enums: useGetChart, getChartQueryParamsSchema, useListQuickProductRanking, listQuickProductRankingQueryParamsSchema, useGetGoal, useCrea
- `synthetic-react-storybook-data-component`: file: packages/app/react/src/routes/; sdk-hook: useListCostCountries; context: useProductCostsStore
- `synthetic-react-table-route-search`: route: Backend endpoint GET /v1/ui/products/ad-campaigns; sdk-hook: SDK hook useListProductAdCampaigns; sdk-hook: SDK schema listProductAdCampaignsQueryParamsSchema

## Decisions needed (user)

- Rewrites change what an eval measures — each of the 14 rewrite proposals needs sign-off before editing task yamls.
- Seeds proposals (13) are premise-restoring and measurement-preserving; they can be batched once approved as a class.
- `feature-pause-slice-wiring`: verify output was degenerate; needs a manual proposal.
- The 2 OK* tasks (holdout-lending-loan-aggregate, synthetic-l6-mobile-habit-tracker) should be watched on their first live run.

## Empirical postscript (wave-1 final, 10/10 rows)

6 PASS: order-detail-read, store-visualization-event, notifications-panel, react-onboarding-composed-form,
react-primitive-variant, react-table-route-search. 4 FAIL, all stale-premise builder refusals matching this
audit: be-di-test-mode, be-projection-digest, react-dashboard-chart, react-state-placement.
Audit-vs-reality scorecard on the 10 empirically-run tasks: 8 agreed; 2 audit errors, BOTH in the
false-STALE direction (onboarding-composed-form, table-route-search) — the corpus audit under-estimates
builder resourcefulness against live surfaces, never the reverse. Treat rewrite/seeds proposals for
un-run tasks as upper bounds on staleness.
