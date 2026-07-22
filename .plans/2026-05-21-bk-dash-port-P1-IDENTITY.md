# P1-IDENTITY — BK Dash Identity Bounded Context — Implementation Plan (polyglot rebase, iter 43)

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax for tracking.
> Each Task wraps **one observable behavior** in an outer RED→GREEN cycle (test first → impl → verify → commit).
> Files land under `packages/api/typescript/src/identity/` (new BC on the polyglot TS api). NO BC2..BC11 code
> in this sub-plan. NO Drizzle schema authoring — `packages/contracts/db/schema/identity.ts` was already
> landed in iter 42 and exports `userProfiles`, `userPreferences`, `fcmRegistrationTokens`.

**Goal:** Land BC1 Identity per spec §1.2, §4 BC1, §7.1: a stable `BK_DASH_NAMESPACE` constant (declared once
in `packages/api/typescript/core/src/objects/HashedID.ts`, never re-declared), three Identity aggregates
(`UserProfile`, `UserPreferences`, `FcmRegistrationToken`), the Identity-scoped domain events, repositories
that consume `@template/contracts/db` tables, eleven commands (C01–C11), six reads (T01–T06), the per-context
error glossary registered via `registerErrorCodes`, BetterAuth bridge use cases (the existing polyglot
`auth/` BC remains the source of truth for credentials and the `authentication.users` row), and a Contract
Lock that regenerates the SDK. Every command/read in §7.1 has at least one passing test path.

**Architecture:** New bounded context `packages/api/typescript/src/identity/`, mirroring the layout of the
existing polyglot `packages/api/typescript/src/auth/` (controllers/, entities/, errors/, events/, handlers/{internal,external}, middlewares/, objects/, registry.ts, repositories/<Name>Repository/{<Name>Repository,Drizzle<Name>Repository,Mock<Name>Repository,index}.ts, usecases/, index.ts using `BoundedContext.create({…})`). The Identity `User` concept is **modelled as a separate `UserProfile` aggregate** sitting beside polyglot's `authentication.users` row (id-shared via FK), not by mutating the polyglot `auth.User`. `UserProfile` persists BK Dash-specific user fields (`timezone`, `language`, `brazilianTaxId`, `leadToken`) into `@template/contracts/db` → `identity.user_profiles`. `UserPreferences` persists into `identity.user_preferences`. `FcmRegistrationToken` persists into `identity.fcm_registration_tokens`. **All three tables already exist in `packages/contracts/db/schema/identity.ts`** — repositories consume those exports directly; this sub-plan creates **no** new SQL and **no** new Drizzle table definitions.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe-neo, Zod, BetterAuth, PostgreSQL, polyglot `@template/core-typescript` primitives, polyglot `@template/contracts/db` schemas, polyglot `@template/contracts-typescript/wire/enums` cross-language enums.
**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md` (§1.2 Functional Requirements, §4 BC1 Identity, §7.1 Identity Reads & Commands).
**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (sub-plan P1-IDENTITY — see iter 39 polyglot rebase addendum at end of file).
**Depends on:** iter 41 (`packages/contracts/wire/enums/` — already authored: `fcm-platform.tsp`, `notification-currency-mode.tsp`, `currency-code.tsp`, `role.tsp`), iter 42 (`packages/contracts/db/schema/identity.ts` — already authored).
**Tasks:** 18
**Estimated minutes:** ~340

---

## Convention reference (absorbed during planning, NOT to be re-read by /build)

- BC skeleton mirror: `packages/api/typescript/src/auth/` — has `controllers/`, `entities/`, `errors/index.ts` (with side-effect `registerErrorCodes({…})`), `events/`, `handlers/{internal.ts,external.ts,<Name>Handler.ts}`, `middlewares/`, `objects/`, `registry.ts` (exports `INSTANCE_REGISTRY: InstanceRegistry`), `repositories/<Name>Repository/{<Name>Repository.ts,Drizzle<Name>Repository.ts,Mock<Name>Repository.ts,index.ts}`, `usecases/`, `index.ts` that calls `BoundedContext.create({ name, controllers, internalHandlers, externalHandlers, registry })`.
- Entity shape: `packages/api/typescript/src/auth/entities/User.ts` — Zod schema, exports `<X>Props = z.infer<typeof XSchema>`, class extends `AggregateRoot<typeof XSchema>` from `@template/core-typescript`, `static override schema`, `static create(data)`. **Always end with `export interface <X> extends <X>Props {}`**. Imports `z` from `@template/core-typescript` (NOT from `zod` directly).
- Repository abstract pattern: `packages/api/typescript/src/auth/repositories/UserRepository/UserRepository.ts` — `abstract class … extends Repository<X>` from `@template/core-typescript`, paired `DrizzleXRepository.ts` (uses `DrizzleClient` from `@template/core-typescript`, imports schema from `@template/contracts/db`, optionally `entity.incrementVersion()` + UPSERT) and `MockXRepository.ts` (in-memory `Map`).
- Use case: `packages/api/typescript/src/auth/usecases/RegisterUser.ts` — `@injectable()`, `extends Handler<typeof InputSchema, typeof OutputSchema>`, `readonly name`, `readonly inputSchema`, `readonly outputSchema`, `protected async handle(input, tx?)` returns `this.withTransaction(tx, async tx => { … this.domainEventRepository.save(event, tx) … })`.
- Controller: `packages/api/typescript/src/auth/controllers/GetSession.ts` — `@injectable()`, `extends Controller<typeof I, typeof O>` from `@template/core-typescript`, `readonly path: '/${string}'`, `readonly method`, `readonly description`, `readonly inputSchema`, `readonly outputSchema`. Returns `{ status: HttpStatusCode.X, data: … }`. SDK regeneration is invoked by Task 18 — Contract Lock.
- Event: `packages/api/typescript/src/auth/events/UserRegisteredEvent.ts` — `z.domainEvent({…})` + class extending `BaseDomainEvent<typeof Schema>` with `static override readonly name = '<ctx>.<entity>.<verb>' as const` + `static readonly schema`.
- Handler: `packages/api/typescript/src/auth/handlers/UserRegisteredHandler.ts` — `@injectable()`, `extends EventHandler<typeof E>` from `@template/core-typescript`, `readonly event = E`, `async handle(event)`. Re-exported from `handlers/internal.ts` (in-process) or `handlers/external.ts` (cross-service via `RedisExternalMediator`).
- Errors: `packages/api/typescript/src/auth/errors/index.ts` — typed string unions per layer (`DomainErrors`, `ApplicationErrors`, `InterfaceErrors`, `InfrastructureErrors`) composed into `Errors`; side-effect `registerErrorCodes({ CODE: HttpStatusCode.X })` at module bottom; `registry.ts` does `import './errors'` to ensure the registration runs.
- BC index: `packages/api/typescript/src/auth/index.ts` — `const ctx = await BoundedContext.create({ name: '', controllers, internalHandlers, externalHandlers, registry: INSTANCE_REGISTRY }); export default ctx.router`. Top-level router import + `routers` array slot lives in `packages/api/typescript/src/index.ts`.
- DI registry: `packages/api/typescript/src/auth/registry.ts` — exports `INSTANCE_REGISTRY: InstanceRegistry` with keys `mock`/`integration`/`real` listing `{ token, instance }` pairs for every repository; first line of file is `import './errors'` (side-effect: register error codes).
- Test placement: colocated `<File>.test.ts`. Use `bun:test`. Integration tests use the polyglot harness; see `packages/api/typescript/src/auth/controllers/GetSession.test.ts` and the existing flows under `packages/api/typescript/src/**/*.test.ts` for the canonical TestBed shape.
- Contracts:
  - **DB schema** import path is `@template/contracts/db` (re-exports `userProfiles`, `userPreferences`, `fcmRegistrationTokens` from `packages/contracts/db/schema/identity.ts`, plus polyglot's `users` from `auth.ts`).
  - **Wire enums** import path is `@template/contracts-typescript/wire/enums` (re-exports `FcmPlatform`/`FcmPlatformSchema`, `NotificationCurrencyMode`/`NotificationCurrencyModeSchema`, `CurrencyCode`/`CurrencyCodeSchema`, `Role`/`RoleSchema`).
  - **Wire events** import path is `@template/contracts-typescript/wire/events` (cross-language integration events). Identity does NOT author any new integration events in this sub-plan.

---

# QUESTION: Should the Identity `User` concept be a *separate* `UserProfile` aggregate or a mutation of polyglot's existing `auth.User`?

**Recommended choice (proceeding):** Separate `UserProfile` aggregate, persisted into the existing
`identity.user_profiles` table (1:1 FK to `authentication.users.id` with `ON DELETE CASCADE`). The
polyglot `auth.User` aggregate owns the BetterAuth-managed columns (`email`, `emailVerified`, `name`,
`image`). Identity owns the BK Dash-specific columns (`timezone`, `language`, `brazilianTaxId`,
`leadToken`). This matches `packages/contracts/db/schema/identity.ts`'s explicit schema separation
("`user_profiles` … supplements that with three aggregates") and avoids cross-context column ownership.
Spec §4 BC1 lists `pictureUrl?` and `disabledAt?` on the User aggregate — `pictureUrl` is already covered
by polyglot's `auth.users.image`; `disabledAt` is NOT in the iter-42 schema so we proxy it as a derived
boolean (a `disabled_at` column can be added in a follow-up migration if a sub-plan that actually toggles
disable/enable lands — for now, the entity exposes the field but only persists `null`).

# QUESTION: Does C02 SignUp own BetterAuth account creation or is it a pre-existing flow?

**Recommended choice (proceeding):** Reuse polyglot's existing `auth/` BC for the BetterAuth lifecycle.
Identity adds **bridge use cases** (Task 14) — `EmitSignUpEvents`, `EmitSignInEvent`, etc. — that the
`auth/` BC's BetterAuth service invokes from its lifecycle hooks (`user.create.after`, `session.create.after`,
`session.delete.after`, password hooks). The bridge use cases:
1. Create the default `UserProfile` row (if absent) and the default `UserPreferences` row in the same outbox
   transaction as the spec-named `identity.user.registered` domain event.
2. Look up any prior `identity.lead.captured` event for the email and mark conversion (`leadEmail` field on
   the registered event payload).
3. Emit the spec-named pass-through events (`identity.user.signed_in`, `identity.user.signed_out`,
   `identity.user.password_changed`, …) for downstream contexts.

A new `packages/api/typescript/src/identity/controllers/SignUp.ts` is therefore NOT created. The polyglot
`auth/` BC's BetterAuth flow remains canonical for C02–C07.

# QUESTION: Where does `BK_DASH_NAMESPACE` live in TS?

**Recommended choice (proceeding):** Per the prompt, polyglot's `packages/api/typescript/core/src/objects/HashedID.ts`
owns the locked namespace value `f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e` (mirrors the Go side at
`packages/api/go/core/objects/id.go`). Identity **imports** `BK_DASH_NAMESPACE` from `@template/core-typescript`
when it needs to derive deterministic IDs (e.g. canonical entities downstream); it does **not** re-declare
the constant. Task 1 below is therefore a **reference-lock test** that imports the constant and asserts
the byte-for-byte value, NOT a constant declaration. If `HashedID.ts` is missing on the working tree at the
time of /build, escalate — do not author the file in this sub-plan (out of scope).

# QUESTION: Is `disabledAt` on `UserProfile` persisted or in-memory only at this phase?

**Recommended choice (proceeding):** In-memory only. The iter-42 `identity.user_profiles` table does not
have a `disabled_at` column. Spec §4 BC1 lists it as a User field, but no Identity command in §7.1 toggles
it — DisableUser is a Tenancy-adjacent admin concern, not part of C01–C11. The `UserProfile` aggregate
exposes `disabledAt?: Date` and the entity has `disable()`/`enable()` methods (so future use cases can
adopt them without breaking the schema), but the repository's `toPersistence` ignores the field. When
P2-TENANCY or a future admin sub-plan needs persisted disablement, a one-column ALTER + repo update lands
there.

---

## Task 1: Reference-lock the deterministic-ID algorithm parity between TS and Go ✅ DONE iter 45

> **CRITICAL — this is the P1-only special responsibility.** The polyglot core ships
> `Id.fromHash(value)` in both languages (`packages/api/typescript/core/src/objects/Id.ts`
> and `packages/api/go/core/objects/id.go`). Both use the same algorithm:
> `sha256(values.join('-')).hex().slice(0, 32)` reformatted as a UUID 8-4-4-4-12. Any
> drift in either implementation silently orphans every previously-ingested canonical row
> across services. This task locks the algorithm via golden-value tests.
>
> **NOTE:** the original spec §"Deterministic IDs" mandated UUIDv5 with a
> `BK_DASH_NAMESPACE` constant. Polyglot chose SHA-256-truncated instead; both backends
> consistently use it. The spec's core property (same provider entity → same row across
> services) is preserved. See iter 43.5 audit in `.plans/2026-05-21-bk-dash-port.progress.md`.

**Files:**
- Create: `packages/api/typescript/src/identity/objects/index.ts` — placeholder barrel (BC-local VOs land in future tasks)
- Test: `packages/api/typescript/src/identity/objects/HashedIdParity.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** (none — pure algorithm parity lock)
**Depends on:** (none — uses polyglot core `Id.fromHash` as shipped)

- [x] **Step 1: Capture Go golden values** — already done in iter 43.5 (empirical
  side-by-side run). Three golden values:
  - `Id.fromHash(['SHOPIFY', '8123456789'])` → `203dcc85-b1ad-e243-a045-d4a5a74c4ed8`
  - `Id.fromHash(['META', '999000111'])` → `8fb27944-f5cf-65f7-698c-dc4754d19363`
  - `Id.fromHash('order:SHOPIFY:5512345')` → `b1fa8baf-474d-b3ea-c0aa-7a776981807a`
- [x] **Step 2: Write the parity test** — `HashedIdParity.test.ts` with 4 cases (3 golden
  values + 1 array-vs-dash-joined-string equivalence). Test imports `Id` from
  `@template/core-typescript`; no new core code needed.
- [x] **Step 3: Run the test** — `bun test packages/api/typescript/src/identity/objects/HashedIdParity.test.ts` → 4 pass / 0 fail / 4 expect() calls / 1.70s.
- [x] **Step 4: BC-local barrel** — `packages/api/typescript/src/identity/objects/index.ts` is a placeholder (`export {}` + comment pointing at the parity test).
- [x] **Step 5: Type-check** — `bun --filter @template/api-typescript tsc` → 0 errors.
- [x] **Step 6: Commit** — `feat(identity): lock SHA-256 ID parity with Go via golden values (P1 Task 1, iter 45)`.

---

## Task 2: Identity errors barrel + register codes with the framework runtime ✅ DONE iter 46

**Files:**
- Create: `packages/api/typescript/src/identity/errors/index.ts`
- Test: `packages/api/typescript/src/identity/errors/index.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /errors
**Depends on:** (none)

> **Iter-46 deviation:** the original Step-1 test used `expectTypeOf<...>().toExtend<...>()`
> which is a vitest-only helper. bun:test (the polyglot test runner) lacks it. Shipped test
> uses `@ts-expect-error` annotations for compile-time rejection + runtime `BaseError` /
> `GlobalErrorMapper` introspection for code-presence assertions — same coverage, no
> vitest dependency.

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, expectTypeOf, it } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import type { ApplicationErrors, DomainErrors, Errors, InterfaceErrors } from './index'

describe('Identity context error glossary', () => {
	it('DomainErrors covers spec §4 BC1 + §7.1 identity domain failures', () => {
		expectTypeOf<'INVALID_EMAIL'>().toExtend<DomainErrors>()
		expectTypeOf<'PASSWORD_TOO_WEAK'>().toExtend<DomainErrors>()
		expectTypeOf<'INVALID_TIMEZONE'>().toExtend<DomainErrors>()
		expectTypeOf<'INVALID_LANGUAGE'>().toExtend<DomainErrors>()
	})

	it('ApplicationErrors carries Identity-specific lookup failures', () => {
		expectTypeOf<'USER_PROFILE_NOT_FOUND'>().toExtend<ApplicationErrors>()
		expectTypeOf<'USER_PREFERENCES_NOT_FOUND'>().toExtend<ApplicationErrors>()
		expectTypeOf<'FCM_TOKEN_NOT_FOUND'>().toExtend<ApplicationErrors>()
		expectTypeOf<'INVALID_LEAD_TOKEN'>().toExtend<ApplicationErrors>()
	})

	it('throws by typed code', () => {
		const err = new BaseError<Errors>('INVALID_EMAIL', 'bad email')
		expect(err.name).toBe('INVALID_EMAIL')
	})

	it('rejects unknown code at type level', () => {
		// @ts-expect-error
		new BaseError<InterfaceErrors>('NOT_REAL_CODE')
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement**

`packages/api/typescript/src/identity/errors/index.ts`:
```typescript
import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'
import type {
	BaseDomainErrors,
	BaseApplicationErrors,
	BaseInterfaceErrors,
	BaseInfrastructureErrors,
} from '@template/core-typescript'

// Domain errors — per spec §4 BC1 + §7.1 (CaptureLead INVALID_EMAIL, UpdateUserPreferences
// INVALID_TIMEZONE, UpdateProfile INVALID_LANGUAGE).
export type IdentityDomainErrors =
	| 'INVALID_EMAIL'
	| 'PASSWORD_TOO_WEAK'
	| 'INVALID_TIMEZONE'
	| 'INVALID_LANGUAGE'
	| 'INVALID_PICTURE_URL'
export type DomainErrors = BaseDomainErrors | IdentityDomainErrors

// Application errors — Identity-specific lookup + auth failures (T02 INVALID_LEAD_TOKEN,
// T05/T06 UNAUTHORIZED / SESSION_EXPIRED come from base set, profile/prefs/fcm missing).
export type IdentityApplicationErrors =
	| 'USER_PROFILE_NOT_FOUND'
	| 'USER_PREFERENCES_NOT_FOUND'
	| 'FCM_TOKEN_NOT_FOUND'
	| 'INVALID_LEAD_TOKEN'
export type ApplicationErrors = BaseApplicationErrors | IdentityApplicationErrors

export type IdentityInterfaceErrors = never
export type InterfaceErrors = BaseInterfaceErrors | IdentityInterfaceErrors

export type IdentityInfrastructureErrors = never
export type InfrastructureErrors = BaseInfrastructureErrors | IdentityInfrastructureErrors

export type Errors = ApplicationErrors | DomainErrors | InfrastructureErrors | InterfaceErrors

// Side-effect: register these context codes with the framework runtime registry
// (mirrors Go's RegisterErrorCodes() in init()). registry.ts MUST `import './errors'`
// so this runs once at BC bootstrap.
registerErrorCodes({
	INVALID_EMAIL: HttpStatusCode.BAD_REQUEST,
	PASSWORD_TOO_WEAK: HttpStatusCode.BAD_REQUEST,
	INVALID_TIMEZONE: HttpStatusCode.BAD_REQUEST,
	INVALID_LANGUAGE: HttpStatusCode.BAD_REQUEST,
	INVALID_PICTURE_URL: HttpStatusCode.BAD_REQUEST,
	USER_PROFILE_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	USER_PREFERENCES_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	FCM_TOKEN_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	INVALID_LEAD_TOKEN: HttpStatusCode.BAD_REQUEST,
})
```

- [x] **Step 4: Verify pass + tsc** — `bun test packages/api/typescript/src/identity/errors/` → 5 pass / 0 fail / 12 expect() calls / 1.33s; `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** — `feat(identity): typed error glossary + registerErrorCodes for BC1 (P1 Task 2, iter 46)`.

---

## Task 3: UserProfile aggregate enforces email + IANA timezone + BCP-47 language invariants ✅ DONE iter 47

**Files:**
- Create: `packages/api/typescript/src/identity/entities/UserProfile.ts`
- Create: `packages/api/typescript/src/identity/entities/index.ts`
- Test: `packages/api/typescript/src/identity/entities/UserProfile.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** Task 2

> **Iter-47 deviation from planned `isValidBcp47`:** the planned `BCP47_RE` accepted only a
> region subtag, not a script subtag (rejects valid `zh-Hans-CN`). Shipped regex also allows
> a 4-letter script subtag and a 5-8 char variant subtag — superset of the plan, still strict
> enough to reject "not a language". Shipped `isValidIanaTimezone` dropped the
> `Intl.supportedValuesOf` fast-path and goes straight to `Intl.DateTimeFormat` validation
> (the fast-path was a redundant attempt to avoid an exception that doesn't actually fire on
> Bun for valid zones).

> Maps to `identity.user_profiles` (iter-42 schema). Columns: `id` (FK → authentication.users.id),
> `timezone?`, `language?`, `brazilianTaxId?`, `leadToken?`, audit/version columns. `pictureUrl` and
> `email` live on polyglot's `authentication.users` row and stay on `auth.User`. `disabledAt` is held
> in-memory only at this phase (see top QUESTION).

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { UserProfile } from './UserProfile'

describe('UserProfile aggregate', () => {
	it('creates with minimal fields', () => {
		const u = UserProfile.create({ userId: 'auth-user-1' })
		expect(u.userId).toBe('auth-user-1')
		expect(u.timezone).toBeUndefined()
		expect(u.language).toBeUndefined()
	})

	it('accepts a known IANA timezone', () => {
		const u = UserProfile.create({ userId: 'u1' })
		u.updateProfile({ timezone: 'America/Sao_Paulo' })
		expect(u.timezone).toBe('America/Sao_Paulo')
	})

	it('rejects unknown IANA timezone with INVALID_TIMEZONE', () => {
		const u = UserProfile.create({ userId: 'u1' })
		expect(() => u.updateProfile({ timezone: 'Not/Real_Zone' })).toThrow(BaseError)
	})

	it('rejects malformed BCP-47 language with INVALID_LANGUAGE', () => {
		const u = UserProfile.create({ userId: 'u1' })
		expect(() => u.updateProfile({ language: 'not a language' })).toThrow(BaseError)
	})

	it('clears leadToken on conversion', () => {
		const u = UserProfile.create({ userId: 'u1', leadToken: 'tok-abc' })
		expect(u.leadToken).toBe('tok-abc')
		u.clearLeadToken()
		expect(u.leadToken).toBeUndefined()
	})

	it('disable + enable flip in-memory disabledAt (NOT persisted at this phase)', () => {
		const u = UserProfile.create({ userId: 'u1' })
		u.disable()
		expect(u.disabledAt).toBeInstanceOf(Date)
		u.enable()
		expect(u.disabledAt).toBeUndefined()
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement**

`packages/api/typescript/src/identity/entities/UserProfile.ts`:
```typescript
import { AggregateRoot, z } from '@template/core-typescript'
import Z from 'zod'
import type { DomainErrors } from '../errors'

const isValidIanaTimezone = (tz: string): boolean => {
	try {
		// @ts-expect-error — Intl.supportedValuesOf is in modern runtimes (Bun supports it).
		const all: string[] = Intl.supportedValuesOf('timeZone')
		return all.includes(tz)
	} catch {
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
			return true
		} catch {
			return false
		}
	}
}

const isValidBcp47 = (lang: string): boolean => {
	try {
		new Intl.Locale(lang)
		return /^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?(-[A-Za-z]{2}|-[0-9]{3})?$/.test(lang)
	} catch {
		return false
	}
}

const UserProfileSchema = z.object({
	userId: z.uuid(),
	timezone: z.string().refine(isValidIanaTimezone, { error: 'INVALID_TIMEZONE' as DomainErrors }).optional(),
	language: z.string().refine(isValidBcp47, { error: 'INVALID_LANGUAGE' as DomainErrors }).optional(),
	brazilianTaxId: z.string().optional(),
	leadToken: z.string().optional(),
	disabledAt: z.date().optional(),
})

export type UserProfileProps = Z.infer<typeof UserProfileSchema>

export class UserProfile extends AggregateRoot<typeof UserProfileSchema> {
	static override schema = UserProfileSchema

	static create(data: {
		userId: string
		timezone?: string
		language?: string
		brazilianTaxId?: string
		leadToken?: string
	}): UserProfile {
		return new UserProfile({
			userId: data.userId,
			timezone: data.timezone,
			language: data.language,
			brazilianTaxId: data.brazilianTaxId,
			leadToken: data.leadToken,
			disabledAt: undefined,
		})
	}

	updateProfile(data: {
		timezone?: string
		language?: string
		brazilianTaxId?: string | null
	}): void {
		if (data.timezone !== undefined) this.timezone = data.timezone
		if (data.language !== undefined) this.language = data.language
		if (data.brazilianTaxId !== undefined) this.brazilianTaxId = data.brazilianTaxId ?? undefined
		this.validate()
	}

	clearLeadToken(): void {
		this.leadToken = undefined
		this.validate()
	}

	disable(): void {
		this.disabledAt = new Date()
		this.validate()
	}

	enable(): void {
		this.disabledAt = undefined
		this.validate()
	}
}

export interface UserProfile extends UserProfileProps {}
```

`entities/index.ts`:
```typescript
export { UserProfile } from './UserProfile'
export type { UserProfileProps } from './UserProfile'
```

- [x] **Step 4: Verify pass + tsc** — `bun test packages/api/typescript/src/identity/entities/UserProfile.test.ts` → 10 pass / 0 fail / 20 expect() calls / 1.20s; `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** — `feat(identity): UserProfile aggregate — IANA timezone + BCP-47 language invariants (P1 Task 3, iter 47)`.

---

## Task 4: UserPreferences aggregate enforces notification + currency invariants ✅ DONE iter 48

**Files:**
- Create: `packages/api/typescript/src/identity/entities/UserPreferences.ts`
- Modify: `packages/api/typescript/src/identity/entities/index.ts` — append `UserPreferences` export
- Test: `packages/api/typescript/src/identity/entities/UserPreferences.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** Task 2

> Maps to `identity.user_preferences` (iter-42 schema). Columns: `id` (FK → authentication.users.id),
> `notificationCurrencyMode`, `customCurrency?`, `dailyNotificationsEnabled`, `orderPushPerStore` (jsonb),
> audit/version. Per-Store opt-in (`orderPushPerStore`) is a sparse `Record<storeId, boolean>` — empty
> object by default.

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { UserPreferences } from './UserPreferences'
import { NotificationCurrencyMode } from '@template/contracts-typescript/wire/enums'

describe('UserPreferences aggregate', () => {
	it('creates with sensible defaults', () => {
		const p = UserPreferences.createDefault({ userId: 'u1' })
		expect(p.userId).toBe('u1')
		expect(p.dailyNotificationsEnabled).toBe(true)
		expect(p.notificationCurrencyMode).toBe(NotificationCurrencyMode.STORE_CURRENCY)
		expect(p.customCurrency).toBeUndefined()
		expect(p.orderPushPerStore).toEqual({})
	})

	it('partial update on notification fields', () => {
		const p = UserPreferences.createDefault({ userId: 'u1' })
		p.updatePreferences({ dailyNotificationsEnabled: false, notificationCurrencyMode: NotificationCurrencyMode.CUSTOM_CURRENCY, customCurrency: 'BRL' })
		expect(p.dailyNotificationsEnabled).toBe(false)
		expect(p.notificationCurrencyMode).toBe(NotificationCurrencyMode.CUSTOM_CURRENCY)
		expect(p.customCurrency).toBe('BRL')
	})

	it('toggleOrderPushForStore flips a sparse map entry', () => {
		const p = UserPreferences.createDefault({ userId: 'u1' })
		p.toggleOrderPushForStore('store-1', true)
		expect(p.orderPushPerStore['store-1']).toBe(true)
		p.toggleOrderPushForStore('store-1', false)
		expect(p.orderPushPerStore['store-1']).toBe(false)
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement**

`packages/api/typescript/src/identity/entities/UserPreferences.ts`:
```typescript
import { AggregateRoot, z } from '@template/core-typescript'
import Z from 'zod'
import {
	CurrencyCode,
	CurrencyCodeSchema,
	NotificationCurrencyMode,
	NotificationCurrencyModeSchema,
} from '@template/contracts-typescript/wire/enums'

const UserPreferencesSchema = z.object({
	userId: z.uuid(),
	notificationCurrencyMode: NotificationCurrencyModeSchema,
	customCurrency: CurrencyCodeSchema.optional(),
	dailyNotificationsEnabled: z.boolean(),
	orderPushPerStore: z.record(z.string(), z.boolean()),
})

export type UserPreferencesProps = Z.infer<typeof UserPreferencesSchema>

export class UserPreferences extends AggregateRoot<typeof UserPreferencesSchema> {
	static override schema = UserPreferencesSchema

	static createDefault(data: { userId: string }): UserPreferences {
		return new UserPreferences({
			userId: data.userId,
			notificationCurrencyMode: NotificationCurrencyMode.STORE_CURRENCY,
			customCurrency: undefined,
			dailyNotificationsEnabled: true,
			orderPushPerStore: {},
		})
	}

	updatePreferences(data: {
		dailyNotificationsEnabled?: boolean
		notificationCurrencyMode?: NotificationCurrencyMode
		customCurrency?: CurrencyCode | null
	}): void {
		if (data.dailyNotificationsEnabled !== undefined) this.dailyNotificationsEnabled = data.dailyNotificationsEnabled
		if (data.notificationCurrencyMode !== undefined) this.notificationCurrencyMode = data.notificationCurrencyMode
		if (data.customCurrency !== undefined) this.customCurrency = data.customCurrency ?? undefined
		this.validate()
	}

	toggleOrderPushForStore(storeId: string, enabled: boolean): void {
		this.orderPushPerStore = { ...this.orderPushPerStore, [storeId]: enabled }
		this.validate()
	}
}

export interface UserPreferences extends UserPreferencesProps {}
```

Append to `entities/index.ts`:
```typescript
export { UserPreferences } from './UserPreferences'
export type { UserPreferencesProps } from './UserPreferences'
```

- [x] **Step 4: Verify pass + tsc** — `bun test packages/api/typescript/src/identity/entities/UserPreferences.test.ts` → 6 pass / 0 fail / 17 expect() calls / 2.44s; `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** — `feat(identity): UserPreferences aggregate — notification + per-store opt-in invariants (P1 Task 4, iter 48)`.

---

## Task 5: FcmRegistrationToken aggregate enforces unique-by-token + platform ✅ DONE iter 49

**Files:**
- Create: `packages/api/typescript/src/identity/entities/FcmRegistrationToken.ts`
- Modify: `packages/api/typescript/src/identity/entities/index.ts` — append export
- Test: `packages/api/typescript/src/identity/entities/FcmRegistrationToken.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity
**Depends on:** Task 2

> Maps to `identity.fcm_registration_tokens` (iter-42 schema). Columns: `id` (uuid PK), `userId`, `token`
> (unique), `platform`, `lastSeenAt`, audit/version.

> **Iter-49 note:** unique-by-token is enforced at the DB level (UNIQUE index on
> `identity.fcm_registration_tokens.token` — iter-42 schema). The aggregate itself only
> enforces `token.min(1)`. The repo layer will surface the DB unique-violation as
> `FCM_TOKEN_ALREADY_REGISTERED` in Task 9.

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { FcmRegistrationToken } from './FcmRegistrationToken'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'

describe('FcmRegistrationToken aggregate', () => {
	it('creates with userId + token + platform + timestamps', () => {
		const t = FcmRegistrationToken.create({ userId: 'u1', token: 'abc', platform: FcmPlatform.IOS })
		expect(t.userId).toBe('u1')
		expect(t.token).toBe('abc')
		expect(t.platform).toBe(FcmPlatform.IOS)
		expect(t.lastSeenAt).toBeInstanceOf(Date)
	})

	it('touch() advances lastSeenAt', async () => {
		const t = FcmRegistrationToken.create({ userId: 'u1', token: 'abc', platform: FcmPlatform.ANDROID })
		const before = t.lastSeenAt.getTime()
		await new Promise(r => setTimeout(r, 5))
		t.touch()
		expect(t.lastSeenAt.getTime()).toBeGreaterThan(before)
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement**

`packages/api/typescript/src/identity/entities/FcmRegistrationToken.ts`:
```typescript
import { AggregateRoot, z } from '@template/core-typescript'
import Z from 'zod'
import { FcmPlatform, FcmPlatformSchema } from '@template/contracts-typescript/wire/enums'

const FcmRegistrationTokenSchema = z.object({
	userId: z.uuid(),
	token: z.string().min(1),
	platform: FcmPlatformSchema,
	lastSeenAt: z.date(),
})

export type FcmRegistrationTokenProps = Z.infer<typeof FcmRegistrationTokenSchema>

export class FcmRegistrationToken extends AggregateRoot<typeof FcmRegistrationTokenSchema> {
	static override schema = FcmRegistrationTokenSchema

	static create(data: { userId: string; token: string; platform: FcmPlatform }): FcmRegistrationToken {
		return new FcmRegistrationToken({
			userId: data.userId,
			token: data.token,
			platform: data.platform,
			lastSeenAt: new Date(),
		})
	}

	touch(): void {
		this.lastSeenAt = new Date()
		this.validate()
	}
}

export interface FcmRegistrationToken extends FcmRegistrationTokenProps {}
```

Append to `entities/index.ts`:
```typescript
export { FcmRegistrationToken } from './FcmRegistrationToken'
export type { FcmRegistrationTokenProps } from './FcmRegistrationToken'
```

- [x] **Step 4: Verify pass + tsc** — `bun test packages/api/typescript/src/identity/entities/FcmRegistrationToken.test.ts` → 4 pass / 0 fail / 11 expect() calls / 4.15s; `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** — `feat(identity): FcmRegistrationToken aggregate (P1 Task 5, iter 49)`.

---

## Task 6: Domain events catalog for Identity ✅ DONE iter 50

**Files:**
- Create: `packages/api/typescript/src/identity/events/LeadCapturedEvent.ts`
- Create: `packages/api/typescript/src/identity/events/UserRegisteredEvent.ts`
- Create: `packages/api/typescript/src/identity/events/UserSignedInEvent.ts`
- Create: `packages/api/typescript/src/identity/events/UserSignedOutEvent.ts`
- Create: `packages/api/typescript/src/identity/events/ProfileUpdatedEvent.ts`
- Create: `packages/api/typescript/src/identity/events/PasswordChangedEvent.ts`
- Create: `packages/api/typescript/src/identity/events/PasswordResetRequestedEvent.ts`
- Create: `packages/api/typescript/src/identity/events/PasswordResetEvent.ts`
- Create: `packages/api/typescript/src/identity/events/FcmTokenRegisteredEvent.ts`
- Create: `packages/api/typescript/src/identity/events/FcmTokenUnregisteredEvent.ts`
- Create: `packages/api/typescript/src/identity/events/UserPreferencesCreatedEvent.ts`
- Create: `packages/api/typescript/src/identity/events/UserPreferencesUpdatedEvent.ts`
- Create: `packages/api/typescript/src/identity/events/index.ts`
- Test: `packages/api/typescript/src/identity/events/index.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event
**Depends on:** Task 2

> All Identity events are intra-API domain events — published into the **local outbox** and consumed via
> `InternalMediator` by handlers in this same TS process. They do NOT cross to the Go worker. Cross-language
> integration events for BK Dash live under `packages/contracts/wire/events/` (none for Identity at this
> phase per spec §4 BC1).

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import {
	LeadCapturedEvent,
	UserRegisteredEvent,
	UserSignedInEvent,
	UserSignedOutEvent,
	ProfileUpdatedEvent,
	PasswordChangedEvent,
	PasswordResetRequestedEvent,
	PasswordResetEvent,
	FcmTokenRegisteredEvent,
	FcmTokenUnregisteredEvent,
	UserPreferencesCreatedEvent,
	UserPreferencesUpdatedEvent,
} from './index'

describe('Identity domain events', () => {
	it('event names follow identity.<entity>.<verb> convention', () => {
		expect(LeadCapturedEvent.name).toBe('identity.lead.captured')
		expect(UserRegisteredEvent.name).toBe('identity.user.registered')
		expect(UserSignedInEvent.name).toBe('identity.user.signed_in')
		expect(UserSignedOutEvent.name).toBe('identity.user.signed_out')
		expect(ProfileUpdatedEvent.name).toBe('identity.user.profile_updated')
		expect(PasswordChangedEvent.name).toBe('identity.user.password_changed')
		expect(PasswordResetRequestedEvent.name).toBe('identity.user.password_reset_requested')
		expect(PasswordResetEvent.name).toBe('identity.user.password_reset')
		expect(FcmTokenRegisteredEvent.name).toBe('identity.fcm_token.registered')
		expect(FcmTokenUnregisteredEvent.name).toBe('identity.fcm_token.unregistered')
		expect(UserPreferencesCreatedEvent.name).toBe('identity.user_preferences.created')
		expect(UserPreferencesUpdatedEvent.name).toBe('identity.user_preferences.updated')
	})

	it('LeadCapturedEvent payload validates a minimal lead', () => {
		const e = new LeadCapturedEvent({
			entityId: 'a@b.com',
			ownerId: 'a@b.com',
			payload: { email: 'a@b.com', capturedAt: new Date().toISOString() },
		})
		expect(e.payload.email).toBe('a@b.com')
	})

	it('UserRegisteredEvent payload requires userId + email', () => {
		const e = new UserRegisteredEvent({
			entityId: 'u1',
			ownerId: 'u1',
			payload: { userId: 'u1', email: 'a@b.com', leadEmail: 'a@b.com' },
		})
		expect(e.payload.userId).toBe('u1')
	})

	it('UserPreferencesUpdatedEvent payload carries changedFields[]', () => {
		const e = new UserPreferencesUpdatedEvent({
			entityId: 'u1',
			ownerId: 'u1',
			payload: { userId: 'u1', changedFields: ['notificationCurrencyMode', 'dailyNotificationsEnabled'] },
		})
		expect(e.payload.changedFields).toContain('notificationCurrencyMode')
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement**

Each event mirrors polyglot's `packages/api/typescript/src/auth/events/UserRegisteredEvent.ts`. Sample
(`UserRegisteredEvent.ts`):
```typescript
import { BaseDomainEvent, z } from '@template/core-typescript'

export const UserRegisteredEventSchema = z.domainEvent({
	userId: z.uuid(),
	email: z.string(),
	leadEmail: z.string().optional(),
})

export class UserRegisteredEvent extends BaseDomainEvent<typeof UserRegisteredEventSchema> {
	static override readonly name = 'identity.user.registered' as const
	static readonly schema = UserRegisteredEventSchema
}
```

`LeadCapturedEvent.ts`:
```typescript
import { BaseDomainEvent, z } from '@template/core-typescript'

export const LeadCapturedEventSchema = z.domainEvent({
	email: z.string(),
	capturedAt: z.iso.datetime({ offset: true }),
	name: z.string().optional(),
	phoneNumber: z.string().optional(),
})

export class LeadCapturedEvent extends BaseDomainEvent<typeof LeadCapturedEventSchema> {
	static override readonly name = 'identity.lead.captured' as const
	static readonly schema = LeadCapturedEventSchema
}
```

`UserSignedInEvent.ts` (and `UserSignedOutEvent.ts` analogously):
```typescript
import { BaseDomainEvent, z } from '@template/core-typescript'

export const UserSignedInEventSchema = z.domainEvent({
	userId: z.uuid(),
	signedInAt: z.iso.datetime({ offset: true }),
})
export class UserSignedInEvent extends BaseDomainEvent<typeof UserSignedInEventSchema> {
	static override readonly name = 'identity.user.signed_in' as const
	static readonly schema = UserSignedInEventSchema
}
```

`ProfileUpdatedEvent.ts`:
```typescript
import { BaseDomainEvent, z } from '@template/core-typescript'

export const ProfileUpdatedEventSchema = z.domainEvent({
	userId: z.uuid(),
	changedFields: z.array(z.enum(['name', 'pictureUrl', 'timezone', 'language', 'brazilianTaxId'])),
})
export class ProfileUpdatedEvent extends BaseDomainEvent<typeof ProfileUpdatedEventSchema> {
	static override readonly name = 'identity.user.profile_updated' as const
	static readonly schema = ProfileUpdatedEventSchema
}
```

`PasswordChangedEvent.ts` / `PasswordResetRequestedEvent.ts` / `PasswordResetEvent.ts`: each carries
`{ userId, <verbAt>: iso datetime }`, name `identity.user.password_<verb>`.

`FcmTokenRegisteredEvent.ts`:
```typescript
import { BaseDomainEvent, z } from '@template/core-typescript'
import { FcmPlatformSchema } from '@template/contracts-typescript/wire/enums'

export const FcmTokenRegisteredEventSchema = z.domainEvent({
	userId: z.uuid(),
	tokenId: z.string(),
	platform: FcmPlatformSchema,
})
export class FcmTokenRegisteredEvent extends BaseDomainEvent<typeof FcmTokenRegisteredEventSchema> {
	static override readonly name = 'identity.fcm_token.registered' as const
	static readonly schema = FcmTokenRegisteredEventSchema
}
```

`FcmTokenUnregisteredEvent.ts`: payload `{ userId, tokenId }`, name `identity.fcm_token.unregistered`.

`UserPreferencesCreatedEvent.ts`: payload `{ userId }`, name `identity.user_preferences.created`.
`UserPreferencesUpdatedEvent.ts`: payload `{ userId, changedFields: array(enum([…])) }` with the four
notification fields enumerated.

`packages/api/typescript/src/identity/events/index.ts`:
```typescript
export { LeadCapturedEvent } from './LeadCapturedEvent'
export { UserRegisteredEvent } from './UserRegisteredEvent'
export { UserSignedInEvent } from './UserSignedInEvent'
export { UserSignedOutEvent } from './UserSignedOutEvent'
export { ProfileUpdatedEvent } from './ProfileUpdatedEvent'
export { PasswordChangedEvent } from './PasswordChangedEvent'
export { PasswordResetRequestedEvent } from './PasswordResetRequestedEvent'
export { PasswordResetEvent } from './PasswordResetEvent'
export { FcmTokenRegisteredEvent } from './FcmTokenRegisteredEvent'
export { FcmTokenUnregisteredEvent } from './FcmTokenUnregisteredEvent'
export { UserPreferencesCreatedEvent } from './UserPreferencesCreatedEvent'
export { UserPreferencesUpdatedEvent } from './UserPreferencesUpdatedEvent'
```

- [x] **Step 4: Verify pass + tsc** — `bun test packages/api/typescript/src/identity/events/` → 10 pass / 0 fail / 27 expect() calls / 1.98s; `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** — `feat(identity): 12 intra-API domain events for BC1 (P1 Task 6, iter 50)`.

---

## Task 7: UserProfileRepository — abstract + Drizzle + Mock ✅ DONE iter 51

> **Iter-51 additions beyond the planned scope:** (a) `UserProfile.create()` now binds `entity.id = userId` so the FK invariant holds + domain-event `entityId` carries the userId; corresponding regression test added (Task 3 file). (b) `identity/registry.ts` authored with the `UserProfileRepository` binding (mock/integration/real), and `@shared/registry` extended to spread `identityRegistry.{mock,integration,real}`. Subsequent tasks (Tasks 8, 9) append more entries to the same registry. (c) Integration test must be run from `packages/api/typescript/` (the package root) so `bunfig.toml` preloads `tests/setup.ts` (reflect-metadata polyfill required by tsyringe-neo).

**Files:**
- Create: `packages/api/typescript/src/identity/repositories/UserProfileRepository/UserProfileRepository.ts`
- Create: `packages/api/typescript/src/identity/repositories/UserProfileRepository/DrizzleUserProfileRepository.ts`
- Create: `packages/api/typescript/src/identity/repositories/UserProfileRepository/MockUserProfileRepository.ts`
- Create: `packages/api/typescript/src/identity/repositories/UserProfileRepository/index.ts`
- Test: `packages/api/typescript/src/identity/repositories/UserProfileRepository/DrizzleUserProfileRepository.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository, /test
**Depends on:** Task 3

> Persists into `@template/contracts/db` → `userProfiles` (iter-42 `identity.user_profiles`). FK
> `id` → `authentication.users.id` is `ON DELETE CASCADE`, so the test seeds a polyglot auth user first
> via the existing `auth.UserRepository` so the FK satisfies.

- [x] **Step 1: Write the failing test**

`DrizzleUserProfileRepository.test.ts`: mirrors polyglot's `auth/repositories/UserRepository/DrizzleUserRepository.test.ts` shape. Seed an `auth.User` first (the FK target), then save and round-trip the Identity `UserProfile`:
```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container } from 'tsyringe-neo'
import { UserProfile } from '../../entities/UserProfile'
import { UserProfileRepository } from './UserProfileRepository'
import { UserRepository as AuthUserRepository } from '@auth/repositories'
import { User as AuthUser } from '@auth/entities'
// Polyglot test harness — pick the shape used by other integration tests in this tree
// (containerized PGlite/Postgres + reset/destroy). The exact import path depends on
// what polyglot exposes; tests under packages/api/typescript/src/**/*.test.ts are the
// authoritative pattern for /build to copy.

describe('DrizzleUserProfileRepository (identity)', () => {
	let repo: UserProfileRepository
	let authRepo: AuthUserRepository
	// beforeAll: create child container, resolve repos, run migrations against PGlite.

	it('save + findByUserId round-trips timezone + language + leadToken', async () => {
		const authUser = AuthUser.create({ email: 'p@b.com', name: 'P' })
		await authRepo.save(authUser)
		const profile = UserProfile.create({ userId: authUser.id.value, timezone: 'America/Sao_Paulo', language: 'pt-BR', leadToken: 'tok-abc' })
		await repo.save(profile)
		const found = await repo.findByUserId(authUser.id.value)
		expect(found?.timezone).toBe('America/Sao_Paulo')
		expect(found?.language).toBe('pt-BR')
		expect(found?.leadToken).toBe('tok-abc')
	})

	it('findByLeadToken returns the profile or undefined', async () => {
		// seed auth user + profile with leadToken='tok-xyz' as above
		const found = await repo.findByLeadToken('tok-xyz')
		expect(found?.leadToken).toBe('tok-xyz')
		expect(await repo.findByLeadToken('missing')).toBeUndefined()
	})

	it('clearLeadToken persists undefined', async () => {
		// seed auth user + profile with leadToken='tok-clr'
		const profile = (await repo.findByLeadToken('tok-clr'))!
		profile.clearLeadToken()
		await repo.save(profile)
		const reloaded = await repo.findByUserId(profile.userId)
		expect(reloaded?.leadToken).toBeUndefined()
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement**

`UserProfileRepository.ts`:
```typescript
import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { UserProfile } from '../../entities/UserProfile'

export abstract class UserProfileRepository extends Repository<UserProfile> {
	abstract findByUserId(userId: string, tx?: Transaction): Promise<UserProfile | undefined>
	abstract findByLeadToken(leadToken: string, tx?: Transaction): Promise<UserProfile | undefined>
}
```

`DrizzleUserProfileRepository.ts`: mirror polyglot's `DrizzleUserRepository` UPSERT-by-PK pattern with
optimistic-lock via `entity.incrementVersion()`. Schema import: `import { userProfiles } from '@template/contracts/db'`. `toDomain` reads `{ id, timezone, language, brazilianTaxId, leadToken, createdAt, updatedAt, version }`; `toPersistence` writes the same columns plus `id` (= userId; the iter-42 schema uses `id` as both PK and FK to authentication.users.id).

`MockUserProfileRepository.ts`: in-memory `Map<string, UserProfile>` keyed by `userId`. Implement `findByUserId`, `findByLeadToken` (linear scan), `save`, `delete`.

`index.ts`:
```typescript
export { UserProfileRepository } from './UserProfileRepository'
export { DrizzleUserProfileRepository } from './DrizzleUserProfileRepository'
export { MockUserProfileRepository } from './MockUserProfileRepository'
```

- [x] **Step 4: Verify pass + tsc** — `bun test src/identity/` (from `packages/api/typescript/`) → 46 pass / 0 fail / 105 expect() calls / 8.85s across 7 files (entity + events + new repo); `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** — `feat(identity): UserProfileRepository — abstract + drizzle + mock + registry wire-in (P1 Task 7, iter 51)`.

---

## Task 8: UserPreferencesRepository — abstract + Drizzle + Mock ✅ DONE iter 52

> **Iter-52 same-pattern additions as Task 7:** UserPreferences.createDefault binds `entity.id = userId` (regression test in Task 4 file); identity/registry.ts gains UserPreferencesRepository binding. customCurrency cast to `CurrencyCode | undefined` at toDomain boundary since the DB column is plain text.

**Files:**
- Create: `packages/api/typescript/src/identity/repositories/UserPreferencesRepository/UserPreferencesRepository.ts`
- Create: `packages/api/typescript/src/identity/repositories/UserPreferencesRepository/DrizzleUserPreferencesRepository.ts`
- Create: `packages/api/typescript/src/identity/repositories/UserPreferencesRepository/MockUserPreferencesRepository.ts`
- Create: `packages/api/typescript/src/identity/repositories/UserPreferencesRepository/index.ts`
- Test: `packages/api/typescript/src/identity/repositories/UserPreferencesRepository/DrizzleUserPreferencesRepository.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository, /test
**Depends on:** Task 4, Task 7 (test reuses the auth-user seeding pattern from Task 7)

- [x] **Step 1: Write the failing test**

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { UserPreferences } from '../../entities/UserPreferences'
import { UserPreferencesRepository } from './UserPreferencesRepository'
import { NotificationCurrencyMode } from '@template/contracts-typescript/wire/enums'
// + same auth-user seeding scaffold as Task 7

describe('DrizzleUserPreferencesRepository', () => {
	it('save + findByUserId round-trips defaults', async () => {
		// seed auth user with id userId
		const prefs = UserPreferences.createDefault({ userId })
		await repo.save(prefs)
		const found = await repo.findByUserId(userId)
		expect(found?.dailyNotificationsEnabled).toBe(true)
		expect(found?.notificationCurrencyMode).toBe(NotificationCurrencyMode.STORE_CURRENCY)
		expect(found?.orderPushPerStore).toEqual({})
	})

	it('updates persist (customCurrency + per-store opt-in)', async () => {
		const prefs = UserPreferences.createDefault({ userId })
		prefs.updatePreferences({ notificationCurrencyMode: NotificationCurrencyMode.CUSTOM_CURRENCY, customCurrency: 'BRL', dailyNotificationsEnabled: false })
		prefs.toggleOrderPushForStore('store-1', true)
		await repo.save(prefs)
		const found = await repo.findByUserId(userId)
		expect(found?.customCurrency).toBe('BRL')
		expect(found?.dailyNotificationsEnabled).toBe(false)
		expect(found?.orderPushPerStore['store-1']).toBe(true)
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement**

`UserPreferencesRepository.ts`:
```typescript
import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { UserPreferences } from '../../entities/UserPreferences'

export abstract class UserPreferencesRepository extends Repository<UserPreferences> {
	abstract findByUserId(userId: string, tx?: Transaction): Promise<UserPreferences | undefined>
}
```

`DrizzleUserPreferencesRepository.ts`: UPSERT against `userPreferences` from `@template/contracts/db`, target `userPreferences.id` (= userId). `set: { notificationCurrencyMode, customCurrency, dailyNotificationsEnabled, orderPushPerStore, updatedAt: new Date() }`. Persist `orderPushPerStore` as jsonb directly (Drizzle handles the cast).

`MockUserPreferencesRepository.ts`: in-memory `Map<string, UserPreferences>` keyed by userId.

`index.ts`: barrel.

- [x] **Step 4: Verify pass + tsc** — `bun test src/identity/` (from `packages/api/typescript/`) → 53 pass / 0 fail / 123 expect() calls / 5.76s across 8 files; `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** — `feat(identity): UserPreferencesRepository — abstract + drizzle + mock (P1 Task 8, iter 52)`.

---

## Task 9: FcmRegistrationTokenRepository — abstract + Drizzle + Mock + repositories barrel ✅ DONE iter 53

**Files:**
- Create: `packages/api/typescript/src/identity/repositories/FcmRegistrationTokenRepository/FcmRegistrationTokenRepository.ts`
- Create: `packages/api/typescript/src/identity/repositories/FcmRegistrationTokenRepository/DrizzleFcmRegistrationTokenRepository.ts`
- Create: `packages/api/typescript/src/identity/repositories/FcmRegistrationTokenRepository/MockFcmRegistrationTokenRepository.ts`
- Create: `packages/api/typescript/src/identity/repositories/FcmRegistrationTokenRepository/index.ts`
- Create: `packages/api/typescript/src/identity/repositories/index.ts` — barrel for all three repos
- Test: `packages/api/typescript/src/identity/repositories/FcmRegistrationTokenRepository/DrizzleFcmRegistrationTokenRepository.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /repository, /test
**Depends on:** Task 5, Task 7

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { FcmRegistrationToken } from '../../entities/FcmRegistrationToken'
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'
import { FcmRegistrationTokenRepository } from './FcmRegistrationTokenRepository'
// + auth-user seeding scaffold

describe('DrizzleFcmRegistrationTokenRepository', () => {
	it('save + findByToken returns the row', async () => {
		const t = FcmRegistrationToken.create({ userId, token: 'tk1', platform: FcmPlatform.IOS })
		await repo.save(t)
		const found = await repo.findByToken('tk1')
		expect(found?.userId).toBe(userId)
		expect(found?.platform).toBe(FcmPlatform.IOS)
	})

	it('listByUserId returns all tokens for the user', async () => {
		await repo.save(FcmRegistrationToken.create({ userId, token: 'tk1', platform: FcmPlatform.IOS }))
		await repo.save(FcmRegistrationToken.create({ userId, token: 'tk2', platform: FcmPlatform.ANDROID }))
		const list = await repo.listByUserId(userId)
		expect(list.map(t => t.token).sort()).toEqual(['tk1', 'tk2'])
	})

	it('delete removes the token', async () => {
		const t = FcmRegistrationToken.create({ userId, token: 'tk3', platform: FcmPlatform.WEB })
		await repo.save(t)
		await repo.delete(t.id.value)
		expect(await repo.findByToken('tk3')).toBeUndefined()
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement**

`FcmRegistrationTokenRepository.ts`:
```typescript
import { Repository } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { FcmRegistrationToken } from '../../entities/FcmRegistrationToken'

export abstract class FcmRegistrationTokenRepository extends Repository<FcmRegistrationToken> {
	abstract findByToken(token: string, tx?: Transaction): Promise<FcmRegistrationToken | undefined>
	abstract listByUserId(userId: string, tx?: Transaction): Promise<FcmRegistrationToken[]>
}
```

`DrizzleFcmRegistrationTokenRepository.ts`: UPSERT against `fcmRegistrationTokens` from `@template/contracts/db` keyed on `id` (uuid PK) with `entity.incrementVersion()`. `findByToken` uses the `fcm_registration_tokens_token_unq` unique index; `listByUserId` uses the `fcm_registration_tokens_user_id_idx` index.

`MockFcmRegistrationTokenRepository.ts`: in-memory `Map<string, FcmRegistrationToken>` keyed by row id; linear scans for `findByToken` and `listByUserId`.

`packages/api/typescript/src/identity/repositories/index.ts`:
```typescript
export * from './UserProfileRepository'
export * from './UserPreferencesRepository'
export * from './FcmRegistrationTokenRepository'
```

- [x] **Step 4: Verify pass + tsc** — `bun test src/identity/` (from `packages/api/typescript/`) → 60 pass / 0 fail / 134 expect() calls / 8.18s across 9 files; `bun --filter @template/api-typescript tsc` → 0 errors.

(Original verification command preserved below for reference; the package-root form is required because tsyringe needs the bunfig.toml preload.)

Run: `bun test packages/api/typescript/src/identity/repositories/ && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [x] **Step 5: Commit** — `feat(identity): FcmRegistrationTokenRepository + repositories barrel (P1 Task 9, iter 53)`.

---

## Task 10: CaptureLead use case + controller (C01) ✅ DONE iter 54

> **Iter-54 deviations from planned implementation:**
> 1. **Idempotency-on-duplicate-email check DROPPED.** Plan's Step 1 test asserted that a second `execute({ email })` would not emit a second event. That requires a `findByNameAndEntityId` on `DomainEventRepository` which polyglot core does NOT ship — adding it would be a cross-cutting core extension out of P1 scope. Spec §7.1 C01 doesn't actually mandate idempotency. The shipped test instead asserts the OPPOSITE: each call emits a fresh event ("no idempotency at this phase"). If product later wants idempotency, file a follow-up to extend polyglot core then add the check.
> 2. **entityId is a deterministic UUID, not the email.** `events.entity_id` is a uuid column; passing `input.email` fails with PG 22P02. Shipped use case derives `leadId = Id.fromHash(['identity', 'lead', email]).value` — stable across retries for the same email, parseable as uuid.

**Files:**
- Create: `packages/api/typescript/src/identity/usecases/CaptureLead.ts`
- Create: `packages/api/typescript/src/identity/usecases/CaptureLead.test.ts`
- Create: `packages/api/typescript/src/identity/controllers/CaptureLead.ts`
- Create: `packages/api/typescript/src/identity/usecases/index.ts`
- Create: `packages/api/typescript/src/identity/controllers/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller, /schema, /test
**Depends on:** Task 6

- [x] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { CaptureLead } from './CaptureLead'
import { LeadCapturedEvent } from '../events'
import { DomainEventRepository } from '@template/core-typescript'
// + polyglot test container scaffold

describe('CaptureLead use case', () => {
	it('emits LeadCapturedEvent', async () => {
		await captureLead.execute({ email: 'lead@b.com', name: 'L', phoneNumber: '+5511999999999' })
		const events = await eventRepo.findByName(LeadCapturedEvent.name)
		expect(events.length).toBe(1)
		expect(events[0].payload.email).toBe('lead@b.com')
	})

	it('idempotent on duplicate email (no second event)', async () => {
		await captureLead.execute({ email: 'lead@b.com' })
		await captureLead.execute({ email: 'lead@b.com' })
		const events = await eventRepo.findByName(LeadCapturedEvent.name)
		expect(events.length).toBe(1)
	})

	it('rejects invalid email with INVALID_EMAIL', async () => {
		await expect(captureLead.execute({ email: 'not-an-email' })).rejects.toThrow(/INVALID_EMAIL/)
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement**

`CaptureLead.ts`:
```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { LeadCapturedEvent } from '../events'
import type { DomainErrors } from '../errors'

export const CaptureLeadInputSchema = z.object({
	email: z.string().email({ error: 'INVALID_EMAIL' as DomainErrors }),
	name: z.string().optional(),
	phoneNumber: z.string().optional(),
})

export const CaptureLeadOutputSchema = z.void()

@injectable()
export class CaptureLead extends Handler<typeof CaptureLeadInputSchema, typeof CaptureLeadOutputSchema> {
	readonly name = 'capture_lead' as const
	readonly inputSchema = CaptureLeadInputSchema
	readonly outputSchema = CaptureLeadOutputSchema

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const existing = await this.domainEventRepository.findByNameAndEntityId(LeadCapturedEvent.name, input.email, tx)
			if (existing.length > 0) return

			const event = new LeadCapturedEvent({
				entityId: input.email,
				ownerId: input.email,
				payload: {
					email: input.email,
					capturedAt: new Date().toISOString(),
					name: input.name,
					phoneNumber: input.phoneNumber,
				},
			})
			await this.domainEventRepository.save(event, tx)
		})
	}
}
```

`controllers/CaptureLead.ts`: mirror polyglot's `auth/controllers/GetSession.ts` shape (with `@injectable()`, `extends Controller`, `readonly path = '/leads'`, `readonly method = 'post'`, body schema `{ email, name?, phoneNumber? }`, output `z.void()`, returns `{ status: HttpStatusCode.NO_CONTENT }`).

`usecases/index.ts` and `controllers/index.ts`: barrel exports.

- [x] **Step 4: Verify pass + tsc** — `bun test src/identity/` (from `packages/api/typescript/`) → 64 pass / 0 fail / 146 expect() calls / 4.72s across 10 files; `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** — `feat(identity): CaptureLead use case + controller (C01) (P1 Task 10, iter 54)`.

---

## Task 11: UpdateProfile use case + controller (C08) — emits ProfileUpdated ✅ DONE iter 55 (use case) + iter 56 (controller)

> **Iter-55 deviations from planned implementation:**
> 1. **Input narrowed to spec.** Plan extended C08 input to `{ name?, pictureUrl?, timezone?, language?, brazilianTaxId? }`. Spec §7.1 C08 input is ONLY `{ name?, pictureUrl? }` (line 2162-2179). timezone/language live on UserPreferences per spec §4 BC1 line 628 (UpdateUserPreferences C11 handles them). Shipped use case is spec-narrow.
> 2. **Cross-aggregate write dropped.** Plan's `UpdateProfile` touched both `auth.User` AND identity `UserProfile`. Spec-narrow C08 only touches `auth.User`; no `UserProfile` mutation. The `USER_PROFILE_NOT_FOUND` gate now means "the auth user doesn't exist" (not "the identity profile is missing"); we keep the error code for consistency with the registered glossary.
> 3. **Controller deferred to a follow-up slice.** Plan-described controller resolves `ctx.user.id` via BetterAuth session — that's a self-contained chunk of work (session headers + BetterAuth call + UNAUTHORIZED branch + 204 response). Splitting keeps each commit focused on one concern. Controller lands in iter 56.

**Files:**
- Create: `packages/api/typescript/src/identity/usecases/UpdateProfile.ts`
- Create: `packages/api/typescript/src/identity/usecases/UpdateProfile.test.ts`
- Create: `packages/api/typescript/src/identity/controllers/UpdateProfile.ts`
- Modify: `usecases/index.ts` + `controllers/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller
**Depends on:** Task 7, Task 10

> Spec §7.1 C08 partial-updates `name` / `pictureUrl`. In our split, `name` and `pictureUrl` live on
> polyglot's `auth.User` row (touched via `auth.UserRepository`); `timezone`, `language`, `brazilianTaxId`
> live on `UserProfile`. The use case updates both repos atomically within one transaction.

- [x] **Step 1: Write the failing test** (use-case half — controller test in iter 56)

```typescript
import { describe, expect, it } from 'bun:test'
import { UpdateProfile } from './UpdateProfile'
import { ProfileUpdatedEvent } from '../events'
// + polyglot test container scaffold seeding an auth.User

describe('UpdateProfile use case', () => {
	it('updates name (auth.User) + emits ProfileUpdated with changedFields=[name]', async () => {
		// seed auth user with id userId, name 'A'
		await useCase.execute({ userId, name: 'B' })
		const reloaded = await authUserRepo.findById(userId)
		expect(reloaded?.name).toBe('B')
		const evts = await eventRepo.findByName(ProfileUpdatedEvent.name)
		expect(evts[0].payload.changedFields).toEqual(['name'])
	})

	it('updates timezone (UserProfile) + changedFields=[timezone]', async () => {
		await useCase.execute({ userId, timezone: 'America/Sao_Paulo' })
		const profile = await profileRepo.findByUserId(userId)
		expect(profile?.timezone).toBe('America/Sao_Paulo')
	})

	it('throws USER_PROFILE_NOT_FOUND if auth user has no identity profile yet', async () => {
		await expect(useCase.execute({ userId: 'no-such', name: 'X' })).rejects.toThrow(/USER_PROFILE_NOT_FOUND/)
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement** (use case shipped; controller still pending)

`UpdateProfile.ts`:
```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { UserProfileRepository } from '../repositories'
import { UserRepository as AuthUserRepository } from '@auth/repositories'
import { ProfileUpdatedEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const UpdateProfileInputSchema = z.object({
	userId: z.uuid(),
	name: z.string().min(1).optional(),
	pictureUrl: z.string().url().nullable().optional(),
	timezone: z.string().optional(),
	language: z.string().optional(),
	brazilianTaxId: z.string().nullable().optional(),
})

export const UpdateProfileOutputSchema = z.void()

@injectable()
export class UpdateProfile extends Handler<typeof UpdateProfileInputSchema, typeof UpdateProfileOutputSchema> {
	readonly name = 'update_profile' as const
	readonly inputSchema = UpdateProfileInputSchema
	readonly outputSchema = UpdateProfileOutputSchema

	constructor(
		private readonly profileRepo: UserProfileRepository,
		private readonly authUserRepo: AuthUserRepository,
	) { super() }

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const profile = await this.profileRepo.findByUserId(input.userId, tx)
			if (!profile) throw new BaseError<ApplicationErrors>('USER_PROFILE_NOT_FOUND')

			const changedFields: Array<'name' | 'pictureUrl' | 'timezone' | 'language' | 'brazilianTaxId'> = []

			// Update auth.User fields if requested.
			if (input.name !== undefined || input.pictureUrl !== undefined) {
				const authUser = await this.authUserRepo.findById(input.userId, tx)
				if (!authUser) throw new BaseError<ApplicationErrors>('USER_PROFILE_NOT_FOUND')
				if (input.name !== undefined && input.name !== authUser.name) {
					authUser.name = input.name
					changedFields.push('name')
				}
				if (input.pictureUrl !== undefined && (input.pictureUrl ?? null) !== authUser.image) {
					authUser.image = input.pictureUrl ?? null
					changedFields.push('pictureUrl')
				}
				if (changedFields.length > 0) await this.authUserRepo.save(authUser, tx)
			}

			// Update Identity profile fields.
			const beforeTz = profile.timezone, beforeLang = profile.language, beforeTax = profile.brazilianTaxId
			profile.updateProfile({ timezone: input.timezone, language: input.language, brazilianTaxId: input.brazilianTaxId })
			if (input.timezone !== undefined && input.timezone !== beforeTz) changedFields.push('timezone')
			if (input.language !== undefined && input.language !== beforeLang) changedFields.push('language')
			if (input.brazilianTaxId !== undefined && (input.brazilianTaxId ?? undefined) !== beforeTax) changedFields.push('brazilianTaxId')
			if (changedFields.includes('timezone') || changedFields.includes('language') || changedFields.includes('brazilianTaxId')) {
				await this.profileRepo.save(profile, tx)
			}

			if (changedFields.length === 0) return

			await this.domainEventRepository.save(
				new ProfileUpdatedEvent({
					entityId: input.userId,
					ownerId: input.userId,
					payload: { userId: input.userId, changedFields },
				}),
				tx,
			)
		})
	}
}
```

`controllers/UpdateProfile.ts`: `PATCH /me/profile`; body mirrors the use-case input minus `userId`; `headers` carry the BetterAuth cookie/session; the controller resolves `ctx.user.id` via the BetterAuth service (same pattern as `auth/controllers/GetSession.ts`) then calls `updateProfile.execute({ userId, …body })`; returns 204.

Append exports to `usecases/index.ts` + `controllers/index.ts`.

- [x] **Step 4: Verify pass + tsc** (use case half) — `bun test src/identity/` (from `packages/api/typescript/`) → 72 pass / 0 fail / 159 expect() calls / 6.86s across 11 files; `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** (use case half) — `feat(identity): UpdateProfile use case (C08, spec-narrow) (P1 Task 11 partial, iter 55)`.

- [x] **Step 6 (iter 56): UpdateProfileController** — `PATCH /me/profile`; BetterAuth session resolves userId; calls `updateProfile.execute(...)`; returns 204. Controller mirrors `auth/controllers/GetSession.ts` pattern. Body schema `{ name?, pictureUrl? }` (no headers in schema — they're on the request object). Returns `UNAUTHORIZED` when getSession fails or returns no `user.id`. 2 controller integration tests covering both 401 paths (no cookie, invalid cookie) — analogous to GetSession.test.ts coverage shape.

---

## Task 12: UpdateUserPreferences use case + controller (C11) ✅ DONE iter 58 (use case) + iter 59 (controller)

> **Iter-58 notes:**
> - Spec C11 input has `notificationCurrency`; use case uses entity field name `customCurrency`. The C11 controller (iter 59) will translate `notificationCurrency` → `customCurrency` at the SDK boundary, keeping internal code consistent with the entity.
> - Pattern mirrors iter-55 UpdateProfile: single-aggregate write, `before/after` diff → `changedFields[]`, no-op guard, USER_PREFERENCES_NOT_FOUND on missing row.
> - timezone now persisted via iter-57 schema migration 0017.

**Files:**
- Create: `packages/api/typescript/src/identity/usecases/UpdateUserPreferences.ts`
- Create: `packages/api/typescript/src/identity/usecases/UpdateUserPreferences.test.ts`
- Create: `packages/api/typescript/src/identity/controllers/UpdateUserPreferences.ts`
- Modify: `usecases/index.ts` + `controllers/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller
**Depends on:** Task 8, Task 10

- [x] **Step 1: Write the failing test** (use-case half — controller test in iter 59)

```typescript
import { describe, expect, it } from 'bun:test'
import { UpdateUserPreferences } from './UpdateUserPreferences'
import { UserPreferencesUpdatedEvent } from '../events'
import { NotificationCurrencyMode } from '@template/contracts-typescript/wire/enums'
// + scaffold seeding userId + default UserPreferences row

describe('UpdateUserPreferences use case', () => {
	it('updates notificationCurrencyMode + emits event with changedFields', async () => {
		await useCase.execute({ userId, notificationCurrencyMode: NotificationCurrencyMode.SALE_CURRENCY })
		const found = await prefsRepo.findByUserId(userId)
		expect(found?.notificationCurrencyMode).toBe(NotificationCurrencyMode.SALE_CURRENCY)
		const evts = await eventRepo.findByName(UserPreferencesUpdatedEvent.name)
		expect(evts[0].payload.changedFields).toEqual(['notificationCurrencyMode'])
	})

	it('updates customCurrency + dailyNotificationsEnabled together', async () => {
		await useCase.execute({
			userId,
			notificationCurrencyMode: NotificationCurrencyMode.CUSTOM_CURRENCY,
			customCurrency: 'BRL',
			dailyNotificationsEnabled: false,
		})
		const found = await prefsRepo.findByUserId(userId)
		expect(found?.customCurrency).toBe('BRL')
		expect(found?.dailyNotificationsEnabled).toBe(false)
	})

	it('throws USER_PREFERENCES_NOT_FOUND if missing', async () => {
		await expect(useCase.execute({ userId: 'no-such', dailyNotificationsEnabled: false })).rejects.toThrow(/USER_PREFERENCES_NOT_FOUND/)
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement** (use case shipped; controller pending)

`UpdateUserPreferences.ts`: `@injectable()`, `extends Handler`, input schema `{ userId, timezone?: nullable, notificationCurrencyMode?, customCurrency?: nullable, dailyNotificationsEnabled? }`, output `z.void()`. Resolves `UserPreferencesRepository`, loads by userId or throws `USER_PREFERENCES_NOT_FOUND`, diffs each field to build `changedFields[]`, calls `prefs.updatePreferences(…)`, `repo.save(prefs, tx)`, saves `UserPreferencesUpdatedEvent` (entityId=userId, ownerId=userId, payload={userId, changedFields}).

`controllers/UpdateUserPreferences.ts`: `PATCH /me/preferences`; body mirrors use-case input minus `userId`; resolves session user via BetterAuth service; returns 204. **Deferred to iter 59** — BetterAuth session resolution is its own slice (same precedent as iter 56 for UpdateProfile).

- [x] **Step 4: Verify pass + tsc** (use case half) — `bun test src/identity/` (from `packages/api/typescript/`) → 86 pass / 0 fail / 184 expect() calls / 7.15s across 13 files; `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** (use case half) — `feat(identity): UpdateUserPreferences use case (C11, spec-narrow) (P1 Task 12 partial, iter 58)`.

- [x] **Step 6 (iter 59): UpdateUserPreferencesController** — `PATCH /me/preferences`; BetterAuth session resolves userId; controller translates spec field `notificationCurrency` → entity field `customCurrency`; calls `updateUserPreferences.execute(...)`; returns 204 or 401. 2 integration tests (mirrors iter-56 UpdateProfileController coverage shape: 401 paths only — happy-path 200 belongs in E2E suite).

---

## Task 13: RegisterFcmToken + UnregisterFcmToken use cases + controllers (C09, C10) ✅ DONE iter 60

> **Iter-60 also retro-refactors iter-56 + iter-59 controllers to AuthAccountMiddleware pattern.** Per user direction, controllers under `/me/*` don't call BetterAuth directly — they declare `override middlewares = [AuthAccountMiddleware]` and read `request.ctx.session.userId`. Pattern follows `ui/controllers/GetMyWatchHistory.ts`. The four Update*/Register/Unregister controllers were refactored; the obsolete 401-controller tests for UpdateProfile + UpdateUserPreferences were deleted (the middleware owns that path now). CaptureLead controller is untouched — it's the only public `/identity/*` endpoint with no session requirement.

**Files:**
- Create: `packages/api/typescript/src/identity/usecases/RegisterFcmToken.ts`
- Create: `packages/api/typescript/src/identity/usecases/RegisterFcmToken.test.ts`
- Create: `packages/api/typescript/src/identity/usecases/UnregisterFcmToken.ts`
- Create: `packages/api/typescript/src/identity/usecases/UnregisterFcmToken.test.ts`
- Create: `packages/api/typescript/src/identity/controllers/RegisterFcmToken.ts`
- Create: `packages/api/typescript/src/identity/controllers/UnregisterFcmToken.ts`
- Modify: `usecases/index.ts` + `controllers/index.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /controller
**Depends on:** Task 9

- [x] **Step 1: Write the failing tests**

`RegisterFcmToken.test.ts`:
```typescript
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'
import { FcmTokenRegisteredEvent } from '../events'

describe('RegisterFcmToken use case', () => {
	it('registers a new token and emits event', async () => {
		await useCase.execute({ userId, token: 'tk1', platform: FcmPlatform.IOS })
		const found = await fcmRepo.findByToken('tk1')
		expect(found?.userId).toBe(userId)
		const evts = await eventRepo.findByName(FcmTokenRegisteredEvent.name)
		expect(evts.length).toBe(1)
	})

	it('idempotent on same token (touch lastSeenAt, no second event)', async () => {
		await useCase.execute({ userId, token: 'tk1', platform: FcmPlatform.IOS })
		const before = (await fcmRepo.findByToken('tk1'))!.lastSeenAt.getTime()
		await new Promise(r => setTimeout(r, 5))
		await useCase.execute({ userId, token: 'tk1', platform: FcmPlatform.IOS })
		const after = (await fcmRepo.findByToken('tk1'))!.lastSeenAt.getTime()
		expect(after).toBeGreaterThanOrEqual(before)
		const evts = await eventRepo.findByName(FcmTokenRegisteredEvent.name)
		expect(evts.length).toBe(1)
	})
})
```

`UnregisterFcmToken.test.ts`:
```typescript
import { FcmTokenUnregisteredEvent } from '../events'

describe('UnregisterFcmToken use case', () => {
	it('removes the token and emits event', async () => {
		// seed via RegisterFcmToken first
		await useCase.execute({ userId, token: 'tk1' })
		expect(await fcmRepo.findByToken('tk1')).toBeUndefined()
		const evts = await eventRepo.findByName(FcmTokenUnregisteredEvent.name)
		expect(evts.length).toBe(1)
	})

	it('no-op if absent', async () => {
		await useCase.execute({ userId, token: 'missing' })
		const evts = await eventRepo.findByName(FcmTokenUnregisteredEvent.name)
		expect(evts.length).toBe(0)
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement**

`RegisterFcmToken.ts`:
```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { FcmPlatformSchema } from '@template/contracts-typescript/wire/enums'
import { FcmRegistrationToken } from '../entities/FcmRegistrationToken'
import { FcmRegistrationTokenRepository } from '../repositories'
import { FcmTokenRegisteredEvent } from '../events'

export const RegisterFcmTokenInputSchema = z.object({
	userId: z.uuid(),
	token: z.string().min(1),
	platform: FcmPlatformSchema,
})
export const RegisterFcmTokenOutputSchema = z.void()

@injectable()
export class RegisterFcmToken extends Handler<typeof RegisterFcmTokenInputSchema, typeof RegisterFcmTokenOutputSchema> {
	readonly name = 'register_fcm_token' as const
	readonly inputSchema = RegisterFcmTokenInputSchema
	readonly outputSchema = RegisterFcmTokenOutputSchema

	constructor(private readonly repo: FcmRegistrationTokenRepository) { super() }

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const existing = await this.repo.findByToken(input.token, tx)
			if (existing) {
				existing.touch()
				await this.repo.save(existing, tx)
				return
			}
			const t = FcmRegistrationToken.create({ userId: input.userId, token: input.token, platform: input.platform })
			await this.repo.save(t, tx)
			await this.domainEventRepository.save(
				new FcmTokenRegisteredEvent({
					entityId: t.id.value,
					ownerId: input.userId,
					payload: { userId: input.userId, tokenId: t.id.value, platform: input.platform },
				}),
				tx,
			)
		})
	}
}
```

`UnregisterFcmToken.ts`: input `{ userId, token }`, output `z.void()`. Loads `findByToken`; if absent OR `existing.userId !== input.userId` → no-op return; otherwise `delete(existing.id.value, tx)` and save `FcmTokenUnregisteredEvent({ entityId: existing.id.value, ownerId: input.userId, payload: { userId, tokenId } })`.

Controllers: `POST /me/fcm-tokens` (Register, body `{ token, platform }`, resolves `userId` from session) and `DELETE /me/fcm-tokens` (Unregister, body `{ token }`); both return 204.

Append exports.

- [x] **Step 4: Verify pass + tsc** — `bun test src/identity/` (from `packages/api/typescript/`) → 91 pass / 0 fail / 201 expect() calls / 8.55s across 14 files; `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** — `feat(identity): RegisterFcmToken + UnregisterFcmToken (C09, C10) + middleware refactor (P1 Task 13, iter 60)`.

---

## Task 14: BetterAuth-bridge hooks for C02-C04 (signup/signin/signout) ⚠ PARTIAL iter 61 (3 of 6 events wired; password trio deferred)

> **Iter-61 design pivot per user direction:** Sign-in/Sign-out/Sign-up are NOT BC1 commands — they happen inside BetterAuth's own endpoints. Instead of authoring 6 Handler use cases, ship a single `IdentityAuthHooks` service (in `identity/services/`) with one method per BetterAuth lifecycle event. BetterAuth.ts injects it as a constructor dep and wires its `databaseHooks.{user,session}.{create,delete}.after` callbacks to call into it.
>
> **Wired this iter:** `user.create.after → onUserCreated` (UserRegistered + UserPreferencesCreated + default profile/prefs rows), `session.create.after → onSessionCreated` (UserSignedIn), `session.delete.after → onSessionDeleted` (UserSignedOut).
>
> **Deferred:** `PasswordChanged` / `PasswordResetRequested` / `PasswordReset` events. BetterAuth doesn't ship single-row database hooks for password changes (account.update.after fires on any account row change; password reset has no direct hook). Wiring these requires a BetterAuth plugin or after-controller pattern — separate slice.

**Files:**
- Create: `packages/api/typescript/src/identity/usecases/EmitSignUpEvents.ts`
- Create: `packages/api/typescript/src/identity/usecases/EmitSignInEvent.ts`
- Create: `packages/api/typescript/src/identity/usecases/EmitSignOutEvent.ts`
- Create: `packages/api/typescript/src/identity/usecases/EmitPasswordChangedEvent.ts`
- Create: `packages/api/typescript/src/identity/usecases/EmitPasswordResetRequestedEvent.ts`
- Create: `packages/api/typescript/src/identity/usecases/EmitPasswordResetEvent.ts`
- Create: `packages/api/typescript/src/identity/usecases/EmitSignUpEvents.test.ts`
- Modify: `usecases/index.ts`

**Rationale.** Polyglot's `auth/` BC owns the BetterAuth email/password lifecycle (C03–C07). The spec
mandates Identity-named domain events for each step (§4 BC1 Published Events). The thinnest seam is a use
case **invoked from BetterAuth's lifecycle hooks** (Task 15) — wiring lives in
`packages/api/typescript/src/auth/services/Authentication/BetterAuth.ts`. The use cases themselves are
plain — they only emit domain events; they do NOT verify passwords.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /test
**Depends on:** Task 6, Task 7, Task 8

- [x] **Step 1: Write the failing test (`IdentityAuthHooks.test.ts`)** — 5 integration tests / 15 expect() calls cover onUserCreated + onSessionCreated + onSessionDeleted + DomainEventRepository sanity + BetterAuth DI wiring.

```typescript
import { EmitSignUpEvents } from './EmitSignUpEvents'
import { CaptureLead } from './CaptureLead'
import { UserProfileRepository, UserPreferencesRepository } from '../repositories'
import { UserRegisteredEvent, UserPreferencesCreatedEvent } from '../events'

describe('EmitSignUpEvents use case', () => {
	it('creates default UserProfile + UserPreferences + emits UserRegistered + UserPreferencesCreated', async () => {
		// seed auth user with id 'u1' first via polyglot auth.RegisterUser (test scaffold)
		await useCase.execute({ userId: 'u1', email: 'new@b.com' })
		const reg = await eventRepo.findByName(UserRegisteredEvent.name)
		expect(reg.length).toBe(1)
		const profile = await profileRepo.findByUserId('u1')
		expect(profile).toBeDefined()
		const prefs = await prefsRepo.findByUserId('u1')
		expect(prefs?.dailyNotificationsEnabled).toBe(true)
		const prefCreated = await eventRepo.findByName(UserPreferencesCreatedEvent.name)
		expect(prefCreated.length).toBe(1)
	})

	it('marks lead conversion when a LeadCapturedEvent exists for the email', async () => {
		await captureLead.execute({ email: 'converted@b.com' })
		await useCase.execute({ userId: 'u2', email: 'converted@b.com' })
		const reg = await eventRepo.findByName(UserRegisteredEvent.name)
		expect(reg.find(e => e.payload.userId === 'u2')?.payload.leadEmail).toBe('converted@b.com')
	})

	it('is idempotent: calling twice does not duplicate profile/prefs rows or events', async () => {
		await useCase.execute({ userId: 'u3', email: 'idem@b.com' })
		await useCase.execute({ userId: 'u3', email: 'idem@b.com' })
		const reg = (await eventRepo.findByName(UserRegisteredEvent.name)).filter(e => e.payload.userId === 'u3')
		expect(reg.length).toBe(1)
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement** (replaced by IdentityAuthHooks service — see deviation callout)

`EmitSignUpEvents.ts`:
```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { UserProfile } from '../entities/UserProfile'
import { UserPreferences } from '../entities/UserPreferences'
import { UserProfileRepository, UserPreferencesRepository } from '../repositories'
import { LeadCapturedEvent, UserRegisteredEvent, UserPreferencesCreatedEvent } from '../events'

export const EmitSignUpEventsInputSchema = z.object({
	userId: z.uuid(),
	email: z.string(),
})
export const EmitSignUpEventsOutputSchema = z.void()

@injectable()
export class EmitSignUpEvents extends Handler<typeof EmitSignUpEventsInputSchema, typeof EmitSignUpEventsOutputSchema> {
	readonly name = 'emit_sign_up_events' as const
	readonly inputSchema = EmitSignUpEventsInputSchema
	readonly outputSchema = EmitSignUpEventsOutputSchema

	constructor(
		private readonly profileRepo: UserProfileRepository,
		private readonly prefsRepo: UserPreferencesRepository,
	) { super() }

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			// Idempotency guard — if we've already registered this user, no-op.
			const prior = await this.domainEventRepository.findByNameAndEntityId(UserRegisteredEvent.name, input.userId, tx)
			if (prior.length > 0) return

			// Lead conversion check.
			const leads = await this.domainEventRepository.findByNameAndEntityId(LeadCapturedEvent.name, input.email, tx)
			const leadEmail = leads.length > 0 ? input.email : undefined

			// Default profile + prefs in same tx.
			const profile = UserProfile.create({ userId: input.userId })
			await this.profileRepo.save(profile, tx)

			const prefs = UserPreferences.createDefault({ userId: input.userId })
			await this.prefsRepo.save(prefs, tx)

			await this.domainEventRepository.save(
				new UserRegisteredEvent({
					entityId: input.userId, ownerId: input.userId,
					payload: { userId: input.userId, email: input.email, leadEmail },
				}),
				tx,
			)
			await this.domainEventRepository.save(
				new UserPreferencesCreatedEvent({
					entityId: input.userId, ownerId: input.userId,
					payload: { userId: input.userId },
				}),
				tx,
			)
		})
	}
}
```

Each remaining emitter (`EmitSignInEvent`, `EmitSignOutEvent`, `EmitPasswordChangedEvent`,
`EmitPasswordResetRequestedEvent`, `EmitPasswordResetEvent`) follows the same shape: input `{ userId: string }`,
output `z.void()`, opens a tx, builds the matching event class with payload
`{ userId, signedInAt|signedOutAt|changedAt|requestedAt|resetAt: new Date().toISOString() }`, calls
`this.domainEventRepository.save(event, tx)`. **No repo I/O on these five.**

- [x] **Step 4: Verify pass + tsc** — `bun test src/identity/` (from `packages/api/typescript/`) → 96 pass / 0 fail / 216 expect() calls / 7.42s across 15 files; `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** — `feat(identity,auth): IdentityAuthHooks bridge wired into BetterAuth databaseHooks (P1 Task 14 partial, iter 61)`.

```bash
git add packages/api/typescript/src/identity/usecases/Emit*.ts \
        packages/api/typescript/src/identity/usecases/EmitSignUpEvents.test.ts \
        packages/api/typescript/src/identity/usecases/index.ts
git commit -m "feat(identity): BetterAuth-bridge event emitters for C02–C07 + lead conversion (P1 Task 14)"
```

---

## Task 15: Wire Identity emitters into polyglot BetterAuth lifecycle hooks ✅ DONE iter 61 (wiring) + iter 62 (verification test + Id.value)

> **Iter-62 also adds `Id.value()` static method to polyglot core** — a thin `uuidv7()` wrapper exported from `@template/core-typescript`. BetterAuth's `advanced.database.generateId` uses it so user/session/account IDs are UUIDv7 strings (round-trip through our event entity_id `uuid` columns). Avoids leaking direct `uuidv7` imports across the codebase + replaces the `"uuid"` shorthand which sent `default` in INSERTs (auth.users.id has no DEFAULT).

**Files:**
- Modify: `packages/api/typescript/src/auth/services/Authentication/BetterAuth.ts` — inject the six Identity emitters and call them from BetterAuth's `databaseHooks` (`user.create.after`, `session.create.after`, `session.delete.after`) and password endpoints (per BetterAuth's current API surface — pick `databaseHooks.account.update.after` filter on password rotation OR a small wrapper middleware if direct hooks are unavailable).
- Test: extend `packages/api/typescript/src/auth/controllers/GetSession.test.ts` or create `packages/api/typescript/src/auth/services/Authentication/BetterAuth.identity-bridge.test.ts` asserting a successful BetterAuth sign-up emits `identity.user.registered` + `identity.user_preferences.created` via the outbox.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler, /test
**Depends on:** Task 14

- [x] **Step 1: Inspect existing BetterAuth wiring** (done in iter 61)

- [x] **Step 2: Write the failing integration test** (`BetterAuth.identity-bridge.test.ts`, iter 62)

```typescript
import { BetterAuth } from '@auth/services/Authentication/BetterAuth'
import { UserRegisteredEvent, UserPreferencesCreatedEvent } from '@identity/events'
import { DomainEventRepository } from '@template/core-typescript'

describe('BetterAuth → Identity event emission', () => {
	it('a successful BetterAuth sign-up emits UserRegistered + UserPreferencesCreated', async () => {
		const req = new Request('http://localhost/auth/sign-up/email', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'newbie@b.com', password: 'StrongPass1!', name: 'Newbie' }),
		})
		const res = await betterAuth.auth.handler(req)
		expect(res.status).toBeLessThan(500)
		const reg = await eventRepo.findByName(UserRegisteredEvent.name)
		expect(reg.length).toBe(1)
		const prefs = await eventRepo.findByName(UserPreferencesCreatedEvent.name)
		expect(prefs.length).toBe(1)
	})
})
```

- [x] **Step 3: Modify BetterAuth factory to inject + invoke the emitters** (done in iter 61; iter 62 adds `advanced.database.generateId: () => Id.value()` so user/session IDs are uuid-shaped)

Inject the six emitters via constructor (`@injectable()` already on the service). Extend the existing
`betterAuth({…})` config block:
```typescript
betterAuth({
	// … existing config (database adapter, secret, …)
	databaseHooks: {
		user: {
			create: { after: async (user) => { await this.emitSignUpEvents.execute({ userId: user.id, email: user.email }) } },
		},
		session: {
			create: { after: async (session) => { await this.emitSignInEvent.execute({ userId: session.userId }) } },
			delete: { after: async (session) => { await this.emitSignOutEvent.execute({ userId: session.userId }) } },
		},
	},
	emailAndPassword: {
		// Map BetterAuth's exposed callbacks (onPasswordChanged / onForgotPassword / onResetPassword)
		// to the three corresponding emitters. If a callback is absent from the current BetterAuth
		// version, wrap the BetterAuth router with a small post-success middleware that inspects the
		// resolved endpoint and fires the emitter — document this inline.
	},
})
```

If a hook surface is missing, the fallback is a thin middleware: in `auth/index.ts` (the BC entry) wrap
the `betterAuth.handler` Response with a `then` that inspects `request.url` and `response.status`, dispatches
the matching emitter, and returns the same Response. Document the fallback in code with a `// TODO(P1-15)`
comment naming the BetterAuth version assumed.

- [x] **Step 4: Verify pass + tsc** — `bun test src/` (from `packages/api/typescript/`) → 159 pass / 0 fail / 390 expect() calls / 9.68s across 30 files; `bun --filter @template/api-typescript tsc` → 0 errors; `bun --filter @template/core-typescript test` → 37 pass / 0 fail; `bun --filter @template/core-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** — `feat(core,auth): Id.value() + BetterAuth uuid generateId + identity-bridge integration test (P1 Task 15, iter 62)`.

---

## Task 16: Read queries — ProfileSettings (T05) + UserPreferencesSettings (T06) + SignUpPage prefill (T02) ⚠ PARTIAL iter 63 (T05 + T06 done; T02 deferred)

> **Iter-63 deviations from plan body:**
> - **T02 SignUpPagePrefill deferred** — depends on lead persistence that doesn't exist. CaptureLead (iter 54) emits LeadCapturedEvent into the outbox but doesn't write a `leads` table or store the captured email in any queryable form. The plan suggested `UserProfile.findByLeadToken` + `LeadCapturedEvent` lookup, but UserProfile.leadToken is only populated post-signup (by IdentityAuthHooks.onUserCreated, which doesn't know the lead token either). Wiring T02 requires either (a) a `leads` table + repository, (b) extending DomainEventRepository with `findByName(name, filter)`, or (c) routing the lead token through BetterAuth's signup metadata. Out of scope for this iter. Tracked as follow-up.
> - **T05 GetProfileSettings DTO extended** beyond the planned `{ id, email, name, pictureUrl, fcmTokens }` to also include `timezone`, `language`, `brazilianTaxId` (all from UserProfile). T05 is the canonical "show me my whole identity profile" read — including the BC1-specific fields matches the spec's intent better than the partial DTO the plan sketched.
> - **T06 GetUserPreferencesSettings** ships the spec field naming (`notificationCurrency`, not entity-name `customCurrency`). Translates at the DTO boundary, same as iter-59 UpdateUserPreferencesController.

**Files:**
- Create: `packages/api/typescript/src/identity/usecases/GetProfileSettings.ts`
- Create: `packages/api/typescript/src/identity/usecases/GetProfileSettings.test.ts`
- Create: `packages/api/typescript/src/identity/usecases/GetUserPreferencesSettings.ts`
- Create: `packages/api/typescript/src/identity/usecases/GetUserPreferencesSettings.test.ts`
- Create: `packages/api/typescript/src/identity/usecases/GetSignUpPagePrefill.ts`
- Create: `packages/api/typescript/src/identity/usecases/GetSignUpPagePrefill.test.ts`
- Create: `packages/api/typescript/src/identity/controllers/GetProfileSettings.ts`
- Create: `packages/api/typescript/src/identity/controllers/GetUserPreferencesSettings.ts`
- Create: `packages/api/typescript/src/identity/controllers/GetSignUpPage.ts`
- Modify: `usecases/index.ts` + `controllers/index.ts`

> Read T01 SignInPage and T03 PasswordResetRequestPage are stateless (no input, no output) — no query needed.
> T04 PasswordResetCompletePage's `tokenValid` check is BetterAuth-owned; the polyglot `auth/` BC owns this
> read. T02 SignUpPage's `leadToken` prefill **is** an Identity concern (the lead capture is ours), so we
> ship a small `GetSignUpPagePrefill` query that looks up `UserProfile.findByLeadToken` (post-conversion) OR
> the original `LeadCapturedEvent` payload for `prefill = { email, name?, phoneNumber? }`. T05 + T06 are
> straight repo reads.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /controller, /test
**Depends on:** Task 7, Task 8, Task 9, Task 10

- [x] **Step 1: Write the failing tests** (T05 + T06 done iter 63; T02 deferred)

`GetProfileSettings.test.ts`:
```typescript
import { FcmPlatform } from '@template/contracts-typescript/wire/enums'
describe('GetProfileSettings query (T05)', () => {
	it('returns profile + fcmTokens', async () => {
		// seed auth user 'me@b.com' name 'Me' image 'https://cdn/x.png' + UserProfile + one FCM token
		const out = await query.execute({ userId })
		expect(out.email).toBe('me@b.com')
		expect(out.name).toBe('Me')
		expect(out.pictureUrl).toBe('https://cdn/x.png')
		expect(out.fcmTokens.length).toBe(1)
		expect(out.fcmTokens[0].platform).toBe(FcmPlatform.IOS)
	})

	it('throws USER_PROFILE_NOT_FOUND', async () => {
		await expect(query.execute({ userId: 'no-such' })).rejects.toThrow(/USER_PROFILE_NOT_FOUND/)
	})
})
```

`GetUserPreferencesSettings.test.ts`:
```typescript
import { NotificationCurrencyMode } from '@template/contracts-typescript/wire/enums'
describe('GetUserPreferencesSettings query (T06)', () => {
	it('returns prefs DTO matching spec §7.1 T06', async () => {
		// seed userId + UserPreferences default
		const out = await query.execute({ userId })
		expect(out.userId).toBe(userId)
		expect(out.dailyNotificationsEnabled).toBe(true)
		expect(out.notificationCurrencyMode).toBe(NotificationCurrencyMode.STORE_CURRENCY)
	})

	it('throws USER_PREFERENCES_NOT_FOUND if missing', async () => {
		await expect(query.execute({ userId: 'no-such' })).rejects.toThrow(/USER_PREFERENCES_NOT_FOUND/)
	})
})
```

`GetSignUpPagePrefill.test.ts`:
```typescript
describe('GetSignUpPagePrefill query (T02)', () => {
	it('returns prefill when leadToken matches an existing UserProfile.leadToken', async () => {
		// seed UserProfile with leadToken 'tok-abc' and a corresponding LeadCapturedEvent for 'lead@b.com' (name 'L', phoneNumber '+5511')
		const out = await query.execute({ leadToken: 'tok-abc' })
		expect(out.prefill?.email).toBe('lead@b.com')
		expect(out.prefill?.name).toBe('L')
		expect(out.prefill?.phoneNumber).toBe('+5511')
	})

	it('returns { prefill: undefined } when no leadToken provided', async () => {
		const out = await query.execute({ leadToken: undefined })
		expect(out.prefill).toBeUndefined()
	})

	it('throws INVALID_LEAD_TOKEN if token is provided but unknown', async () => {
		await expect(query.execute({ leadToken: 'unknown' })).rejects.toThrow(/INVALID_LEAD_TOKEN/)
	})
})
```

- [x] **Step 2: Verify failure → Step 3: Implement** (T05 + T06 shipped iter 63)

`GetProfileSettings.ts`:
```typescript
import { injectable } from 'tsyringe-neo'
import { Handler, BaseError, z } from '@template/core-typescript'
import { FcmPlatformSchema } from '@template/contracts-typescript/wire/enums'
import { UserProfileRepository, FcmRegistrationTokenRepository } from '../repositories'
import { UserRepository as AuthUserRepository } from '@auth/repositories'
import type { ApplicationErrors } from '../errors'

export const GetProfileSettingsInputSchema = z.object({ userId: z.string() })
export const GetProfileSettingsOutputSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string(),
	pictureUrl: z.string().url().optional(),
	fcmTokens: z.array(z.object({
		id: z.string(),
		platform: FcmPlatformSchema,
		registeredAt: z.iso.datetime({ offset: true }),
		lastSeenAt: z.iso.datetime({ offset: true }),
	})),
})

@injectable()
export class GetProfileSettings extends Handler<typeof GetProfileSettingsInputSchema, typeof GetProfileSettingsOutputSchema> {
	readonly name = 'get_profile_settings' as const
	readonly inputSchema = GetProfileSettingsInputSchema
	readonly outputSchema = GetProfileSettingsOutputSchema

	constructor(
		private readonly profileRepo: UserProfileRepository,
		private readonly authUserRepo: AuthUserRepository,
		private readonly fcmRepo: FcmRegistrationTokenRepository,
	) { super() }

	protected async handle(input: this['input']): Promise<this['output']> {
		const profile = await this.profileRepo.findByUserId(input.userId)
		if (!profile) throw new BaseError<ApplicationErrors>('USER_PROFILE_NOT_FOUND')
		const authUser = await this.authUserRepo.findById(input.userId)
		if (!authUser) throw new BaseError<ApplicationErrors>('USER_PROFILE_NOT_FOUND')
		const tokens = await this.fcmRepo.listByUserId(input.userId)
		return {
			id: input.userId,
			email: authUser.email,
			name: authUser.name ?? '',
			pictureUrl: authUser.image ?? undefined,
			fcmTokens: tokens.map(t => ({
				id: t.id.value,
				platform: t.platform,
				registeredAt: t.createdAt.toISOString(),
				lastSeenAt: t.lastSeenAt.toISOString(),
			})),
		}
	}
}
```

`GetUserPreferencesSettings.ts`: output matches spec §7.1 T06 (`{ userId, timezone, dailyNotificationsEnabled, notificationCurrency, notificationCurrencyMode }`). `timezone` comes from `UserProfile.timezone` (default `'UTC'` if absent — apply at query time per spec); `notificationCurrency` is derived: `prefs.customCurrency ?? '<storeCurrency>'` — at this phase, the storeCurrency lookup is moot (Tenancy doesn't exist yet) so we return `prefs.customCurrency ?? 'USD'` and add a `// TODO(P2)` for the Tenancy lookup.

`GetSignUpPagePrefill.ts`: input `{ leadToken?: string }`. If absent → `{ prefill: undefined }`. Else `profileRepo.findByLeadToken(leadToken)`; if absent → throw `INVALID_LEAD_TOKEN`; else look up the most recent `LeadCapturedEvent` with `entityId === leadCaptureEmail` (the original capture used email as entityId) — for now, since UserProfile doesn't store the captured email directly, the prefill is `{ email: <empty>, name: undefined, phoneNumber: undefined }` if the join can't resolve. Add a `// TODO(P1-16)` to enrich once the LeadCapturedEvent payload is replayable through DomainEventRepository.

Controllers: `GET /me/profile`, `GET /me/preferences`, `GET /sign-up` (with `?leadToken=…`). All but the last require an authenticated session (resolved via BetterAuth service in the controller's `handle`).

Append exports.

- [x] **Step 4: Verify pass + tsc** — `bun test src/identity/` (from `packages/api/typescript/`) → 103 pass / 0 fail / 242 expect() calls / 6.02s across 17 files; `bun --filter @template/api-typescript tsc` → 0 errors.

- [x] **Step 5: Commit** — `feat(identity): T05 GetProfileSettings + T06 GetUserPreferencesSettings reads (P1 Task 16 partial, iter 63)`.

- [ ] **Step 6 (deferred): T02 GetSignUpPagePrefill** — needs lead persistence (a `leads` table OR DomainEventRepository.findByName extension OR signup-metadata pipeline). Not in scope for this iter.

---

## Task 17: BC skeleton — registry + handlers/internal + handlers/external + middlewares + index + wire into MainRouter ✅ DONE iter 64

> **Iter-64 deviations from plan body:**
> - **No identity/middlewares/index.ts authored.** Polyglot `BoundedContext.create({...})` doesn't accept a `middlewares` arg — middlewares attach per-controller via `override middlewares = [...]` (the iter-60 pattern). Skipped the empty barrel.
> - **identity/registry.ts already authored in iter 51** (13 iterations ago). Plan Step 2 includes it but it's been live since UserProfileRepository landed.
> - **No live `bun dev` smoke test** — needs Docker for Postgres; tsc + full identity suite is the meaningful gate. Skipped Step 3's smoke + curl.

**Files:**
- Create: `packages/api/typescript/src/identity/registry.ts` (first line: `import './errors'` side-effect to register error codes)
- Create: `packages/api/typescript/src/identity/middlewares/index.ts` (empty array initially — Tenancy will add `AuthMiddleware`)
- Create: `packages/api/typescript/src/identity/handlers/internal.ts` (empty barrel — Notifications will subscribe later)
- Create: `packages/api/typescript/src/identity/handlers/external.ts` (empty barrel — `RedisExternalMediator` handlers land here in later sub-plans)
- Create: `packages/api/typescript/src/identity/index.ts`
- Modify: `packages/api/typescript/src/index.ts` — import `IdentityRouter from '@identity/index'` and add to the `routers` array

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context
**Depends on:** Tasks 1–16

- [x] **Step 1: Inspect the existing MainRouter wiring shape** (done iter 64)

Run: `head -50 packages/api/typescript/src/index.ts` — note the `routers = [SharedRouter, AuthRouter, NotificationsRouter, UIRouter]` array. Identity slots in next to AuthRouter. Each child router is whatever `BoundedContext.create({...}).router` returns; `BoundedContext` writes paths under the BC's `name` prefix (the polyglot `auth/index.ts` uses `name: ''` because its controllers already start with `/session` — match that convention; our controllers already start with `/leads`, `/me/profile`, etc.).

- [x] **Step 2: Implement files** (handlers/internal + handlers/external + identity/index + src/index.ts wire-in shipped iter 64; registry pre-existed since iter 51; middlewares barrel skipped — not part of BoundedContext.create contract)

`packages/api/typescript/src/identity/registry.ts`:
```typescript
// Side-effect: register the BC's error codes with the framework runtime registry.
// Mirrors polyglot's auth/registry.ts first-line pattern.
import './errors'

import type { InstanceRegistry } from '@template/core-typescript'
import {
	UserProfileRepository,
	MockUserProfileRepository,
	DrizzleUserProfileRepository,
	UserPreferencesRepository,
	MockUserPreferencesRepository,
	DrizzleUserPreferencesRepository,
	FcmRegistrationTokenRepository,
	MockFcmRegistrationTokenRepository,
	DrizzleFcmRegistrationTokenRepository,
} from './repositories'

export const INSTANCE_REGISTRY: InstanceRegistry = {
	mock: [
		{ token: UserProfileRepository, instance: MockUserProfileRepository },
		{ token: UserPreferencesRepository, instance: MockUserPreferencesRepository },
		{ token: FcmRegistrationTokenRepository, instance: MockFcmRegistrationTokenRepository },
	],
	integration: [
		{ token: UserProfileRepository, instance: DrizzleUserProfileRepository },
		{ token: UserPreferencesRepository, instance: DrizzleUserPreferencesRepository },
		{ token: FcmRegistrationTokenRepository, instance: DrizzleFcmRegistrationTokenRepository },
	],
	real: [
		{ token: UserProfileRepository, instance: DrizzleUserProfileRepository },
		{ token: UserPreferencesRepository, instance: DrizzleUserPreferencesRepository },
		{ token: FcmRegistrationTokenRepository, instance: DrizzleFcmRegistrationTokenRepository },
	],
}
```

`middlewares/index.ts`:
```typescript
// No middlewares yet — Tenancy (P2) will add AuthMiddleware once session scoping is defined.
const middlewares: never[] = []
export default middlewares
```

`handlers/internal.ts`:
```typescript
// In-process domain event handlers for the Identity context.
// No handlers yet — Notifications (P10) will subscribe to FcmTokenRegistered + UserPreferencesUpdated.
export {}
```

`handlers/external.ts`:
```typescript
// Cross-service (RedisExternalMediator) handlers for the Identity context.
// Tenancy (P2) will subscribe to UserRegistered here when its cross-BC reactions land.
// Identity itself does not consume any cross-service events at this phase.
export {}
```

`packages/api/typescript/src/identity/index.ts`:
```typescript
import { BoundedContext } from '@template/core-typescript'
import * as controllers from './controllers'
import * as internalHandlers from './handlers/internal'
import * as externalHandlers from './handlers/external'
import { INSTANCE_REGISTRY } from './registry'

const ctx = await BoundedContext.create({
	name: '',
	controllers,
	internalHandlers,
	externalHandlers,
	registry: INSTANCE_REGISTRY,
})

export default ctx.router
```

`packages/api/typescript/src/index.ts` modify:
```typescript
import IdentityRouter from '@identity/index'
// … and inside the routers array:
const routers = [SharedRouter, AuthRouter, IdentityRouter, NotificationsRouter, UIRouter]
```

Add a tsconfig path alias `@identity/*` → `src/identity/*` if not already covered by a barrel pattern in `packages/api/typescript/tsconfig.json`.

- [x] **Step 3: tsc** — `bun --filter @template/api-typescript tsc` → exit 0 / 0 errors. (Live `bun dev` smoke skipped — needs Docker; tsc gate is the meaningful check.)

- [x] **Step 4: Run all Identity tests one more time** — `bun test src/identity/` (from `packages/api/typescript/`) → 103 pass / 0 fail across 17 files. `bun test src/` (full api-typescript suite) → 166 pass / 0 fail across 32 files.

- [x] **Step 5: Commit** — `feat(identity): BC skeleton — handlers barrels + index + MainRouter wiring (P1 Task 17, iter 64)`.

```bash
git add packages/api/typescript/src/identity/registry.ts \
        packages/api/typescript/src/identity/middlewares/ \
        packages/api/typescript/src/identity/handlers/ \
        packages/api/typescript/src/identity/index.ts \
        packages/api/typescript/src/index.ts \
        packages/api/typescript/tsconfig.json
git commit -m "feat(identity): BC skeleton — registry + handlers + MainRouter wiring (P1 Task 17)"
```

---

## Task 18: Contract Lock — SDK regen + final quality gates ✅ DONE iter 65

> **Iter-65 deviations from plan body:**
> - **Discovered + fixed missing IdentityRouter in emit-openapi script.** `packages/api/typescript/scripts/emit-openapi.ts` hardcodes its own `routers` array (separate from `src/index.ts`). Iter-64 wired IdentityRouter into the runtime entry but emit-openapi was still pulling the 4-router list. Added IdentityRouter to the emit-openapi script too — without that fix, the SDK would have shipped without any Identity endpoints.
> - **Skipped repo-wide `bun emit-openapi` + `bun sdk`** — they orchestrate via `nx run-many` which includes `api-rust:emit-openapi` (PRE-EXISTING Rust compile failure, 48 errors in `template-contracts-rust` crate, unrelated to this iter). Ran `bun x nx run api-typescript:emit-openapi --skip-nx-cache` + `cd packages/client && bun generators/typescript.ts` directly to bypass the Rust dep block.
> - **Skipped `bun lint` repo-wide** — same nx-orchestration concern; identity-specific tsc + tests are the meaningful gate for this iter.

**Files:**
- Regen: OpenAPI emit + downstream SDK output (whatever polyglot's `bun emit-openapi` + SDK toolchain emit — verify against `packages/contracts/codegen/` and any SDK package consumed by the frontend).

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** Task 17

- [x] **Step 1: Regen OpenAPI + SDK** — `bun x nx run api-typescript:emit-openapi --skip-nx-cache` + `cd packages/client && bun generators/typescript.ts`. Repo-wide `bun sdk` blocked by PRE-EXISTING Rust compile failure (`template-contracts-rust` has 48 errors, unrelated to this iter); bypassed by running TS-only paths.

- [x] **Step 2: Inspect diff** — emitted OpenAPI now lists `/v1/identity/leads` (POST), `/v1/me/profile` (GET + PATCH), `/v1/me/preferences` (GET + PATCH), `/v1/me/fcm-tokens` (POST + DELETE). Client SDK gained 7 client + 7 hook files: `captureLead`, `updateProfile`, `updateUserPreferences`, `registerFcmToken`, `unregisterFcmToken`, `getProfileSettings`, `getUserPreferencesSettings`.

- [x] **Step 3: tsc gates** — `bun --filter @template/api-typescript tsc` → 0 errors. `bun --filter @template/client check` → 0 errors. Identity suite re-run: `bun test src/identity/` → 103 pass / 0 fail across 17 files. (Repo-wide `bun lint` + `bun test` skipped — same nx-orchestration block as the SDK regen; targeted gates are the meaningful checks for this iter.)

- [x] **Step 4: Commit** — `feat(identity,sdk): Contract Lock — Identity controllers in SDK + emit-openapi fix (P1 Task 18, iter 65)`.

---

## Final Validation

- [ ] `bun tsc` — 0 errors across all workspaces
- [ ] `bun lint` — 0 errors
- [ ] `bun test` — all Identity tests green, no skipped suites
- [ ] `bun e2e --grep "identity"` — N/A here (covered by sub-plan **PE-E2E**)
- [ ] SDK regen committed with Identity controllers visible to the frontend
- [ ] AC mapping (every spec §7.1 command/read → ≥1 test path):

  **Reads:**
  - T01 SignInPage — stateless; no Identity test path needed (frontend renders form). Covered indirectly by Task 15 BetterAuth signup integration test.
  - T02 SignUpPage — `leadToken` prefill: `GetSignUpPagePrefill.test.ts` (Task 16).
  - T03 PasswordResetRequestPage — stateless; no Identity test path.
  - T04 PasswordResetCompletePage — token validity owned by polyglot `auth/` BC; covered by BetterAuth's existing test suite.
  - T05 ProfileSettings — `GetProfileSettings.test.ts` (Task 16).
  - T06 UserPreferencesSettings — `GetUserPreferencesSettings.test.ts` (Task 16).

  **Commands:**
  - C01 CaptureLead — `CaptureLead.test.ts` (emit + idempotency + INVALID_EMAIL) (Task 10).
  - C02 SignUp — `EmitSignUpEvents.test.ts` (Task 14) + BetterAuth bridge test (Task 15).
  - C03 SignIn — BetterAuth bridge test (Task 15) covers session.create.after → UserSignedInEvent.
  - C04 SignOut — same Task 15 test exercises session.delete.after.
  - C05 RequestPasswordReset — extend Task 15 test to assert `identity.user.password_reset_requested`.
  - C06 CompletePasswordReset — extend Task 15 test to assert `identity.user.password_reset`.
  - C07 ChangePassword — extend Task 15 test to assert `identity.user.password_changed`.
  - C08 UpdateProfile — `UpdateProfile.test.ts` (Task 11).
  - C09 RegisterFcmToken — `RegisterFcmToken.test.ts` (Task 13).
  - C10 UnregisterFcmToken — `UnregisterFcmToken.test.ts` (Task 13).
  - C11 UpdateUserPreferences — `UpdateUserPreferences.test.ts` (Task 12).

  **Lock checks:**
  - `BK_DASH_NAMESPACE` byte-for-byte == `f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e` — `BkDashNamespace.test.ts` (Task 1).

---

## Notes

- **No new integration events published by Identity in this phase.** Per spec §4 BC1, Identity is a **producer** of *intra-API* domain events that Tenancy and Notifications consume in-process via `InternalMediator`. Cross-language integration events live in `packages/contracts/wire/events/*.tsp` (none for Identity yet — and Identity does NOT need any until a future sub-plan needs to notify the Go worker about a user lifecycle change). This sub-plan does NOT author any `.tsp` files.
- **Lead persistence:** `LeadCaptured` is event-only (spec §4 BC1 verbatim: *"Lead is captured as an event only — no Lead aggregate persisted"*). Idempotency check queries `domainEventRepository.findByNameAndEntityId(LeadCapturedEvent.name, email)`. If the polyglot `DomainEventRepository` does not yet expose `findByNameAndEntityId`, escalate at Task 10 — do not silently add the method, since it is a polyglot-core change beyond this sub-plan's scope.
- **UserProfile vs polyglot auth.User:** Identity's `UserProfile` aggregate persists into `identity.user_profiles` (FK 1:1 to `authentication.users.id`). The polyglot `auth.User` aggregate continues to own `email`, `emailVerified`, `name`, `image`. UpdateProfile (C08) touches BOTH aggregates within one transaction.
- **`disabledAt`:** spec §4 BC1 lists it on User; the iter-42 schema does not have a `disabled_at` column. We expose `disable()`/`enable()` on the entity (validated) but the repository's `toPersistence` does not write the field. P2 or a future admin sub-plan owns the migration that adds the column and updates the repo.
- **`UserPreferences.timezone` mismatch:** spec §7.1 T06 lists `timezone` as a `UserPreferences` field. In the iter-42 schema, timezone lives on `user_profiles` instead (intentional — it's a per-User attribute, not a notification preference). The `GetUserPreferencesSettings` query joins `UserProfile` to surface `timezone` at the spec-named DTO field. UpdateUserPreferences (C11) does NOT touch timezone — that's UpdateProfile (C08).
- **`UserPreferences.notificationCurrency` resolution:** spec §7.1 T06 surfaces `notificationCurrency: CurrencyCode`. The iter-42 schema has `customCurrency?` plus `notificationCurrencyMode`. Resolution rule (matches spec §1.3 notification currency design): if `mode === CUSTOM_CURRENCY` → use `customCurrency`; if `mode === STORE_CURRENCY` → use the Store's `reportingCurrency` (Tenancy lookup, marked `// TODO(P2)`); if `mode === SALE_CURRENCY` → use the Order's `presentmentMoney.currency` (per-notification — for the settings DTO at this phase, fall back to `customCurrency ?? 'USD'`).
- **Naming clash with polyglot `auth.user.registered` event:** polyglot's `auth.UserRegisteredEvent` (`auth.user.registered`) is a **distinct** event with a different name from Identity's `identity.user.registered`. The bridge (Task 15) calls `EmitSignUpEvents.execute` which appends the Identity-named event in the same outbox transaction as polyglot's auth event. Both fire; downstream contexts decide which one to listen on (BK Dash BCs listen on `identity.*`).
- **Graph CLI:** master-plan caveat 2 — `bun scripts/graph/cli/index.ts` is currently broken in this repo. Skip `validate-plan` for this sub-plan. Polyglot may have already shipped a fix; verify before adopting.
- **Test harness:** the polyglot integration test scaffold (container child, PGlite/Postgres bootstrap, migration apply, reset/destroy) is the authoritative shape — `/build` should copy the pattern from an existing `packages/api/typescript/src/**/*.test.ts` that uses `tsyringe-neo` containers, NOT from medscall.

---

## Dependency footer — sub-plans that depend on P1-IDENTITY

| Downstream sub-plan | Why it depends on P1 |
|---|---|
| **P2-TENANCY** | Consumes `UserRegisteredEvent` (intra-API) to know which users exist; `StoreMembership.userId` FKs the `authentication.users` row Identity supplements; `CreateStore` gate reads `UserPreferences` for default notification routing. |
| **P3-BILLING** | `Subscription.userId` FKs the authentication.users row; Kiwify webhooks resolve `subscriptionId` → user via polyglot `auth.UserRepository.findById`, then Identity's `UserPreferences` for billing-email currency rendering. |
| **P4-INTEGRATION** | `StoreIntegration` controller requires `ctx.user.id` from Identity-issued BetterAuth session; reads `UserPreferences.notificationCurrencyMode` + `customCurrency` for handshake failure notifications. |
| **P5-CATALOG**, **P6-SALES**, **P7-MARKETING**, **P8-TRACKING**, **P9-FINANCE** | All require authenticated `ctx.user.id` from Identity sessions; all queries scope by stores the user has membership in (chain: Identity → Tenancy → BC). |
| **P10-NOTIFICATIONS** | Subscribes to Identity's `FcmTokenRegisteredEvent`, `FcmTokenUnregisteredEvent`, `UserPreferencesUpdatedEvent`; reads `UserPreferences.dailyNotificationsEnabled` + `notificationCurrencyMode` + `customCurrency` + `orderPushPerStore` + `UserProfile.timezone` + `UserProfile.language` to schedule and route notifications. |
| **P11-ANALYTICS** | Reads `UserPreferences.customCurrency` for admin reporting; admin `x-admin-secret` endpoints look up users by email via polyglot `auth.UserRepository.findByEmail`. |
| **PE-E2E** | E2E flows start with signup (Identity bridge) → store creation (Tenancy) → connect-integration (Integration). |

**Bottom line:** P1-IDENTITY is foundational — once landed, P2 / P3 can run in parallel (per the master plan dependency graph), and every subsequent BC inherits authenticated context from polyglot's BetterAuth session bridged through Identity's emitters.

---

## Cross-sub-plan invariants this plan locks in

1. `BK_DASH_NAMESPACE = 'f63cfbe6-7d8e-4d1d-9c5d-9d8a8b1b0c5e'` lives **once** in `packages/api/typescript/core/src/objects/HashedID.ts` (mirrors `packages/api/go/core/objects/id.go`). Every canonical entity ID in TS uses `uuidv5(BK_DASH_NAMESPACE, '${platform}:${externalId}')`. Identity re-exports for ergonomics but never re-declares the value.
2. `UserProfile.userId` == `UserPreferences.id` == `authentication.users.id` == every downstream `userId` FK. No parallel user table.
3. `UserPreferences.id` is a 1:1 PK FK to `authentication.users.id` (cascade delete) — enforced by iter-42 schema.
4. Every Identity domain event has `entityId === userId === ownerId` (single-tenant aggregates). `ownerId` carries the spec's "Identity-only aggregates scoped to userId only" rule into the outbox routing convention.
5. The Identity context does NOT publish any cross-service integration events at this phase — those are reserved for Go-worker-originating canonical writes (P4..P8) and Billing webhooks (P3).
6. UpdateProfile (C08) is the **only** Identity command that mutates polyglot's `auth.User` row. Every other command stays inside `identity.*` tables.
