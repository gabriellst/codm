# SPEC-06: `RequireStoreMember` parses instead of casting — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Replace all `as`-casts on `request.ctx` / `request.params` / `request.body` in the tenancy middlewares with `safeParse` + typed `BaseError` throws so the session contract is enforced at runtime and drift between SPEC-04/05 and the middleware is caught immediately by Zod.

**Architecture:** Two-file surgical refactor in `src/tenancy/middlewares/`. `RequireStoreMember` gets a `CtxSchema` derived from `SessionSchema` (SPEC-04's output) to parse `request.ctx`, and a `ParamsBodySchema` to parse `storeId` from params/body. `RequireStoreRole` gets a `MembershipCtxSchema` for the membership blob stamped by `RequireStoreMember`. Both throw typed `BaseError` on parse failure. The membership lookup and `request.ctx` enrichment remain unchanged. One test file covers both middlewares.

**Tech Stack:** TypeScript + Bun, tsyringe-neo, Zod (via `@template/core-typescript`).

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-06-require-store-member-parse.md`

**Tasks:** 2

**Estimated minutes:** 25

> **Planner note — dependency on SPEC-04/05.** SPEC-04 places `SessionSchema` at `src/shared/schemas/SessionSchema.ts` (exporting `{ user, session }`). SPEC-05 changes `AuthAccountMiddleware` to attach `user: session.user` and `session: session.session` to `request.ctx`. This plan's `CtxSchema` therefore reads `user.id`, not `session.userId`. If this task runs before SPEC-04/05 merge, the `userId` path from the current `AuthAccountMiddleware` must be used temporarily — the reviewer should flag any mismatch. The plan targets the post-SPEC-05 shape.

> **Planner note — `@injectable()` vs `@singleton()`.** `RequireStoreMember` currently uses `@injectable()`. Per the middleware skill, the correct decorator is `@singleton()`. The refactor corrects this as a mandatory pattern fix (not new scope — it is a `bad_practices` violation in the registry).

---

## Task 1: `RequireStoreMember` parses `request.ctx` and `storeId` with Zod

**Files:**
- Modify: `packages/api/typescript/src/tenancy/middlewares/RequireStoreMember.ts`
- Create: `packages/api/typescript/src/tenancy/middlewares/RequireStoreMember.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /middleware
**Depends on:** (none — SPEC-04 + SPEC-05 must be merged; this task starts after them)

- [ ] **Step 1: Write the failing test**

Create `packages/api/typescript/src/tenancy/middlewares/RequireStoreMember.test.ts`:

```ts
import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { RequireStoreMember } from './RequireStoreMember'
import type { StoreMembershipRepository } from '../repositories/StoreMembershipRepository'
import type { HttpControllerRequest } from '@template/core-typescript'

// Minimal mock membership repository
function makeRepo(hit: boolean): StoreMembershipRepository {
  return {
    findByStoreAndUser: mock(async (_storeId: string, _userId: string) =>
      hit
        ? { storeId: 'store-1', userId: 'user-1', role: 'OWNER' as const }
        : null
    ),
  } as unknown as StoreMembershipRepository
}

function makeRequest(ctx: unknown, params: unknown = {}, body: unknown = {}): HttpControllerRequest<unknown> {
  return { ctx, params, body, raw: {} } as unknown as HttpControllerRequest<unknown>
}

describe('RequireStoreMember', () => {
  it('throws STORE_MEMBERSHIP_NOT_FOUND when ctx has no user', async () => {
    const mw = new RequireStoreMember(makeRepo(true))
    const req = makeRequest({ /* no user */ }, { storeId: 'store-1' })
    await expect(mw.execute(req)).rejects.toMatchObject({ name: 'STORE_MEMBERSHIP_NOT_FOUND' })
  })

  it('throws STORE_MEMBERSHIP_NOT_FOUND when ctx.user.id is missing', async () => {
    const mw = new RequireStoreMember(makeRepo(true))
    const req = makeRequest({ user: { /* no id */ } }, { storeId: 'store-1' })
    await expect(mw.execute(req)).rejects.toMatchObject({ name: 'STORE_MEMBERSHIP_NOT_FOUND' })
  })

  it('throws STORE_MEMBERSHIP_NOT_FOUND when no storeId in params or body', async () => {
    const mw = new RequireStoreMember(makeRepo(true))
    const req = makeRequest({ user: { id: 'user-1' } }, {}, {})
    await expect(mw.execute(req)).rejects.toMatchObject({ name: 'STORE_MEMBERSHIP_NOT_FOUND' })
  })

  it('throws STORE_MEMBERSHIP_NOT_FOUND when membership not found', async () => {
    const mw = new RequireStoreMember(makeRepo(false))
    const req = makeRequest({ user: { id: 'user-1' } }, { storeId: 'store-1' })
    await expect(mw.execute(req)).rejects.toMatchObject({ name: 'STORE_MEMBERSHIP_NOT_FOUND' })
  })

  it('stamps membership on ctx when found (params.storeId)', async () => {
    const mw = new RequireStoreMember(makeRepo(true))
    const req = makeRequest({ user: { id: 'user-1' } }, { storeId: 'store-1' })
    await mw.execute(req)
    expect((req.ctx as any).membership).toMatchObject({ storeId: 'store-1', userId: 'user-1', role: 'OWNER' })
  })

  it('stamps membership on ctx when found (body.storeId)', async () => {
    const mw = new RequireStoreMember(makeRepo(true))
    const req = makeRequest({ user: { id: 'user-1' } }, {}, { storeId: 'store-1' })
    await mw.execute(req)
    expect((req.ctx as any).membership).toMatchObject({ storeId: 'store-1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api/typescript && bun test src/tenancy/middlewares/RequireStoreMember.test.ts`

Expected: Several tests FAIL — the current middleware does `as`-casts so it does not throw `STORE_MEMBERSHIP_NOT_FOUND` on a malformed ctx (it just silently returns `undefined` and falls through to the `if (!userId)` guard, meaning the typed-error check on a structurally-wrong ctx might still pass for some cases; the malformed-`user` case without `id` fails differently). The point is that the test file doesn't exist yet, so all tests are failing.

- [ ] **Step 3: Rewrite `RequireStoreMember` with Zod parse**

Replace `packages/api/typescript/src/tenancy/middlewares/RequireStoreMember.ts` with:

```ts
import { singleton } from 'tsyringe-neo'
import { BaseError, z } from '@template/core-typescript'
import type { HttpControllerRequest, HttpMiddlewareResponse, Middleware } from '@template/core-typescript'
import { StoreMembershipRepository } from '../repositories/StoreMembershipRepository'
import type { ApplicationErrors } from '../errors'

/**
 * Tenancy gate that:
 *   1. Parses `request.ctx` against `CtxSchema` (requires `user.id` from SPEC-05).
 *   2. Parses `storeId` from `request.params` or `request.body`.
 *   3. Looks up the membership row via `findByStoreAndUser`.
 *   4. On hit, stamps `request.ctx.membership = { storeId, userId, role }` for
 *      `RequireStoreRole` and the controller.
 *   5. On any parse failure or miss, throws `STORE_MEMBERSHIP_NOT_FOUND` (→ 404).
 *
 * Composition rule: `AuthAccountMiddleware` first (provides `user.id`), then this;
 * `RequireStoreRole` goes after to enforce the role allow-list.
 */

// Derived from SessionSchema (SPEC-04): only the slice this middleware needs.
const CtxSchema = z.object({
  user: z.object({ id: z.string() }),
})

// storeId may come from URL params or request body — check both, prefer params.
const ParamsBodySchema = z.union([
  z.object({ storeId: z.string() }),
  z.object({ storeId: z.string().optional() }),
]).transform((v) => ('storeId' in v ? v.storeId : undefined))

// Simpler: parse each separately and pick the first success.
const StoreIdSchema = z.object({ storeId: z.string().min(1) })

@singleton()
export class RequireStoreMember implements Middleware {
  constructor(private readonly memberships: StoreMembershipRepository) {}

  async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
    const ctx = CtxSchema.safeParse(request.ctx)
    if (!ctx.success) throw new BaseError<ApplicationErrors>('STORE_MEMBERSHIP_NOT_FOUND')

    const userId = ctx.data.user.id

    const fromParams = StoreIdSchema.safeParse(request.params)
    const fromBody = StoreIdSchema.safeParse(request.body)
    const storeId = fromParams.success ? fromParams.data.storeId : fromBody.success ? fromBody.data.storeId : undefined
    if (!storeId) throw new BaseError<ApplicationErrors>('STORE_MEMBERSHIP_NOT_FOUND')

    const m = await this.memberships.findByStoreAndUser(storeId, userId)
    if (!m) throw new BaseError<ApplicationErrors>('STORE_MEMBERSHIP_NOT_FOUND')

    request.ctx = {
      ...request.ctx,
      membership: { storeId: m.storeId, userId: m.userId, role: m.role },
    }
    return {}
  }
}
```

Key changes vs original:
- `@injectable()` → `@singleton()` (mandatory per middleware skill).
- Added `z` to the import from `@template/core-typescript`.
- `CtxSchema.safeParse(request.ctx)` replaces `(request.ctx as ...) ?.session?.userId`.
- `StoreIdSchema.safeParse(request.params)` / `…(request.body)` replaces the two `as`-casts.
- All three `as` casts removed.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/api/typescript && bun test src/tenancy/middlewares/RequireStoreMember.test.ts`

Expected: all 6 tests PASS.

- [ ] **Step 5: Type-check**

Run: `cd packages/api/typescript && bun run tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 6: Grep verification**

Run:
```bash
grep -n "request\.ctx as\|request\.params as\|request\.body as" \
  packages/api/typescript/src/tenancy/middlewares/RequireStoreMember.ts
```

Expected: no output (zero matches).

- [ ] **Step 7: Commit**

```bash
git add packages/api/typescript/src/tenancy/middlewares/RequireStoreMember.ts \
        packages/api/typescript/src/tenancy/middlewares/RequireStoreMember.test.ts
git commit -m "refactor(tenancy): SPEC-06 RequireStoreMember parses ctx+storeId with Zod (Task 1)"
```

---

## Task 2: `RequireStoreRole` parses `membership.role` with Zod; aggregate verification

**Files:**
- Modify: `packages/api/typescript/src/tenancy/middlewares/RequireStoreRole.ts`
- Create: `packages/api/typescript/src/tenancy/middlewares/RequireStoreRole.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /middleware
**Depends on:** 1

- [ ] **Step 1: Write the failing test**

Create `packages/api/typescript/src/tenancy/middlewares/RequireStoreRole.test.ts`:

```ts
import { describe, it, expect } from 'bun:test'
import { RequireStoreRole } from './RequireStoreRole'
import { Role as TenancyRole } from '@template/contracts-typescript/wire/enums'
import type { HttpControllerRequest } from '@template/core-typescript'

function makeRequest(ctx: unknown): HttpControllerRequest<unknown> {
  return { ctx, params: {}, body: {}, raw: {} } as unknown as HttpControllerRequest<unknown>
}

describe('RequireStoreRole', () => {
  const Middleware = RequireStoreRole([TenancyRole.OWNER, TenancyRole.ADMIN])

  it('throws FORBIDDEN when ctx has no membership', async () => {
    const mw = new Middleware()
    const req = makeRequest({})
    await expect(mw.execute(req)).rejects.toMatchObject({ name: 'FORBIDDEN' })
  })

  it('throws FORBIDDEN when ctx.membership has no role', async () => {
    const mw = new Middleware()
    const req = makeRequest({ membership: {} })
    await expect(mw.execute(req)).rejects.toMatchObject({ name: 'FORBIDDEN' })
  })

  it('throws FORBIDDEN when role is not in the allow-list', async () => {
    const mw = new Middleware()
    const req = makeRequest({ membership: { role: TenancyRole.MEMBER } })
    await expect(mw.execute(req)).rejects.toMatchObject({ name: 'FORBIDDEN' })
  })

  it('throws FORBIDDEN when ctx membership shape is completely wrong (type cast bypass)', async () => {
    const mw = new Middleware()
    // Simulates a malformed ctx that old `as` casts would silently accept
    const req = makeRequest({ membership: { role: 42 } })
    await expect(mw.execute(req)).rejects.toMatchObject({ name: 'FORBIDDEN' })
  })

  it('passes when role is in the allow-list', async () => {
    const mw = new Middleware()
    const req = makeRequest({ membership: { role: TenancyRole.OWNER } })
    await expect(mw.execute(req)).resolves.toMatchObject({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/api/typescript && bun test src/tenancy/middlewares/RequireStoreRole.test.ts`

Expected: tests that check malformed-ctx behavior may fail because the current `as`-cast silently produces `undefined` (which triggers the `!role` guard) — but the test file doesn't exist yet, so all fail.

- [ ] **Step 3: Rewrite `RequireStoreRole` with Zod parse**

Replace `packages/api/typescript/src/tenancy/middlewares/RequireStoreRole.ts` with:

```ts
import { BaseError, z } from '@template/core-typescript'
import type { HttpControllerRequest, HttpMiddlewareResponse, Middleware, MiddlewareClass } from '@template/core-typescript'
import type { BaseInterfaceErrors } from '@template/core-typescript'
import { Role as TenancyRole } from '@template/contracts-typescript/wire/enums'

/**
 * Factory returning a Middleware class that reads `request.ctx.membership.role`
 * (stamped by `RequireStoreMember`) and throws `FORBIDDEN` when the role isn't
 * in the allow-list.
 *
 * Usage:
 *   override middlewares = [
 *     AuthAccountMiddleware,
 *     RequireStoreMember,
 *     RequireStoreRole([TenancyRole.OWNER, TenancyRole.ADMIN]),
 *   ]
 */
export function RequireStoreRole(allowed: TenancyRole[]): MiddlewareClass {
  const allowedSet = new Set<string>(allowed)

  // Parse only the membership slice stamped by RequireStoreMember.
  const MembershipCtxSchema = z.object({
    membership: z.object({ role: z.string() }),
  })

  class RequireStoreRoleMiddleware implements Middleware {
    async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
      const ctx = MembershipCtxSchema.safeParse(request.ctx)
      if (!ctx.success) throw new BaseError<BaseInterfaceErrors>('FORBIDDEN')

      const role = ctx.data.membership.role
      if (!allowedSet.has(role)) throw new BaseError<BaseInterfaceErrors>('FORBIDDEN')

      return {}
    }
  }

  return RequireStoreRoleMiddleware
}
```

Key changes vs original:
- Added `z` to the import from `@template/core-typescript`.
- `MembershipCtxSchema.safeParse(request.ctx)` replaces `(request.ctx as ...) ?.membership?.role`.
- The `as`-cast on `request.ctx` removed; role validated as `z.string()` (any enum value passes Zod; the allow-list check at `allowedSet.has(role)` enforces the business rule).

- [ ] **Step 4: Run both test suites**

Run:
```bash
cd packages/api/typescript && bun test src/tenancy/middlewares/RequireStoreMember.test.ts \
  src/tenancy/middlewares/RequireStoreRole.test.ts
```

Expected: all 11 tests PASS.

- [ ] **Step 5: Run the full tenancy test suite**

Run: `cd packages/api/typescript && bun test src/tenancy/`

Expected: all existing tenancy tests PASS (entity, use case, repository, error tests unaffected).

- [ ] **Step 6: Type-check**

Run: `cd packages/api/typescript && bun run tsc --noEmit`

Expected: 0 errors.

- [ ] **Step 7: Aggregate grep — zero `as`-casts in tenancy middlewares**

Run:
```bash
grep -rn "request\.ctx as\|request\.params as\|request\.body as" \
  packages/api/typescript/src/tenancy/middlewares/
```

Expected: no output.

- [ ] **Step 8: Full test suite (excluding e2e)**

Run: `bun run test`

Expected: clean (no regressions outside tenancy).

- [ ] **Step 9: Commit**

```bash
git add packages/api/typescript/src/tenancy/middlewares/RequireStoreRole.ts \
        packages/api/typescript/src/tenancy/middlewares/RequireStoreRole.test.ts
git commit -m "refactor(tenancy): SPEC-06 RequireStoreRole parses membership ctx with Zod (Task 2)"
```
