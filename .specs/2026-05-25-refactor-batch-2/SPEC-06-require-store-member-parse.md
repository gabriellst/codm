# SPEC-06: `RequireStoreMember` parses the session instead of casting

**Wave:** 2   **Depends on:** SPEC-04, SPEC-05   **Status:** done

## Motivation

`RequireStoreMember` reaches into the request context with wide `as` casts:

```ts
// src/tenancy/middlewares/RequireStoreMember.ts:24,28
const userId = (request.ctx as { session?: { userId?: string } } | undefined)?.session?.userId
const storeId =
  (request.params as { storeId?: string } | undefined)?.storeId ??
  (request.body as { storeId?: string } | undefined)?.storeId
```

`RequireStoreRole` (`:24`) casts the same way for `membership.role`. Casts bypass validation and drift from the real session shape. The `/middleware` skill prescribes parsing `request.ctx` with a Zod schema and throwing a typed `BaseError` on failure (the user supplied the target `AuthActorMiddleware` pattern as the reference).

## Scope

1. In `RequireStoreMember`, define a local `CtxSchema` derived from `SessionSchema` and `safeParse` `request.ctx`; throw `BaseError('STORE_MEMBERSHIP_NOT_FOUND')` (or `'UNAUTHORIZED'`) on failure rather than optional-chaining a cast:

   ```ts
   const CtxSchema = z.object({ user: z.object({ id: z.string() }) })
   const ctx = CtxSchema.safeParse(request.ctx)
   if (!ctx.success) throw new BaseError<ApplicationErrors>('UNAUTHORIZED')
   const userId = ctx.data.user.id
   ```
2. Parse `storeId` from params/body with a small Zod schema too (no `as`). Keep the membership lookup + the `request.ctx.membership = {...}` attachment.
3. Apply the same parse-don't-cast treatment to `RequireStoreRole` for the `membership.role` read.

## Affected files

- `src/tenancy/middlewares/RequireStoreMember.ts`
- `src/tenancy/middlewares/RequireStoreRole.ts`

## Acceptance criteria

- [ ] No `as` casts on `request.ctx` / `request.params` / `request.body` in `RequireStoreMember` or `RequireStoreRole` (grep `request.ctx as`, `request.params as`, `request.body as` in tenancy middlewares → zero).
- [ ] Both middlewares `safeParse` their inputs and throw a typed `BaseError` on parse failure.
- [ ] Existing tenancy middleware tests pass; add a case asserting a malformed ctx throws the typed error.
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- `storeId` provenance change (SPEC-07) — this spec keeps the current params/body source; if SPEC-07 lands first, read `session.storeId` instead and note it.
- Changing the membership lookup logic or the `membership` ctx shape.

## Notes

- Depends on the `SessionSchema` shape from SPEC-04 and the middleware emitting it (SPEC-05) so the parse target matches reality.
- Reuse `SessionSchema.pick({ user: true })` or a derived sub-schema rather than re-declaring `{ user: { id } }` if convenient — one source of truth.
- The user's reference `AuthActorMiddleware` (medscall) is the canonical shape: parse a `CtxSchema`, fail fast with `UNAUTHORIZED`, then do the domain lookup.
