---
name: middleware
description: Create an HTTP middleware. Use when you need to enforce a cross-cutting concern before a controller runs — authentication, operating-context guard, onboarding gate, tenancy, audit logging. Middlewares throw typed `BaseError` codes that the GlobalErrorMapper turns into HTTP statuses; the frontend can react with custom routing via the customErrorHandlers registry.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

# Create HTTP Middleware

Creates an HTTP middleware — a cross-cutting concern that runs **before** a controller executes. Middlewares enforce authentication, guard operating context (membership, role), gate flows (onboarding), or attach data to `request.ctx` for downstream controllers.

## Why Middlewares Exist

Controllers stay narrow and business-focused; middlewares carry cross-cutting concerns that must run for every request in a class of routes (auth, tenancy, onboarding). They are also **the public-API surface for routing-by-error**: when a middleware throws a typed `BaseError`, the `GlobalErrorMapper` maps it to an HTTP status and the frontend's `customErrorHandlers` registry can react with a redirect instead of a toast.

## When to Use This Skill

- Authenticating a user / session
- Validating operating context (member, doctor, owner, clinic)
- Gating a flow (onboarding, payment, plan tier)
- Attaching cross-cutting data to `request.ctx` (user, actor, tenant)
- Audit logging or request tracing

## When NOT to Use This Skill

- Business validation that belongs to a use case (e.g. "appointment cannot be confirmed twice") — use `/usecase` + entity invariants.
- Per-controller input validation — Zod schemas in the controller already cover it (`/controller`).
- Side effects after the operation succeeds — use `/handler`.
- Cross-context async reactions — use integration events + `/handler`.

## Prerequisites

- Context must exist (use `/bounded-context` first).
- Errors that the middleware throws must be declared (use `/errors`).
- The error must be registered in `GlobalErrorMapper` with the right HTTP status.

## Key Principles

1. **One concern per middleware.** Auth, actor validation, onboarding — each is its own class. Composition happens at the context level (default chain) or controller level (override).
2. **Throw typed `BaseError`, never strings.** The error name is the wire contract; the frontend matches on it.
3. **Use Zod to parse `request.ctx`.** Never assume earlier middlewares ran successfully — validate the slice of `ctx` your middleware reads.
4. **Singleton-scoped via tsyringe.** Decorate with `@singleton()` (not `@injectable()`).
5. **Attach data, don't fetch unnecessarily.** Only enrich `request.ctx` with data that downstream middlewares or controllers will use; otherwise just throw and return.
6. **Default chain per context; override per controller.** Each context declares its default middleware list in `middlewares/index.ts`. Controllers `override middlewares` to add, `override skipMiddlewares` to remove.

## Process

### Step 1: Create the Middleware File

```bash
touch packages/api/typescript/src/<context>/middlewares/<Name>Middleware.ts
```

### Step 2: Implement the Class

The signature is fixed by `Middleware` in `@codedm/core-typescript`:

```ts
export abstract class Middleware {
  abstract execute: (request: HttpControllerRequest<unknown>) => Promise<HttpMiddlewareResponse<unknown>>
}
```

A guard middleware (validates and may attach to `ctx`):

```ts
// packages/api/typescript/src/ui/middlewares/OnboardingMiddleware.ts
import { singleton } from 'tsyringe-neo'
import { BaseError } from '@codedm/core-typescript'
import type { HttpControllerRequest, HttpMiddlewareResponse, Middleware } from '@codedm/core-typescript'
import { z } from '@codedm/core-typescript'
import { OnboardingRepository } from '@ui/repositories'
import { ApplicationErrors } from '@ui/errors'

const CtxSchema = z.object({
  user: z.object({ id: z.string() }),
})

@singleton()
export class OnboardingMiddleware implements Middleware {
  constructor(private onboardingRepository: OnboardingRepository) {}

  async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
    const ctx = CtxSchema.safeParse(request.ctx)
    if (!ctx.success) {
      throw new BaseError<ApplicationErrors>('ONBOARDING_NOT_COMPLETED', 'User not authenticated')
    }

    const onboarding = await this.onboardingRepository.findByUserId(ctx.data.user.id)
    if (!onboarding || !onboarding.completedAt) {
      throw new BaseError<ApplicationErrors>('ONBOARDING_NOT_COMPLETED')
    }

    return {}
  }
}
```

An auth middleware that attaches data to `request.ctx`:

```ts
// packages/api/typescript/src/auth/middlewares/AuthAccountMiddleware.ts
@singleton()
export class AuthAccountMiddleware implements Middleware {
  constructor(private betterAuth: BetterAuth, private client: DrizzleClient) {}

  async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
    const response = await this.betterAuth.auth.api.getSession({ headers: request.raw.headers, asResponse: true })
    if (!response.ok) throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED')

    const validated = SessionSchema.safeParse(await response.json())
    if (!validated.success) throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED', 'Invalid session structure')

    request.ctx = {
      ...request.ctx,
      user: validated.data.user,
      session: validated.data.session,
    }
    return { cookie: refreshedCookies }
  }
}
```

### Step 3: Register the Error

Every error code the middleware throws must:

1. Be declared in the context's `errors/index.ts`:
   ```ts
   // packages/api/typescript/src/ui/errors/index.ts
   export type UiApplicationErrors =
     | 'ONBOARDING_NOT_FOUND'
     | 'ONBOARDING_ALREADY_COMPLETED'
     | 'ONBOARDING_NOT_COMPLETED'
   ```
2. Be added to `GlobalErrorMapper` with the right HTTP status:
   ```ts
   // packages/api/typescript/src/shared/utils/GlobalErrorMapper.ts
   ONBOARDING_NOT_COMPLETED: HttpStatusCode.FORBIDDEN,
   ```

Status is the **routing signal** the frontend reads. Use `FORBIDDEN` for "authenticated but not authorized for this flow", `UNAUTHORIZED` for "no/invalid session", `NOT_FOUND` for "this resource doesn't exist for you".

### Step 4: Wire into the Context's Default Chain

Each bounded context declares its default middleware chain in `middlewares/index.ts` (default export, not `import * as`):

```ts
// packages/api/typescript/src/ui/middlewares/index.ts
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { OnboardingMiddleware } from './OnboardingMiddleware'

export default [AuthAccountMiddleware, OnboardingMiddleware]
```

The chain runs **in order** for every controller in the context that doesn't opt out.

### Step 5: Per-Controller Overrides (if needed)

Controllers can add or skip middlewares:

```ts
// Add a middleware on top of the context default
override middlewares: (Middleware | MiddlewareClass)[] = [
  AuthAccountMiddleware,
  AuthActorMiddleware,
]

// Skip a middleware from the context default
override skipMiddlewares: (Middleware | MiddlewareClass)[] = [
  OnboardingMiddleware,  // public endpoint, no onboarding gate
]
```

**Do not** add a middleware that's already in the context default — it's redundant.

## Current Middleware Inventory

| Middleware | Purpose | Throws |
|---|---|---|
| `AuthAccountMiddleware` (auth) | Validates BetterAuth session, attaches `user` + `session` to `ctx` | `UNAUTHORIZED` |
| `AuthActorMiddleware` (auth) | Validates `actorType` / `actorId` against doctor/collaborator repo, attaches `actor` to `ctx` | `UNAUTHORIZED` |
| `OnboardingMiddleware` (ui) | Checks the user finished onboarding | `ONBOARDING_NOT_COMPLETED` |

Context defaults:

| Context | Default chain |
|---|---|
| `auth`, `clinic`, `doctor`, `appointment`, `patient`, `collaborator`, `service`, etc. | `[AuthAccountMiddleware, AuthActorMiddleware]` |
| `ui` | `[AuthAccountMiddleware, OnboardingMiddleware]` |

## The Backend ↔ Frontend Error Flow (the load-bearing pattern)

This is the most important piece of the middleware design — and the most overlooked. **A typed error code thrown in a middleware becomes a routing instruction on the frontend.**

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. Backend middleware throws                                          │
│    throw new BaseError<ApplicationErrors>('ONBOARDING_NOT_COMPLETED') │
└─────────────────────┬────────────────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────────────────┐
│ 2. GlobalErrorMapper maps name → HTTP status                          │
│    ONBOARDING_NOT_COMPLETED → 403 FORBIDDEN                           │
│    Response body: { code: 'ONBOARDING_NOT_COMPLETED', message: ... }  │
└─────────────────────┬────────────────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────────────────┐
│ 3. SDK throws the error to the React Query client                     │
└─────────────────────┬────────────────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────────────────┐
│ 4. Global cache hooks catch it (main.tsx):                            │
│    queryCache.onError → handleApiError(error)                         │
│    mutationCache.onError → handleApiError(error)                      │
└─────────────────────┬────────────────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────────────────┐
│ 5. lib/errors.ts dispatches by code:                                  │
│    extractErrorCode(error) → 'ONBOARDING_NOT_COMPLETED'               │
│    customErrorHandlers[code] ?? defaultErrorHandler                   │
└─────────────────────┬────────────────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────────────────┐
│ 6. Custom handler runs:                                               │
│    ONBOARDING_NOT_COMPLETED: () => router.navigate({ to: '/onboarding'│
│                                                                       │
│    (default would be: toast.error(translatedMessage))                 │
└──────────────────────────────────────────────────────────────────────┘
```

### Frontend pieces (read-only reference)

- `packages/app/react/src/lib/errors.ts` — defines `errorsEnum` (merges `ApiErrorsEnum` from SDK with frontend-only codes), `customErrorHandlers`, `defaultErrorHandler`, `handleApiError`.
- `packages/app/react/src/main.tsx` — wires `handleApiError` to `QueryCache.onError` + `MutationCache.onError` so **every** query/mutation goes through the dispatcher.
- `packages/app/react/src/locales/{pt,en}.json` — translates each `errors.<CODE>` to a user-readable string for the default toast.

### When to add a custom handler vs default toast

| Symptom | Treatment |
|---|---|
| User is in the wrong state for this call (`ONBOARDING_NOT_COMPLETED`, `SESSION_EXPIRED`) | **Custom handler** — redirect/navigate. Don't toast — the next screen explains. |
| User did something invalid (`PATIENT_NOT_FOUND`, `ALREADY_EXISTS`, `INSUFFICIENT_STOCK`) | **Default toast** — show the translated message. |
| Network / system failure (`NETWORK_ERROR`, `UNKNOWN_ERROR`) | **Default toast** — generic failure message. |
| User finished a flow that's already done (`ONBOARDING_ALREADY_COMPLETED`) | **Custom handler** — redirect to the right destination based on session state. |

### Adding a new routing-by-error case

1. Throw a typed `BaseError<XErrors>('YOUR_CODE')` from the middleware (or use case — same flow).
2. Add the code to the context's `errors/index.ts`.
3. Map it in `GlobalErrorMapper` with the correct HTTP status.
4. Run `bun sdk` so the code appears in `ApiErrorsEnum`.
5. Add the i18n key `errors.YOUR_CODE` in `pt.json` and `en.json` (used if the default handler ever fires for it).
6. Add the custom handler to `packages/app/react/src/lib/errors.ts`:
   ```ts
   const customErrorHandlers: Partial<Record<ErrorCode, ErrorHandler>> = {
     YOUR_CODE: () => {
       router.navigate({ to: '/your-route' })
     },
   }
   ```

After step 6 every query / mutation in the entire app automatically routes when the backend returns `YOUR_CODE` — no per-component code, no try/catch.

## Critical Rules

### Always throw `BaseError`, never `new Error()` or strings

```ts
// WRONG — loses the wire contract
throw new Error('Onboarding not completed')

// CORRECT — typed name, mapped status, routable from frontend
throw new BaseError<ApplicationErrors>('ONBOARDING_NOT_COMPLETED')
```

### Always parse `request.ctx` with Zod

Earlier middlewares populate `ctx`, but a controller's `override middlewares` may swap them out. Don't assume — validate.

```ts
const CtxSchema = z.object({ user: z.object({ id: z.string() }) })
const ctx = CtxSchema.safeParse(request.ctx)
if (!ctx.success) throw new BaseError<ApplicationErrors>('ONBOARDING_NOT_COMPLETED', 'User not authenticated')
```

### One middleware = one concern

Don't bundle "auth + actor + onboarding" into a single class. Each is its own middleware; composition is the context's responsibility.

### Singleton, not Injectable

```ts
// CORRECT
@singleton()
export class XMiddleware implements Middleware { ... }

// WRONG — would create a new instance per resolution
@injectable()
```

### No business logic

A middleware enforces a precondition (auth, gate, context). Business rules belong in use cases / entities. If you find yourself loading multiple aggregates or running calculations, you're writing a use case, not a middleware.

## Checklist

- [ ] All `when: always` patterns present (verify against `registry.yaml`)
- [ ] Each conditional pattern evaluated
- [ ] No `bad_practices` violations
- [ ] Error code declared in `<ctx>/errors/index.ts`
- [ ] Error code mapped in `GlobalErrorMapper` with correct HTTP status
- [ ] If routing-by-error: custom handler added to `packages/app/react/src/lib/errors.ts`
- [ ] If routing-by-error: i18n keys added in `pt.json` + `en.json` (fallback for default toast)
- [ ] Wired into context default chain or per-controller override
- [ ] `bun sdk` ran so the error appears in `ApiErrorsEnum`

## References

- `packages/api/typescript/src/shared/types/Middleware.ts` — base type
- `packages/api/typescript/src/auth/middlewares/AuthAccountMiddleware.ts` — session validation + ctx enrichment
- `packages/api/typescript/src/auth/middlewares/AuthActorMiddleware.ts` — actor validation
- `packages/api/typescript/src/ui/middlewares/OnboardingMiddleware.ts` — flow gate (routing-by-error reference)
- `packages/api/typescript/src/shared/utils/GlobalErrorMapper.ts` — error → HTTP status registry
- `packages/app/react/src/lib/errors.ts` — frontend `customErrorHandlers` + `handleApiError`
- `packages/app/react/src/main.tsx` — `QueryCache` / `MutationCache` wiring
- `docs/BACKEND.md` — "Error Handling" + "Authorization & Session Context"
- `docs/FRONTEND.md` — "API Error Handling" (custom handler registry)
- `/errors` skill — defining and registering error codes
- `/controller` skill — per-controller middleware overrides
