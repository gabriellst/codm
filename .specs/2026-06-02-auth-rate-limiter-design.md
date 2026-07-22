# Auth Rate Limiter — Design Spec

**Date:** 2026-06-02
**Status:** Approved
**Bounded Context:** cross-context: `core` (new `RateLimitStore` service + middleware), `auth` (controller wiring)
**Kind:** feature
**Story Points:** 5 — one area (core + auth) end-to-end; several coordinated artifacts (store interface + Redis impl + in-memory impl + middleware + error code + DI wiring + tests); no migration, no new entity, no cross-service contract.

## Context

The TS API wraps Fastify entirely behind `core/src/services/HttpRouter/FastifyHttpRouter.ts` — controllers never touch Fastify; they go through the `Controller` → `Middleware` abstraction (`core/src/types/Middleware.ts`, `core/src/types/Controller.ts`). A `Middleware` runs *before* the controller's `handle()` (via `Controller.executeMiddlewares()`), receives the client IP (`x-forwarded-for`), the parsed request body, headers, and the raw Web Request, and signals failure by throwing `BaseError<Code>`, which `core/src/utils/GlobalErrorMapper.ts` turns into an HTTP status. `InternalSecretKeyMiddleware` (`src/billing/middlewares/InternalSecretKeyMiddleware.ts`) and `RequireStoreMember` (`src/auth/middlewares/`) are the templates.

Redis is already a first-class dependency via `ioredis`: `RedisExternalMediator` and `BullMQCommandQueue` in core, plus `RedisCredentialHandleStore` (`src/integration/services/CredentialHandleStore/RedisCredentialHandleStore.ts`) which news up `new IORedis(Config.env.REDIS_URL, …)`. There is no shared singleton Redis client in core today — each consumer constructs its own.

The login/signup/password-reset surface is a single Better-Auth passthrough controller, `src/auth/controllers/AuthController.ts`, mounted at `/authentication/*`. It forwards the raw Web Request to Better-Auth, so all auth mutations share one HTTP entry point. There is a `429` precedent already: `integration/errors/index.ts` registers `REINTEGRATION_RATE_LIMITED → TOO_MANY_REQUESTS`, and `HttpStatusCode.TOO_MANY_REQUESTS` exists in `core/src/types/Http.ts`. `@fastify/rate-limit` is **not** installed.

## Problem

The API has no throttling on its most attackable surface. The `/authentication/*` passthrough accepts unlimited login, signup, and password-reset attempts, leaving the system open to credential-stuffing and brute-force attacks. The 429 status code exists in the framework, but nothing on the auth surface emits it.

## Goal

Sensitive auth routes become resistant to brute-force and credential-stuffing: repeated attempts from a single client IP, or repeated attempts against a single account email, are counted in Redis and rejected with a `429 RATE_LIMITED` once a configured threshold is crossed within a time window — without locking legitimate users out during a Redis outage.

## Decisions

1. **Approach B — domain middleware, not the Fastify plugin.** Rate limiting is implemented as a first-class `Middleware` citizen backed by a `core` `RateLimitStore` service, *not* via `@fastify/rate-limit`. The plugin sits below the Controller/Middleware abstraction, can't cleanly key on request identity (email in body), and emits its own 429 shape instead of the project's typed `BaseError` → `GlobalErrorMapper` → frontend i18n path.
2. **Redis-backed store with an in-memory sibling.** `RateLimitStore` is an interface in `core/src/services/RateLimitStore/`. `RedisRateLimitStore` uses `ioredis` + `Config.env.REDIS_URL` (the existing pattern). `InMemoryRateLimitStore` backs the `mock`/`integration` DI environments so tests stay Docker-free (per the project testing convention).
3. **Fixed-window counter algorithm for v1.** The Redis impl does an atomic `INCR` and sets the window TTL on first hit (single round-trip via a small Lua script, or `INCR` + conditional `PEXPIRE`). Sliding-window is noted as a future upgrade and is **not** built now.
4. **Dual keying: IP + email.** Each request produces two independent counters — one keyed on client IP, one on the email in the request body. The request is rejected if *either* counter exceeds its threshold. The email counter is only applied when an email is present in the body; otherwise only the IP counter applies.
5. **Per-route-suffix budgets.** Under the `/authentication/*` passthrough, the key incorporates the auth sub-action (e.g. `sign-in`, `sign-up`, `forget-password`) so a flood against one action does not consume another action's budget.
6. **Fail-open on store failure.** If the store (Redis) is unreachable or errors, the middleware allows the request and logs a warning. A Redis outage must never lock all users out of authentication.
7. **`RATE_LIMITED` registered in core.** Because the concern is cross-cutting (any controller can opt in), `RATE_LIMITED: HttpStatusCode.TOO_MANY_REQUESTS` is seeded in core's `GlobalErrorMapper` base registry, not a single context's `errors/index.ts`. A matching frontend i18n key is added.
8. **Attached to `AuthController` initially.** Real auth traffic flows through the Better-Auth passthrough controller `AuthController` (`/authentication/*`); the dedicated `SignInController`/`SignUpController`/etc. are `mockController` contract surfaces and are NOT enforcement points. The middleware attaches to `AuthController` and keys by the better-auth sub-path (`sign-in/email`, `sign-up/email`, `forget-password`). The middleware is generic; other controllers can opt in later.
9. **Idiomatic throw, no `Retry-After` for v1.** The middleware throws `BaseError<'RATE_LIMITED'>` (the project's standard middleware error path → `GlobalErrorMapper` → typed code body the frontend reads), rather than returning a short-circuit response. A `Retry-After` header is **deferred**: the throw path can't carry custom headers without a core framework change, and the frontend keys on the error code, not the header. Noted as a future enhancement.

## User Stories

- **Story 1:** As the platform operator, I want repeated failed logins from one IP to be throttled, so that credential-stuffing from a single host is slowed to an ineffective rate.
  - Given an IP has made `max` requests to `sign-in` within `windowMs`, when it makes one more, then the API responds `429` with code `RATE_LIMITED`.
  - Given the window elapses, when the IP retries, then the request is allowed again.

- **Story 2:** As an account holder, I want attempts against my email to be throttled across source IPs, so that a distributed attack targeting my account is also slowed.
  - Given `max` `sign-in` attempts have been made against `victim@example.com` within `windowMs` (from any mix of IPs), when another attempt against that email arrives, then the API responds `429 RATE_LIMITED` even though the new request's IP is under its own limit.

- **Story 3:** As a legitimate user, I want authentication to keep working when Redis is down, so that an infrastructure outage doesn't lock me out.
  - Given the rate-limit store is unreachable, when I submit valid credentials, then the request is allowed (fail-open) and a warning is logged.

- **Story 4:** As a developer, I want a generic `RateLimitMiddleware` configurable with `{ max, windowMs }`, so that I can protect another controller later by adding it to that controller's `middlewares` list.

## Acceptance Criteria

- [ ] AC-1: A `RateLimitStore` interface exists in `core/src/services/RateLimitStore/` exposing a `hit(key, windowMs, max)` operation returning whether the request is allowed plus the remaining count.
- [ ] AC-2: `RedisRateLimitStore` increments a per-key counter atomically and expires it after `windowMs`; concurrent hits to the same key within the window share one counter (no lost increments).
- [ ] AC-3: `InMemoryRateLimitStore` implements the same interface and is bound in the `mock`/`integration` DI environments; the middleware's tests run without Redis/Docker.
- [ ] AC-4: `RateLimitMiddleware` rejects a request with `BaseError<'RATE_LIMITED'>` when the IP counter for that route exceeds `max` within `windowMs`.
- [ ] AC-5: `RateLimitMiddleware` rejects a request with `BaseError<'RATE_LIMITED'>` when the email counter for that route exceeds `max` within `windowMs`, independent of the IP counter.
- [ ] AC-6: When no email is present in the body, only the IP counter is evaluated (no email counter is created).
- [ ] AC-7: Counters are scoped per auth sub-action — exhausting `sign-up` does not cause `sign-in` to be throttled.
- [ ] AC-8: `RATE_LIMITED` is registered in `GlobalErrorMapper` and a breach throws `BaseError<'RATE_LIMITED'>`, which the framework maps to HTTP `429`.
- [ ] AC-9: When the store throws, the middleware allows the request (fail-open) and logs a warning rather than returning an error.
- [ ] AC-10: `AuthController` has `RateLimitMiddleware` in its `middlewares` list; a request flow over the configured threshold against `/authentication/*` returns `429`.
- [ ] AC-11: A frontend i18n key for `RATE_LIMITED` exists so the typed code renders a user-facing message.

## Open Questions

- Concrete default values for `max` / `windowMs` per auth sub-action (e.g. sign-in 5/min, forget-password 3/15min) — to be set during `/plan`; they are configuration, not architecture.

## Risks & Migration

- **Shared NAT / corporate proxies** share an IP budget; the email counter mitigates false positives for the targeted-account case, but a large office behind one IP could hit the IP limit. Tunable via the per-route `max`; not a blocker for v1.
- **Fail-open trade-off:** during a Redis outage the auth surface is unprotected. Accepted (Decision 6) — availability of login outweighs throttling during an infra incident; the warning log makes the gap observable.
- No database migration and no cross-service contract; rollback is removing the middleware from `AuthController`.
