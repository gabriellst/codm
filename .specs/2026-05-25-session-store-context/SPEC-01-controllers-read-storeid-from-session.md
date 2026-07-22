# SPEC-01: Store-scoped controllers read the active `storeId` from the session, not path params

**Wave:** 1   **Depends on:** SPEC-07 (storeId on session — code landed, status lagging)   **Status:** todo

## Motivation

SPEC-07 put an active store on the session: `tenancy/SetActiveStore` writes
`authentication.sessions.active_store_id`, better-auth surfaces it via
`additionalFields.activeStoreId`, and `AuthAccountMiddleware` maps it to
`ctx.session.storeId`. So the session now carries "which store is this user
operating on" as durable, request-independent context.

But every store-scoped controller still takes `storeId` from a `/stores/:storeId`
**path param** + a per-request `RequireStoreMember` lookup. That duplicates the
store identity (path param vs session), forces the frontend to thread `storeId`
through every URL, and predates the active-store concept. Now that the session is
the source of truth for the active store, controllers should read
`ctx.session.storeId` and drop the path param.

Example — `ConnectIntegrationController` today:

```ts
.object({
    ctx: z.object({ user: z.object({ id: z.string() }) }),
    params: z.object({ storeId: z.uuid() }),
    body: ConnectIntegrationBodySchema,
})
```

target:

```ts
.object({
    ctx: z.object({
        user: z.object({ id: z.string() }),
        session: z.object({ storeId: z.uuid() }), // the active store, from AuthAccountMiddleware
    }),
    body: ConnectIntegrationBodySchema,
})
```

…and the route drops the `/stores/:storeId` prefix (`POST /integrations`).

## Scope

1. **Controllers** — for each store-scoped controller: remove `params.storeId`
   (and the `/stores/:storeId` route prefix), add `session: { storeId }` to the
   `ctx` schema, and pass `request.ctx.session.storeId` to the use case where it
   used `request.params.storeId`.
2. **No-active-store guard** — `ctx.session.storeId` is nullable (no store
   selected). Reject with a named error (e.g. `NO_ACTIVE_STORE`, 409/400) before
   the use case rather than letting a null reach it. Decide during `/plan`
   whether the guard lives in middleware (`RequireStoreMember`) or the ctx schema.
3. **Middleware** — `RequireStoreMember` / `RequireStoreRole` validate membership
   against `ctx.session.storeId` (the active store) instead of the path param.
   This supersedes SPEC-07 §4's "keep the path param as an override" — confirm no
   cross-store/admin flow still needs an explicit per-request store override
   before removing it.
4. **Routes + SDK** — update the route table (drop `/stores/:storeId`), regenerate
   the SDK; the frontend stops passing `storeId` in URLs and relies on the active
   store (set via `SetActiveStore`).
5. **Tests** — update controller/e2e tests to seed an active store on the session
   instead of a path param.

## Affected files (store-scoped controllers — confirm exhaustively during /plan)

- **integration**: `ConnectIntegrationController`, `DisconnectIntegrationController`,
  `ToggleIntegrationActiveController`, `TriggerReintegrationController`,
  `TriggerReintegrationAllController`, `GetIntegrationsListController`,
  `GetIntegrationDetailController`
- **sales**: `GetOrdersListController`, `GetAbandonedCartsListController`,
  `UpdateOrderOverrideController`
- **catalog**: `GetProductsListController`, `CreateProductCostController`,
  `GetProductCostsListController`, `BulkImportProductCostsFromCsvController`,
  `AddProductTagController`, `RemoveProductTagController`, `GetProductTagsListController`
- **marketing**: `ReconcileMarketingAccountsController`,
  `GetCampaignProductBindingsController`, `BindCampaignToProductController`,
  `UnbindCampaignFromProductController`, `GetAdSpendBreakdownController`
- `src/auth/middlewares/AuthAccountMiddleware.ts` (already exposes `ctx.session.storeId`)
- `src/tenancy/middlewares/RequireStoreMember.ts`, `RequireStoreRole.ts`

## Open questions

- **Override path**: are there any cross-store/admin endpoints that must target a
  store other than the session's active one? If so, keep a path-param variant for
  those (don't blanket-remove).
- **GetIntegrationDetail** is keyed by `storeIntegrationId`, not `storeId` — verify
  whether it even needs the store in `ctx` post-refactor.
- Sequencing vs SPEC-07: this depends on SPEC-07 being marked done (its code has
  landed; the spec status flip is pending the concurrent runner).
