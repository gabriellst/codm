# SPEC-07: Persist an active `storeId` on the session

**Wave:** 2   **Depends on:** SPEC-04, SPEC-05, SPEC-06   **Status:** done

## Motivation

`storeId` is not part of the session today — it comes from a path param (`/stores/:storeId/...`) plus a per-request membership lookup in `RequireStoreMember`. There is no "active store" concept and no endpoint to set one. The medscall reference persists `actorId` / `ownerId` directly on the better-auth `sessions` record and surfaces them on the session object; we want `storeId` to work the same way — a session-scoped active store that survives across requests, chosen explicitly by the user.

Today's anchors:
- `packages/contracts/db/schema/auth.ts:30-39` — `sessions` table is vanilla better-auth (no custom columns).
- `src/auth/services/Authentication/BetterAuth.ts:23-77` — better-auth init, **no** `session.additionalFields`.
- `src/auth/middlewares/AuthAccountMiddleware.ts:20-47` — calls `auth.api.getSession()`.
- `StoreMembership` has composite PK `(storeId, userId)` and a `lastAccess` field; a user holds **many** memberships.

## Scope

1. **Migration** — add `active_store_id uuid` (nullable, no FK) to `authentication.sessions`:
   - `packages/contracts/db/schema/auth.ts` — add the column.
   - `bun migrate:create` + `bun migrate:dev`.
2. **Expose it on the session** — add `storeId: z.string().nullable()` to `SessionSchema.session` (SPEC-04) and surface it from better-auth via `session.additionalFields.activeStoreId` in `BetterAuth.ts` (preferred — better-auth serialises it automatically), or via a DB read in `AuthAccountMiddleware` (medscall pattern). Resolve the mechanism during `/plan`; default to `additionalFields`.
3. **Set / switch active store** — add a `SetActiveStore` use case + controller (`POST /stores/:storeId/activate` or `PUT /session/active-store`) that:
   - verifies the user has a `StoreMembership` for the target store (reuse `StoreMembershipRepository.findByStoreAndUser`),
   - updates the session's `active_store_id` (and may bump `StoreMembership.lastAccess`),
   - returns the updated `SessionSchema`.
4. **Consume it** — `RequireStoreMember` (SPEC-06) may now read `session.storeId` as the active store when no explicit path `storeId` is present. Keep the explicit path param as an override.

## Affected files

- `packages/contracts/db/schema/auth.ts` + generated migration
- `src/auth/services/Authentication/BetterAuth.ts` — `additionalFields` (if chosen)
- `src/auth/middlewares/AuthAccountMiddleware.ts` — surface `session.storeId`
- `src/shared/schemas/SessionSchema.ts` — add `session.storeId`
- `src/tenancy/usecases/SetActiveStore.ts` + `src/tenancy/controllers/SetActiveStoreController.ts` — NEW
- `src/tenancy/middlewares/RequireStoreMember.ts` — optional active-store fallback
- Regenerate SDK (`bun sdk`)

## Acceptance criteria

- [ ] `authentication.sessions` has an `active_store_id` column (migration applies clean on a fresh DB).
- [ ] `SessionSchema.session.storeId` exists and is populated from the persisted value (null when none active).
- [ ] A `SetActiveStore` endpoint verifies membership, sets the active store, and returns the updated session; setting a store the user isn't a member of raises a typed `BaseError`.
- [ ] `GetSession` reflects the active `storeId`.
- [ ] `bun tsc` clean; `bun run test` clean (use case test asserts the membership guard); `bun sdk` regenerated.

## Out of scope

- A frontend store-switcher UI (separate frontend spec).
- Multi-store-at-once / org-level ownership (`ownerId`) — only the active `storeId` is added here.
- Backfilling existing sessions (template repo, no production data).

## Notes

- This is the heaviest Wave-2 spec (migration + better-auth config + new endpoint). It lands last in the session stream, after 04/05/06 set up the schema, the middleware shape, and the parse path.
- `additionalFields` vs DB-read: better-auth `additionalFields` keeps the middleware thin and serialises the value into `getSession()`'s response. The medscall reference uses a DB read + `customSession` plugin; pick `additionalFields` unless `/plan` finds better-auth can't carry a mutable session field cleanly.
- `active_store_id` is intentionally **not** a FK — store deletion shouldn't cascade-break sessions; a stale active store resolves to "no membership" on next guard.
