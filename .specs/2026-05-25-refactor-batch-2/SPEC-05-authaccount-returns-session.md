# SPEC-05: `AuthAccountMiddleware` attaches the `SessionSchema` shape

**Wave:** 2   **Depends on:** SPEC-04   **Status:** done

## Motivation

`AuthAccountMiddleware` currently attaches a flat, lossy session to the request context:

```ts
// src/auth/middlewares/AuthAccountMiddleware.ts:37-44
request.ctx = {
  ...request.ctx,
  session: { userId: validated.data.user.id, email: ..., name: ... },
}
```

So ~61 controllers read `request.ctx.session.userId` and each re-declares `ctx: z.object({ session: z.object({ userId: z.string() }) })`. The id lives at `session.userId` rather than the canonical `session.user.id`. We want the middleware to attach the full `SessionSchema` shape (SPEC-04) so controllers read `session.user.id` from one agreed structure.

## Scope

1. Change `AuthAccountMiddleware.execute` to attach the **`SessionSchema`** shape to `request.ctx`:

   ```ts
   request.ctx = {
     ...request.ctx,
     user: session.user,          // { id, email, name, emailVerified }
     session: session.session,    // { id, userId, expiresAt, … }
   }
   ```

   (Match the exact field layout `SessionSchema` defines in SPEC-04 — `{ user, session }`.)
2. Migrate the ~61 controllers reading `request.ctx.session.userId` to read `request.ctx.user.id` (or `session.user.id` once they parse `SessionSchema`), and update each controller's inline `ctx` input schema from `session: z.object({ userId })` to the `SessionSchema`-derived shape (`user: z.object({ id: z.string() })`).
3. Repositories that received `userId` from `ctx.session.userId` (e.g. the integration controllers) take the value from the new path.

## Affected files

- `src/auth/middlewares/AuthAccountMiddleware.ts`
- ~61 controllers across `analytics/sales/billing/marketing/catalog/finance/identity/integration/ui` that read `ctx.session.userId` (grep `ctx.session.userId`)
- The `SessionResponseSchema` local in the middleware (align it to whatever better-auth returns; reuse `SessionSchema` where possible)

## Acceptance criteria

- [ ] `AuthAccountMiddleware` attaches the `SessionSchema` shape (`{ user, session }`) to `request.ctx`.
- [ ] Zero controllers read `request.ctx.session.userId`; they read `user.id` / `session.user.id`.
- [ ] No controller inlines `session: z.object({ userId: z.string() })` — they reference the canonical session shape.
- [ ] `bun tsc` clean; `bun run test` clean (controller + middleware tests updated).

## Out of scope

- Removing `as` casts in tenancy middlewares (SPEC-06).
- `storeId` (SPEC-07).
- Changing what better-auth returns / better-auth config.

## Notes

- Depends on SPEC-04's `SessionSchema`. Do 04 → 05 → 06 in order; they touch the same context plumbing.
- The ~61-site migration is mechanical but wide — a codemod for `ctx.session.userId` → `ctx.user.id` plus the input-schema swap is appropriate. Spot-check controllers that destructure `const { userId } = request.ctx.session`.
- Keep the middleware a thin adapter: it parses better-auth's response and republishes it as `SessionSchema`. No DB lookups here (those arrive in SPEC-07 for `storeId`).
