# Auth Rate Limiter — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** Throttle brute-force / credential-stuffing on the auth surface by counting login/signup/password-reset attempts per IP and per email in Redis, rejecting with `429 RATE_LIMITED` once a per-action threshold is crossed — fail-open if Redis is down.

**Architecture:** A new `RateLimitStore` service in `core` (abstract base + atomic Redis fixed-window impl + in-memory impl for tests/DI) is consumed by a new `RateLimitMiddleware` in `core` that attaches to the Better-Auth passthrough `AuthController`. The middleware derives a per-sub-action key plus an IP key and an email key, calls `store.hit` for each, and throws `BaseError<'RATE_LIMITED'>` (mapped to 429 by `GlobalErrorMapper`) when either counter is exhausted. Store binding is per-env in `auth/registry.ts` (in-memory for mock/integration, Redis for real). The frontend reads the typed code via the SDK error enum after an SDK regen.

**Tech Stack:** TypeScript, Bun, ioredis, tsyringe-neo, Fastify (wrapped), Zod

**Spec:** .specs/2026-06-02-auth-rate-limiter-design.md
**Tasks:** 3
**Estimated minutes:** 95

---

## Task T1: A counter denies the N+1th hit within a window and resets after it

**Files to write:**
- Create: `packages/api/typescript/core/src/services/RateLimitStore/RateLimitStore.ts`
- Create: `packages/api/typescript/core/src/services/RateLimitStore/InMemoryRateLimitStore.ts`
- Create: `packages/api/typescript/core/src/services/RateLimitStore/RedisRateLimitStore.ts`
- Create: `packages/api/typescript/core/src/services/RateLimitStore/index.ts`
- Modify: `packages/api/typescript/core/src/index.ts` — export the new service barrel
- Test: `packages/api/typescript/core/src/services/RateLimitStore/RateLimitStore.test.ts`

**Files to read:**
- `packages/api/typescript/core/src/services/CredentialVault/AesCredentialVault.ts`
- `packages/api/typescript/src/integration/services/CredentialHandleStore/RedisCredentialHandleStore.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** (none)

### Step T1.1 — Write the failing store-contract test

This test runs against `InMemoryRateLimitStore` (no Redis, no Docker). It pins the fixed-window semantics shared by both impls.

```typescript
import { describe, it, expect } from 'bun:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { InMemoryRateLimitStore } from './InMemoryRateLimitStore'

describe('InMemoryRateLimitStore (RateLimitStore contract)', () => {
	it('allows hits up to max and reports remaining', async () => {
		const store = new InMemoryRateLimitStore()
		const first = await store.hit('k', 1000, 3)
		expect(first).toEqual({ allowed: true, remaining: 2 })
		const second = await store.hit('k', 1000, 3)
		expect(second).toEqual({ allowed: true, remaining: 1 })
		const third = await store.hit('k', 1000, 3)
		expect(third).toEqual({ allowed: true, remaining: 0 })
	})

	it('denies the N+1th hit within the window', async () => {
		const store = new InMemoryRateLimitStore()
		await store.hit('k', 1000, 2)
		await store.hit('k', 1000, 2)
		const overflow = await store.hit('k', 1000, 2)
		expect(overflow.allowed).toBe(false)
		expect(overflow.remaining).toBe(0)
	})

	it('resets the counter after the window elapses', async () => {
		const store = new InMemoryRateLimitStore()
		await store.hit('k', 20, 1)
		expect((await store.hit('k', 20, 1)).allowed).toBe(false)
		await sleep(30)
		expect((await store.hit('k', 20, 1)).allowed).toBe(true)
	})

	it('keeps distinct keys independent', async () => {
		const store = new InMemoryRateLimitStore()
		await store.hit('a', 1000, 1)
		expect((await store.hit('a', 1000, 1)).allowed).toBe(false)
		expect((await store.hit('b', 1000, 1)).allowed).toBe(true)
	})
})
```

### Step T1.2 — Run test to verify it fails

Run: `cd packages/api/typescript/core && bun test src/services/RateLimitStore/RateLimitStore.test.ts`
Expected: FAIL with `Cannot find module './InMemoryRateLimitStore'`

### Step T1.3 — Write the abstract base

`packages/api/typescript/core/src/services/RateLimitStore/RateLimitStore.ts`:

```typescript
/**
 * Fixed-window request counter. `hit` increments the counter for `key` inside a
 * `windowMs` window and reports whether the caller is still under `max`. The
 * window starts on the first hit and the counter resets when it elapses.
 *
 * Implementations must make the increment atomic so concurrent hits to the same
 * key within the window share one counter (no lost increments).
 */
export interface RateLimitResult {
	/** True while the count for this window is <= max. */
	allowed: boolean
	/** Remaining hits in the current window (never negative). */
	remaining: number
}

export abstract class RateLimitStore {
	abstract hit(key: string, windowMs: number, max: number): Promise<RateLimitResult>
}
```

### Step T1.4 — Write the in-memory impl

`packages/api/typescript/core/src/services/RateLimitStore/InMemoryRateLimitStore.ts`:

```typescript
import { RateLimitStore, type RateLimitResult } from './RateLimitStore'

/**
 * Process-local fixed-window counter. Backs the `mock` / `integration` DI
 * environments and unit tests so the suite needs no Redis. Not for production
 * (counters are per-process and lost on restart).
 */
export class InMemoryRateLimitStore extends RateLimitStore {
	private windows = new Map<string, { count: number; resetAt: number }>()

	async hit(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
		const now = Date.now()
		const existing = this.windows.get(key)
		if (!existing || existing.resetAt <= now) {
			this.windows.set(key, { count: 1, resetAt: now + windowMs })
			return { allowed: true, remaining: Math.max(0, max - 1) }
		}
		existing.count += 1
		return { allowed: existing.count <= max, remaining: Math.max(0, max - existing.count) }
	}
}
```

### Step T1.5 — Write the Redis impl

`packages/api/typescript/core/src/services/RateLimitStore/RedisRateLimitStore.ts`. The `INCR`-then-`PEXPIRE`-on-first-hit pair runs as one atomic Lua `eval` so concurrent hits can't lose an increment or skip the TTL.

```typescript
import IORedis from 'ioredis'
import { Config } from '../../utils/Config'
import { RateLimitStore, type RateLimitResult } from './RateLimitStore'

const KEY_PREFIX = 'ratelimit:'

// Atomic fixed-window: increment, and set the window TTL only on the first hit.
const HIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return current
`

export class RedisRateLimitStore extends RateLimitStore {
	private redis = new IORedis(Config.env.REDIS_URL, { maxRetriesPerRequest: null })

	async hit(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
		const current = Number(await this.redis.eval(HIT_SCRIPT, 1, KEY_PREFIX + key, windowMs))
		return { allowed: current <= max, remaining: Math.max(0, max - current) }
	}
}
```

### Step T1.6 — Write the barrel

`packages/api/typescript/core/src/services/RateLimitStore/index.ts`:

```typescript
export { RateLimitStore, type RateLimitResult } from './RateLimitStore'
export { InMemoryRateLimitStore } from './InMemoryRateLimitStore'
export { RedisRateLimitStore } from './RedisRateLimitStore'
```

### Step T1.7 — Export from the core barrel

Modify `packages/api/typescript/core/src/index.ts`:
After the `export * from './services/CredentialVault'` line, add:

```typescript
export * from './services/RateLimitStore'
```

### Step T1.8 — Run test to verify it passes

Run: `cd packages/api/typescript/core && bun test src/services/RateLimitStore/RateLimitStore.test.ts`
Expected: PASS — 4 tests pass

### Step T1.9 — Type check + lint

Run: `cd packages/api/typescript/core && bun x tsc -p tsconfig.build.json --noEmit && cd /Users/work/Desktop/Projetos/pessoal/template-fullstack && bun lint`
Expected: 0 errors

### Step T1.10 — Commit

```bash
git add packages/api/typescript/core/src/services/RateLimitStore/ packages/api/typescript/core/src/index.ts
git commit -m "feat(core): RateLimitStore fixed-window counter (Redis + in-memory) (Task T1)"
```

---

## Task T2: Repeated auth attempts return 429 RATE_LIMITED, per IP and per email, fail-open when the store errors

**Files to write:**
- Modify: `packages/api/typescript/core/src/errors/codes.ts` — add `'RATE_LIMITED'` to `BaseInterfaceErrors`
- Modify: `packages/api/typescript/core/src/utils/GlobalErrorMapper.ts` — map `RATE_LIMITED` → `TOO_MANY_REQUESTS`
- Create: `packages/api/typescript/core/src/middlewares/RateLimitMiddleware.ts`
- Create: `packages/api/typescript/core/src/middlewares/index.ts`
- Modify: `packages/api/typescript/core/src/index.ts` — export the middlewares barrel
- Modify: `packages/api/typescript/src/auth/registry.ts` — bind `RateLimitStore` per env
- Modify: `packages/api/typescript/src/auth/controllers/AuthController.ts` — attach `RateLimitMiddleware`
- Test: `packages/api/typescript/core/src/middlewares/RateLimitMiddleware.test.ts`

**Files to read:**
- `packages/api/typescript/src/billing/middlewares/InternalSecretKeyMiddleware.ts`
- `packages/api/typescript/src/billing/middlewares/InternalSecretKeyMiddleware.test.ts`
- `packages/api/typescript/core/src/utils/GlobalErrorMapper.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /middleware, /errors, /test
**Depends on:** T1

### Step T2.1 — Write the failing middleware test

`packages/api/typescript/core/src/middlewares/RateLimitMiddleware.test.ts`. `reflect-metadata` is imported first because `@singleton()` runs at module load.

```typescript
import 'reflect-metadata'
import { describe, it, expect } from 'bun:test'
import type { HttpControllerRequest } from '../types/Http'
import { RateLimitStore, type RateLimitResult, InMemoryRateLimitStore } from '../services/RateLimitStore'
import { RateLimitMiddleware } from './RateLimitMiddleware'

// sign-in is configured at max 5 / window in the middleware's action table.
function signInReq(ip: string, email?: string): HttpControllerRequest<unknown> {
	return {
		url: `http://localhost/v1/authentication/sign-in/email`,
		headers: { 'x-forwarded-for': ip },
		body: email ? { email } : {},
		ctx: {},
		raw: new Request('http://localhost/v1/authentication/sign-in/email'),
	} as unknown as HttpControllerRequest<unknown>
}

async function hammer(mw: RateLimitMiddleware, req: HttpControllerRequest<unknown>, times: number) {
	for (let i = 0; i < times; i++) await mw.execute(req)
}

describe('RateLimitMiddleware', () => {
	it('passes a request that does not match any configured action', async () => {
		const mw = new RateLimitMiddleware(new InMemoryRateLimitStore())
		const req = { url: 'http://localhost/v1/authentication/get-session', headers: {}, body: {}, ctx: {}, raw: new Request('http://localhost/') } as unknown as HttpControllerRequest<unknown>
		await expect(mw.execute(req)).resolves.toMatchObject({})
	})

	it('throws RATE_LIMITED once the IP exceeds the sign-in budget', async () => {
		const mw = new RateLimitMiddleware(new InMemoryRateLimitStore())
		const req = signInReq('1.1.1.1', 'a@example.com')
		await hammer(mw, req, 5)
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'RATE_LIMITED' })
	})

	it('throws RATE_LIMITED on the email counter even when each IP is under its own limit', async () => {
		const mw = new RateLimitMiddleware(new InMemoryRateLimitStore())
		// 5 distinct IPs, same victim email → IP counters all at 1, email counter at 5.
		for (let i = 0; i < 5; i++) await mw.execute(signInReq(`10.0.0.${i}`, 'victim@example.com'))
		await expect(mw.execute(signInReq('10.0.0.99', 'victim@example.com'))).rejects.toMatchObject({ name: 'RATE_LIMITED' })
	})

	it('evaluates only the IP counter when no email is present', async () => {
		const mw = new RateLimitMiddleware(new InMemoryRateLimitStore())
		const req = signInReq('2.2.2.2')
		await hammer(mw, req, 5)
		// 6th from same IP is blocked (IP counter), proving the path still runs without an email.
		await expect(mw.execute(req)).rejects.toMatchObject({ name: 'RATE_LIMITED' })
	})

	it('scopes counters per sub-action — exhausting sign-in does not block sign-up', async () => {
		const mw = new RateLimitMiddleware(new InMemoryRateLimitStore())
		await hammer(mw, signInReq('3.3.3.3', 'x@example.com'), 5)
		const signUp = { url: 'http://localhost/v1/authentication/sign-up/email', headers: { 'x-forwarded-for': '3.3.3.3' }, body: { email: 'x@example.com' }, ctx: {}, raw: new Request('http://localhost/') } as unknown as HttpControllerRequest<unknown>
		await expect(mw.execute(signUp)).resolves.toMatchObject({})
	})

	it('fails open (allows) when the store throws', async () => {
		const throwingStore: RateLimitStore = { hit: async (): Promise<RateLimitResult> => { throw new Error('redis down') } }
		const mw = new RateLimitMiddleware(throwingStore)
		await expect(mw.execute(signInReq('4.4.4.4', 'a@example.com'))).resolves.toMatchObject({})
	})
})
```

### Step T2.2 — Run test to verify it fails

Run: `cd packages/api/typescript/core && bun test src/middlewares/RateLimitMiddleware.test.ts`
Expected: FAIL with `Cannot find module './RateLimitMiddleware'`

### Step T2.3 — Register the error code

Modify `packages/api/typescript/core/src/errors/codes.ts`:
- Change `BaseInterfaceErrors` to include `'RATE_LIMITED'`:

```diff
-export type BaseInterfaceErrors = 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'INVALID_CONTROLLER_EXAMPLES' | 'CANNOT_CONVERT_INPUT'
+export type BaseInterfaceErrors = 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION_ERROR' | 'INVALID_CONTROLLER_EXAMPLES' | 'CANNOT_CONVERT_INPUT' | 'RATE_LIMITED'
```

### Step T2.4 — Map the error to 429

Modify `packages/api/typescript/core/src/utils/GlobalErrorMapper.ts`:
In the seeded `registry`, after the `VALIDATION_ERROR: HttpStatusCode.BAD_REQUEST,` entry, add:

```typescript
	RATE_LIMITED: HttpStatusCode.TOO_MANY_REQUESTS,
```

### Step T2.5 — Write the middleware

`packages/api/typescript/core/src/middlewares/RateLimitMiddleware.ts`. Keyed per better-auth sub-action; dual IP + email counters; fail-open on store error. Defaults live in the action table (config, tunable later).

```typescript
import { singleton } from 'tsyringe-neo'
import { BaseError } from '../types/BaseError'
import type { BaseInterfaceErrors } from '../errors/codes'
import type { HttpControllerRequest, HttpMiddlewareResponse } from '../types/Http'
import type { Middleware } from '../types/Middleware'
import { RateLimitStore } from '../services/RateLimitStore'

/**
 * Per-sub-action brute-force throttle for the Better-Auth passthrough. For a
 * request whose path matches a configured action, it counts hits per client IP
 * and (when present) per email; either counter overflowing rejects with
 * `RATE_LIMITED` (→ 429). Unmatched paths pass through untouched. Fail-open: a
 * store error is logged and the request is allowed, so a Redis outage never
 * locks users out of auth.
 */
interface RateLimitAction {
	/** Matched against the request path via `includes`. */
	match: string
	max: number
	windowMs: number
}

const MINUTE = 60_000

const ACTIONS: readonly RateLimitAction[] = [
	{ match: '/authentication/sign-in/email', max: 5, windowMs: MINUTE },
	{ match: '/authentication/sign-up/email', max: 5, windowMs: 15 * MINUTE },
	{ match: '/authentication/forget-password', max: 3, windowMs: 15 * MINUTE },
]

@singleton()
export class RateLimitMiddleware implements Middleware {
	constructor(private store: RateLimitStore) {}

	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const path = this.pathOf(request)
		const action = ACTIONS.find(a => path.includes(a.match))
		if (!action) return {}

		const ip = this.clientIp(request)
		const email = this.email(request)

		const keys = [`${action.match}:ip:${ip}`]
		if (email) keys.push(`${action.match}:email:${email}`)

		try {
			for (const key of keys) {
				const result = await this.store.hit(key, action.windowMs, action.max)
				if (!result.allowed) throw new BaseError<BaseInterfaceErrors>('RATE_LIMITED')
			}
		} catch (error) {
			if (error instanceof BaseError) throw error
			// Fail-open on infrastructure failure (e.g. Redis unreachable).
			console.warn('[RateLimitMiddleware] store error — allowing request (fail-open):', error)
		}
		return {}
	}

	private pathOf(request: HttpControllerRequest<unknown>): string {
		try {
			return new URL(request.url).pathname
		} catch {
			return request.url ?? ''
		}
	}

	private clientIp(request: HttpControllerRequest<unknown>): string {
		const forwarded = request.headers?.['x-forwarded-for']
		if (forwarded) return forwarded.split(',')[0].trim()
		return 'unknown'
	}

	private email(request: HttpControllerRequest<unknown>): string | undefined {
		const value = (request.body as Record<string, unknown> | undefined)?.email
		return typeof value === 'string' && value.length > 0 ? value.toLowerCase() : undefined
	}
}
```

### Step T2.6 — Write the middlewares barrel + export from core

Create `packages/api/typescript/core/src/middlewares/index.ts`:

```typescript
export { RateLimitMiddleware } from './RateLimitMiddleware'
```

Modify `packages/api/typescript/core/src/index.ts`:
After the `export * from './services/RateLimitStore'` line (added in T1), add:

```typescript
export * from './middlewares'
```

### Step T2.7 — Bind the store per env in the auth registry

Modify `packages/api/typescript/src/auth/registry.ts`:
- Add to the import from `@template/core-typescript`: `RateLimitStore, InMemoryRateLimitStore, RedisRateLimitStore` (alongside `InstanceRegistry`).
- In `mock` and `integration` arrays, add: `{ token: RateLimitStore, instance: InMemoryRateLimitStore }`
- In `real` array, add: `{ token: RateLimitStore, instance: RedisRateLimitStore }`

```diff
-import type { InstanceRegistry } from '@template/core-typescript'
+import { type InstanceRegistry, RateLimitStore, InMemoryRateLimitStore, RedisRateLimitStore } from '@template/core-typescript'
```

```diff
 	mock: [
 		{ token: UserRepository, instance: MockUserRepository },
 		{ token: AccountRepository, instance: MockAccountRepository },
+		{ token: RateLimitStore, instance: InMemoryRateLimitStore },
 	],
 	integration: [
 		{ token: UserRepository, instance: DrizzleUserRepository },
 		{ token: AccountRepository, instance: DrizzleAccountRepository },
 		{ token: UserDirectoryService, instance: AuthUserDirectoryService },
+		{ token: RateLimitStore, instance: InMemoryRateLimitStore },
 	],
 	real: [
 		{ token: UserRepository, instance: DrizzleUserRepository },
 		{ token: AccountRepository, instance: DrizzleAccountRepository },
 		{ token: UserDirectoryService, instance: AuthUserDirectoryService },
+		{ token: RateLimitStore, instance: RedisRateLimitStore },
 	],
```

### Step T2.8 — Attach the middleware to the passthrough controller

Modify `packages/api/typescript/src/auth/controllers/AuthController.ts`:
- Add to the `@template/core-typescript` import: `RateLimitMiddleware` and the `Middleware`/`MiddlewareClass` types.
- Add the override on the class (real auth traffic flows through this passthrough):

```diff
-import { z, Controller, BaseError, tryCatchAsync } from '@template/core-typescript'
-import type { HttpMethod, BaseInterfaceErrors } from '@template/core-typescript'
+import { z, Controller, BaseError, tryCatchAsync, RateLimitMiddleware } from '@template/core-typescript'
+import type { HttpMethod, BaseInterfaceErrors, Middleware, MiddlewareClass } from '@template/core-typescript'
```

Add inside the class body, after `readonly outputSchema = AuthControllerOutput`:

```typescript
	override middlewares: (Middleware | MiddlewareClass)[] = [RateLimitMiddleware]
```

### Step T2.9 — Run test to verify it passes

Run: `cd packages/api/typescript/core && bun test src/middlewares/RateLimitMiddleware.test.ts`
Expected: PASS — 6 tests pass

### Step T2.10 — Type check + lint

Run: `cd packages/api/typescript/core && bun x tsc -p tsconfig.build.json --noEmit && cd /Users/work/Desktop/Projetos/pessoal/template-fullstack/packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && cd /Users/work/Desktop/Projetos/pessoal/template-fullstack && bun lint`
Expected: 0 errors

### Step T2.11 — Commit

```bash
git add packages/api/typescript/core/src/errors/codes.ts \
        packages/api/typescript/core/src/utils/GlobalErrorMapper.ts \
        packages/api/typescript/core/src/middlewares/ \
        packages/api/typescript/core/src/index.ts \
        packages/api/typescript/src/auth/registry.ts \
        packages/api/typescript/src/auth/controllers/AuthController.ts
git commit -m "feat(auth): rate-limit middleware on auth passthrough (IP+email, fail-open) (Task T2)"
```

---

## Task T3: Contract Lock — SDK regen + frontend translation for RATE_LIMITED

**Files to write:**
- Regen: `packages/api/typescript/src/api/openapi.json`
- Regen: `packages/client/dist/**`
- Modify: `packages/app/react/src/locales/en.json` — add `errors.RATE_LIMITED`
- Modify: `packages/app/react/src/locales/pt.json` — add `errors.RATE_LIMITED`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T2

### Step T3.1 — Regenerate OpenAPI + SDK

`RATE_LIMITED` is now in `GlobalErrorMapper`, so the OpenAPI error enum picks it up and Kubb emits it into `apiErrorsEnum`.

```bash
bun emit-openapi && bun sdk
```

### Step T3.2 — Verify the code reached the SDK error enum

```bash
grep -rn "RATE_LIMITED" packages/client/dist/ packages/api/typescript/src/api/openapi.json | head
```

Expected: at least one match in `packages/client/dist/` (the generated `apiErrorsEnum`) and in `openapi.json`.

### Step T3.3 — Add the i18n translations

Modify `packages/app/react/src/locales/en.json`:
Inside the `"errors"` object, add:

```json
"RATE_LIMITED": "Too many attempts. Please wait a moment and try again.",
```

Modify `packages/app/react/src/locales/pt.json`:
Inside the `"errors"` object, add:

```json
"RATE_LIMITED": "Muitas tentativas. Aguarde um momento e tente novamente.",
```

### Step T3.4 — Type-check after regen

Run: `bun tsc`
Expected: 0 errors across all workspaces.

### Step T3.5 — Commit

```bash
git add packages/api/typescript/src/api/openapi.json packages/client/dist/ \
        packages/app/react/src/locales/en.json packages/app/react/src/locales/pt.json
git commit -m "chore(sdk): regen openapi+sdk for RATE_LIMITED + frontend i18n (Task T3)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `cd packages/api/typescript/core && bun test src/services/RateLimitStore src/middlewares` — store + middleware tests pass
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 (`hit(key, windowMs, max)` → allowed + remaining) → `core/src/services/RateLimitStore/RateLimitStore.test.ts:"allows hits up to max and reports remaining"`
  - AC-2 (Redis atomic incr+expire; concurrent hits share one counter) → `core/src/services/RateLimitStore/RedisRateLimitStore.ts` (atomic Lua `eval`; behavior contract verified via `RateLimitStore.test.ts:"denies the N+1th hit within the window"`). Not unit-tested live — no Redis in the test env, same posture as `RedisCredentialHandleStore`.
  - AC-3 (in-memory impl bound for mock/integration; tests run without Redis) → `core/src/services/RateLimitStore/RateLimitStore.test.ts` (entire suite, InMemory) + `auth/registry.ts` mock/integration bindings
  - AC-4 (IP counter exceeded → RATE_LIMITED) → `core/src/middlewares/RateLimitMiddleware.test.ts:"throws RATE_LIMITED once the IP exceeds the sign-in budget"`
  - AC-5 (email counter exceeded, independent of IP) → `core/src/middlewares/RateLimitMiddleware.test.ts:"throws RATE_LIMITED on the email counter even when each IP is under its own limit"`
  - AC-6 (no email → only IP counter) → `core/src/middlewares/RateLimitMiddleware.test.ts:"evaluates only the IP counter when no email is present"`
  - AC-7 (per-sub-action scoping) → `core/src/middlewares/RateLimitMiddleware.test.ts:"scopes counters per sub-action — exhausting sign-in does not block sign-up"`
  - AC-8 (`RATE_LIMITED` registered + mapped to 429) → `core/src/utils/GlobalErrorMapper.ts` entry; thrown as `BaseError<'RATE_LIMITED'>` asserted in `RateLimitMiddleware.test.ts` (the rejects.toMatchObject cases)
  - AC-9 (fail-open on store error) → `core/src/middlewares/RateLimitMiddleware.test.ts:"fails open (allows) when the store throws"`
  - AC-10 (`AuthController` has the middleware; over-threshold → 429) → `auth/controllers/AuthController.ts` `override middlewares = [RateLimitMiddleware]` + the middleware throw cases above
  - AC-11 (frontend gets the typed code) → `packages/client/dist/**` `apiErrorsEnum` contains `RATE_LIMITED` (verified Step T3.2) + `locales/en.json` & `pt.json` `errors.RATE_LIMITED`

## Notes

- **No E2E task.** Driving a real 429 over the Better-Auth passthrough requires Redis/Docker and many sequential live login attempts; the behavior is fully covered by the middleware unit tests with `InMemoryRateLimitStore`. If an E2E smoke is wanted later, it belongs in `packages/e2e` and is out of scope for this plan (spec has no E2E AC).
- **No new env var.** `Config.env.REDIS_URL` already exists (defaults to `redis://localhost:6379`).
- **Action thresholds** (`sign-in` 5/min, `sign-up` 5/15min, `forget-password` 3/15min) are defaults in the middleware's `ACTIONS` table — tune there; the spec left exact values open.
- **`reset-password`** is intentionally not rate-limited at the IP/email layer — it carries a single-use token, not an email, so brute-forcing it is a different (token-guessing) concern out of scope here.
- Authoritative backend type-check uses `tsconfig.build.json` (skips the `bun:test` noise raw `tsc` emits for test files), per CLAUDE.md.
