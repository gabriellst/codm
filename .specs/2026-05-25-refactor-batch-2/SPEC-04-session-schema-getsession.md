# SPEC-04: Canonical `SessionSchema` + simpler `GetSession`

**Wave:** 2   **Depends on:** (none)   **Status:** done

## Motivation

There is no shared `SessionSchema` in this repo. Each consumer re-describes the auth context ad hoc:

- `GetSession` (`src/auth/controllers/GetSession.ts:18-38`) returns a bespoke `{ user: { id, email, name, emailVerified }, account: { id, providerId } | null }`.
- `AuthAccountMiddleware` attaches a flat `session: { userId, email, name }` (SPEC-05).
- `RequireStoreMember` casts `request.ctx as { session?: { userId?: string } }` (SPEC-06).
- ~61 controllers each inline `ctx: z.object({ session: z.object({ userId: z.string() }) })`.

The medscall reference defines one `SessionSchema` shaped `{ session: {...}, user: {...} }` and everything reads from it. We want the same single source so the session shape is defined once and consumed everywhere.

## Scope

1. Create a canonical **`SessionSchema`** in `src/shared/schemas/` (shared because auth, tenancy, and every controller read it):

   ```ts
   export const SessionSchema = z.object({
     user: z.object({
       id: z.string(),
       email: z.string(),
       name: z.string().nullable(),
       emailVerified: z.boolean(),
     }),
     session: z.object({
       id: z.string(),
       userId: z.uuid(),
       expiresAt: z.coerce.date(),
       // storeId added in SPEC-07
     }),
   })
   export type Session = z.infer<typeof SessionSchema>
   ```

   Shape deliberately mirrors the medscall reference (`{ user, session }`) so SPEC-05/06/07 can build on it.
2. Rewrite `GetSession` to return the `SessionSchema` (or a thin slice of it) and nothing more — drop the bespoke `account` block unless a real consumer needs it (check the frontend SDK usage; if `account` is unused, remove it). The controller body should be: read the better-auth session, parse into `SessionSchema`, return.
3. Export `SessionSchema` from the shared schemas barrel so middlewares + controllers import one symbol.

## Affected files

- `src/shared/schemas/SessionSchema.ts` — NEW
- `src/shared/schemas/index.ts` — export it
- `src/auth/controllers/GetSession.ts` — return `SessionSchema`; simplify body
- Regenerate SDK (`bun sdk`) so the frontend `useGetSession` picks up the new output type

## Acceptance criteria

- [ ] `SessionSchema` exists in `src/shared/schemas/`, shaped `{ user, session }`.
- [ ] `GetSession` output is `SessionSchema` (or an explicit subset), with the manual `account` shape removed unless a consumer is shown to need it.
- [ ] `bun sdk` regenerates; frontend `tsc` (if it consumes the session) stays green or the breakage points are listed for SPEC-05.
- [ ] `bun tsc` clean; `bun run test` clean.

## Out of scope

- Middleware changes (SPEC-05) and the cast removal (SPEC-06) — they consume this schema.
- Persisting `storeId` (SPEC-07) — this spec leaves a comment placeholder for the `session.storeId` field.
- Better-auth config changes.

## Notes

- This is the keystone of the Wave-2 session stream: define the shape here, then 05 (middleware emits it), 06 (middleware parses it), 07 (adds `storeId`).
- Check `packages/app/**` for `useGetSession` / session consumers before deleting `account` — if the app reads `account.providerId`, keep it; otherwise drop it (the motivation is "much simpler").
- Put it in `src/shared/schemas/` (created by the in-flight schema relocation), not `auth/` — tenancy middlewares and ~61 controllers import it, so a context-local home would invert the dependency direction.
