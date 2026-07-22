# SPEC-04: Canonical `SessionSchema` + simpler `GetSession` — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle.

**Goal:** Introduce a single canonical `SessionSchema` in `src/shared/schemas/` shaped `{ user, session }`, rewrite `GetSession` to return it (dropping the bespoke `account` block — no frontend consumer reads `account.providerId`), and regenerate the SDK so `useGetSession`'s output type is correct for SPEC-05/06.

**Architecture:** Three atomic commits: (1) create `SessionSchema` + barrel; (2) rewrite `GetSession` controller + update its test; (3) regen SDK. The schema is the wave-2 keystone — SPEC-05 (`AuthAccountMiddleware`) and SPEC-06 (`RequireStoreMember`) import it without modification, so the shape must be final before those land.

**Tech Stack:** TypeScript + Bun + Zod (`@template/core-typescript` re-exports `z`). No DB changes; no migration. SDK regen via `bun sdk`.

**Spec:** `.specs/2026-05-25-refactor-batch-2/SPEC-04-session-schema-getsession.md`
**Tasks:** 3
**Estimated minutes:** 40

> **Planner note — `account` block removal confirmed safe.** A scan of `packages/app/**` (react + expo + astro) shows zero production consumers of `account.providerId` or `account.id` from the `GetSession` SDK hook — `packages/app/expo/lib/auth/session.ts` uses better-auth's own reactive `auth.useSession()`, not the `useGetSession` SDK hook; the react app has no reference at all. The `GetSession.test.ts` fixture asserts `account.providerId === 'credential'` only as a side-effect of `givenUserWithAccount` — that assertion is on the fixture, not on the controller response. The `account` block is dropped safely.

> **Planner note — `src/shared/schemas/` is new.** Today `packages/api/typescript/src/shared/` contains only `index.ts`, `registry.ts`, and `objects/`. No `schemas/` subdirectory exists yet. Task 1 creates `src/shared/schemas/SessionSchema.ts` + `src/shared/schemas/index.ts` (the barrel). This mirrors the in-flight schema-relocation home referenced in the spec.

> **Planner note — `session.storeId` placeholder.** SPEC-07 will add `storeId` to the better-auth session record and surface it on `SessionSchema.session`. Task 1 leaves a comment in the schema at the exact insertion point.

---

## Task 1: `SessionSchema` exists in `src/shared/schemas/`

**Files:**
- Create: `packages/api/typescript/src/shared/schemas/SessionSchema.ts`
- Create: `packages/api/typescript/src/shared/schemas/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema
**Depends on:** (none)

- [ ] **Step 1: Write the failing test (RED)**

There is no existing test for `SessionSchema`. Create
`packages/api/typescript/src/shared/schemas/SessionSchema.test.ts` with a
focused unit test asserting the shape parses correctly and that the
`storeId` placeholder is a comment (not a real field yet):

```ts
import { describe, it, expect } from 'bun:test'
import { SessionSchema } from './SessionSchema'

describe('SessionSchema', () => {
  it('parses a valid session payload', () => {
    const raw = {
      user: { id: 'u-1', email: 'a@b.com', name: 'Alice', emailVerified: true },
      session: { id: 's-1', userId: 'u-1', expiresAt: new Date().toISOString() },
    }
    const result = SessionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.user.id).toBe('u-1')
    expect(result.data.session.userId).toBe('u-1')
    expect(result.data.session.expiresAt).toBeInstanceOf(Date)
  })

  it('rejects a payload missing user.id', () => {
    const raw = {
      user: { email: 'a@b.com', name: 'Alice', emailVerified: true },
      session: { id: 's-1', userId: 'u-1', expiresAt: new Date().toISOString() },
    }
    expect(SessionSchema.safeParse(raw).success).toBe(false)
  })

  it('coerces expiresAt ISO string to Date', () => {
    const iso = '2030-01-01T00:00:00.000Z'
    const raw = {
      user: { id: 'u-1', email: 'a@b.com', name: null, emailVerified: false },
      session: { id: 's-1', userId: 'u-1', expiresAt: iso },
    }
    const result = SessionSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.session.expiresAt).toBeInstanceOf(Date)
    expect(result.data.session.expiresAt.toISOString()).toBe(iso)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/shared/schemas/SessionSchema.test.ts
```

Expected: FAIL — `Cannot find module './SessionSchema'`.

- [ ] **Step 3: Create `SessionSchema.ts`**

Create `packages/api/typescript/src/shared/schemas/SessionSchema.ts`:

```ts
import { z } from '@template/core-typescript'
import type Z from 'zod'

/**
 * Canonical session shape shared across auth middlewares, controllers, and
 * query services. Mirrors the medscall reference (packages/api/src/shared/
 * utils/schema/ExtraTypes.ts § SessionSchema) trimmed to the fields this
 * template's better-auth instance actually exposes.
 *
 * Consumers:
 *  - GetSession controller (SPEC-04) — returned as output shape
 *  - AuthAccountMiddleware (SPEC-05) — attaches this to request.ctx
 *  - RequireStoreMember / RequireStoreRole (SPEC-06) — parses request.ctx
 *
 * Extension point:
 *  - SPEC-07 adds `storeId: z.string().nullable()` inside the `session`
 *    object once better-auth persists it on the sessions record.
 */
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
    // storeId: z.string().nullable() — added in SPEC-07
  }),
})

export type Session = Z.infer<typeof SessionSchema>
```

- [ ] **Step 4: Create the barrel `src/shared/schemas/index.ts`**

Create `packages/api/typescript/src/shared/schemas/index.ts`:

```ts
export { SessionSchema, type Session } from './SessionSchema'
```

- [ ] **Step 5: Run test to verify it passes (GREEN)**

```bash
cd packages/api/typescript && bun test src/shared/schemas/SessionSchema.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 6: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

Use `/commit`:

```
feat(auth): add canonical SessionSchema to src/shared/schemas (SPEC-04 Task 1)
```

Stage: `packages/api/typescript/src/shared/schemas/`

---

## Task 2: `GetSession` returns `SessionSchema`; `account` block removed

**Files:**
- Modify: `packages/api/typescript/src/auth/controllers/GetSession.ts`
- Modify: `packages/api/typescript/src/auth/controllers/GetSession.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /schema
**Depends on:** 1

- [ ] **Step 1: Write the failing assertion (RED)**

The existing `GetSession.test.ts` has an assertion that checks `account.providerId === 'credential'`. That was a fixture assertion, not a controller-response assertion — but we need to confirm the test suite still compiles and passes after `account` is dropped. Add a new explicit check that the controller no longer returns an `account` key, so the test fails first:

Open `packages/api/typescript/src/auth/controllers/GetSession.test.ts` and append a placeholder test that will fail until the controller is rewritten:

```ts
it('response shape has session key, not account key', async () => {
  // This test will fail until GetSession returns SessionSchema instead of
  // the bespoke { user, account } shape.
  const controller = testBed.resolve(GetSessionController)
  const response = await controller.handle({ headers: {} } as any)
  // Even with a 401 result the test verifies the schema export is correct
  // by asserting the output schema has no `account` property.
  const outputShape = Object.keys(
    (GetSessionController as any).prototype.outputSchema?.shape ?? {}
  )
  expect(outputShape).not.toContain('account')
  expect(outputShape).toContain('session')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/auth/controllers/GetSession.test.ts
```

Expected: FAIL — `outputShape` contains `account` and does not contain `session`.

- [ ] **Step 3: Rewrite `GetSession.ts`**

Replace the contents of `packages/api/typescript/src/auth/controllers/GetSession.ts`:

```ts
// Recipe: dev:packages/api/src/auth/controllers pattern.
// Returns current session user + session info. Does not require AuthActorMiddleware
// (session may not have an actor set yet — this is the session lookup endpoint itself).
import { injectable } from 'tsyringe-neo'
import { z } from '@template/core-typescript'
import { Controller } from '@template/core-typescript'
import { HttpStatusCode } from '@template/core-typescript'
import { BetterAuth } from '../services/Authentication/BetterAuth'
import { UserRepository } from '../repositories/UserRepository'
import { SessionSchema } from '@shared/schemas'

export const GetSessionInputSchema = z
  .object({
    headers: z.record(z.string(), z.string().optional()),
  })
  .example([{ headers: { cookie: 'session=abc123' } }])

export const GetSessionOutputSchema = SessionSchema.example([
  {
    user: { id: 'user-1', email: 'user@example.com', name: 'Alice', emailVerified: true },
    session: { id: 'session-1', userId: 'user-1', expiresAt: '2030-01-01T00:00:00.000Z' },
  },
])

@injectable()
export class GetSessionController extends Controller<typeof GetSessionInputSchema, typeof GetSessionOutputSchema> {
  readonly path = '/session'
  readonly method = 'get' as const
  readonly description = 'Get current authenticated session'
  readonly inputSchema = GetSessionInputSchema
  readonly outputSchema = GetSessionOutputSchema

  constructor(
    private betterAuth: BetterAuth,
    private userRepository: UserRepository,
  ) {
    super()
  }

  async handle(request: this['input']): Promise<this['output']> {
    const response = await this.betterAuth.auth.api.getSession({
      headers: request.headers as unknown as Headers,
      asResponse: true,
    })

    if (!response.ok) {
      return { status: HttpStatusCode.UNAUTHORIZED }
    }

    const rawSession = (await response.json()) as {
      user?: { id?: string }
      session?: { id?: string; userId?: string; expiresAt?: string }
    } | null

    if (!rawSession?.user?.id || !rawSession?.session?.id) {
      return { status: HttpStatusCode.UNAUTHORIZED }
    }

    const user = await this.userRepository.findById(rawSession.user.id)
    if (!user) {
      return { status: HttpStatusCode.UNAUTHORIZED }
    }

    return {
      status: HttpStatusCode.OK,
      data: {
        user: {
          id: user.id.value,
          email: user.email,
          name: user.name ?? null,
          emailVerified: user.emailVerified ?? false,
        },
        session: {
          id: rawSession.session.id,
          userId: rawSession.session.userId ?? user.id.value,
          expiresAt: new Date(rawSession.session.expiresAt ?? 0),
        },
      },
    }
  }
}
```

Key changes vs the old file:
- `AccountRepository` import and constructor injection removed.
- `GetSessionOutputSchema` is now `SessionSchema.example([...])` — no separate bespoke object.
- The `account` block is gone from the `handle` body.
- `rawSession` type guard now also requires `session.id`.
- The data mapping includes `session.{ id, userId, expiresAt }`.

- [ ] **Step 4: Update the existing test**

Replace `packages/api/typescript/src/auth/controllers/GetSession.test.ts` with:

```ts
// Task 6 — GET /v1/session integration test.
// Tests: 401 on missing session; shape assertion on the output schema.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { GetSessionController } from './GetSession'

describe('GET /v1/session', () => {
  let testBed: TestBed
  let testContainer: DependencyContainer

  beforeAll(async () => {
    testContainer = container.createChildContainer()
    testBed = await TestBed.create('integration', { testContainer })
  })
  beforeEach(async () => {
    await testBed.reset()
  })
  afterAll(async () => {
    await testBed.destroy()
  })

  it('returns 401 when no session cookie is present', async () => {
    const controller = testBed.resolve(GetSessionController)
    const response = await controller.handle({ headers: {} } as any)
    expect(response.status).toBe(401)
  })

  it('output schema has session key, not account key', () => {
    // Verifies the controller declares SessionSchema as its outputSchema.
    const controller = testBed.resolve(GetSessionController)
    const outputShape = Object.keys((controller as any).outputSchema?.shape ?? {})
    expect(outputShape).not.toContain('account')
    expect(outputShape).toContain('session')
    expect(outputShape).toContain('user')
  })

  it('given helpers create resolvable entities (fixture sanity)', async () => {
    const { user, account } = await testBed.given.userWithAccount({
      user: { email: 'gabriel@example.com', name: 'Gabriel' },
    })
    expect(user.email).toBe('gabriel@example.com')
    expect(user.name).toBe('Gabriel')
    // account exists for auth wiring even though GetSession no longer returns it
    expect(account.providerId).toBe('credential')
  })
})
```

- [ ] **Step 5: Run test to verify it passes (GREEN)**

```bash
cd packages/api/typescript && bun test src/auth/controllers/GetSession.test.ts
```

Expected: PASS — 3 tests.

- [ ] **Step 6: `bun tsc` clean**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors. If `AccountRepository` is still referenced elsewhere in the auth registry or other files, those references are untouched — only `GetSession.ts` drops it. The `AccountRepository` class itself is not deleted.

- [ ] **Step 7: Run full test suite**

```bash
cd packages/api/typescript && bun run test
```

Expected: all tests pass (no regressions from dropping `AccountRepository` from `GetSession`'s constructor — the container resolves it lazily and unused registrations are harmless).

- [ ] **Step 8: Commit**

Use `/commit`:

```
refactor(auth): GetSession returns SessionSchema; drop account block (SPEC-04 Task 2)
```

Stage: `packages/api/typescript/src/auth/controllers/GetSession.ts`, `packages/api/typescript/src/auth/controllers/GetSession.test.ts`

---

## Task 3: SDK regen; frontend `tsc` stays green

**Files:**
- Regenerate: `packages/api/typescript/public/docs/openapi.json` (emitted by `bun emit-openapi`)
- Regenerate: `packages/client/` SDK (emitted by `bun sdk`)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /sdk
**Depends on:** 2

- [ ] **Step 1: Regenerate OpenAPI + SDK**

```bash
bun sdk
```

This runs `emit-openapi` (which updates `packages/api/typescript/public/docs/openapi.json` to reflect the new `GetSessionOutputSchema`) then Kubb regenerates `packages/client/dist/typescript/src/typescript/zod/getSessionSchema.ts`.

Expected: the generated `getSession200Schema` in `packages/client/dist/typescript/src/typescript/zod/getSessionSchema.ts` now contains `session` (with `id`, `userId`, `expiresAt`) instead of `account`.

- [ ] **Step 2: Verify the generated schema**

```bash
grep -A 20 'getSession200Schema' packages/client/dist/typescript/src/typescript/zod/getSessionSchema.ts
```

Expected output includes `session` key and does NOT include `account`.

- [ ] **Step 3: Frontend `tsc` check**

```bash
cd packages/app/react && bun tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors. If any component reads `data.account.providerId` from `useGetSession`, it is listed here as a breakage for SPEC-05 to fix. Based on the pre-plan scan, no such consumer exists; this step is a safety net.

```bash
cd packages/app/expo && bun tsc --noEmit 2>&1 | head -40
```

Expected: 0 errors. The expo app uses `auth.useSession()` from the better-auth Expo client, not `useGetSession`, so no breakage is expected.

- [ ] **Step 4: `bun tsc` on the API**

```bash
cd packages/api/typescript && bun tsc
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

Use `/commit`:

```
chore(sdk): regen after GetSession → SessionSchema (SPEC-04 Task 3)
```

Stage: `packages/api/typescript/public/docs/openapi.json`, `packages/client/dist/` (all changed SDK files), `packages/client/packages/client/dist/` if the symlinked dist also updates.

---

## Acceptance Criteria Coverage

| AC | Covered by |
|---|---|
| `SessionSchema` in `src/shared/schemas/`, shaped `{ user, session }` | Task 1 Step 3 |
| `GetSession` output is `SessionSchema`; `account` shape removed | Task 2 Step 3 |
| `bun sdk` regenerates; SDK `getSession200Schema` reflects new shape | Task 3 Step 1–2 |
| `bun tsc` clean | Tasks 1 Step 6, 2 Step 6, 3 Step 4 |
| `bun run test` clean | Task 2 Step 7 |
