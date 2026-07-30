---
name: test
description: Write and update backend tests with bun:test using colocated unit/use case/handler specs in src, process-level flows in packages/api/tests/flows, and the TestBed/DrizzleDatabaseDriver integration harness in packages/api/tests/support.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Write Tests

Use `bun:test` for all backend tests.

In this codebase, test structure is intentionally split by purpose:

- **Pure unit tests** stay colocated with the artifact in `src/**`
- **Use case and handler tests** also stay colocated in `src/**`, but many of them are application-level tests, not pure unit tests
- **Shared test infrastructure** lives in `packages/api/tests/support`
- **Process/flow tests** live in `packages/api/tests/flows`
- **Drizzle integration** uses the `DrizzleDatabaseDriver` contract, with `BunSQLDriver` for runtime and `PGliteDriver` for embedded integration tests

## Source of Truth

When the framework behavior is unclear, read these files before inventing a new pattern:

- `packages/api/tests/support/TestBed.ts`
- `packages/api/tests/support/PipeBuilder.ts`
- `packages/api/tests/support/types.ts`
- `packages/api/typescript/src/shared/db/drizzle/drivers/DrizzleDatabaseDriver.ts`
- `packages/api/typescript/src/shared/db/drizzle/drivers/PGliteDriver.ts`
- `packages/api/typescript/src/shared/db/drizzle/drivers/BunSQLDriver.ts`
- `packages/api/typescript/src/shared/services/Mediator/SpyMediator.ts`

## Folder Layout

Use this layout as the default:

```text
packages/api/
  src/
    clinic/
      usecases/
        clinic/
          CreateClinic.ts
          CreateClinic.test.ts
      handlers/
        ClinicCreatedHandler.ts
        ClinicCreatedHandler.test.ts

  tests/
    setup.ts
    support/
      TestBed.ts
      PipeBuilder.ts
      types.ts
    flows/
      appointment-lifecycle.test.ts
      integration-smoke.test.ts
```

Rules:

- Keep **unit tests**, **use case tests**, and **handler/workflow tests** colocated in `src/**`
- Keep only shared harness code under `packages/api/tests/support`
- Keep only process-level, multi-step scenarios under `packages/api/tests/flows`

## Quick Decision Rule

- **Entity, Value Object, enum helper, pure utility**: direct unit test, no `TestBed`
- **Use case test near a single artifact**: colocated `*.test.ts`; use direct instantiation only if the artifact is truly in-memory
- **Use case or handler that extends `Handler` or depends on container-bound infrastructure**: colocated `*.test.ts` with `TestBed.create('integration', ...)`
- **Workflow, saga, or multi-step business scenario**: `packages/api/tests/flows` with `testBed.pipe(...).run()`
- **Real Drizzle repository, migrations, or persistence behavior**: `TestBed.create('integration', ...)`

## Unit Tests

Use plain unit tests for artifacts whose behavior is fully in-memory.

- Keep the test next to the artifact
- Instantiate the artifact directly
- Use explicit collaborators or tiny hand-written fakes
- Do not boot DI, command queue, mediator, outbox, or `TestBed`
- Assert domain invariants, state transitions, and thrown errors

```ts
import { describe, expect, it } from 'bun:test'
import { BaseError } from '@codm/core-typescript'
import { Patient } from './Patient'

describe('Patient', () => {
	it('should reject invalid cpf', () => {
		expect(() => {
			Patient.create({
				unitId: 'unit-1',
				fullName: 'Maria Silva',
				rg: '12345678',
				cpf: 'invalid',
				birthDate: '1990-01-01',
				email: 'maria@example.com',
				phone: '+5511999999999',
			})
		}).toThrow(BaseError)
	})
})
```

## The `TestBed` Mental Model

`TestBed` is the harness for **application-level** tests. Even `mock` mode is not a pure unit harness.

It lives in `packages/api/tests/support/TestBed.ts` and wires:

- a child DI container
- use case registration in the command queue
- internal handler registration
- external handler registration
- spy mediators for both channels
- outbox flushing between steps
- environment-specific persistence wiring for integration mode

Important consequence:

- **Do not call a TestBed-backed spec a unit test**
- **Use TestBed only when the artifact actually needs app wiring**

### `TestBed` Modes

`mock`

- registers `ALL_REGISTRIES.mock`
- uses mock repositories/infrastructure
- overrides outbox with `MockOutboxDispatcher`
- best for flow tests in `packages/api/tests/flows` that need container-bound infrastructure with mock services

`integration`

- registers `ALL_REGISTRIES.integration`
- resolves `DrizzleDatabaseDriver` from the container
- uses `databaseDriver.reset()` in `testBed.reset()`
- uses `databaseDriver.close()` in `testBed.destroy()`
- best for repository mappings, migrations, persistence, and Drizzle-backed flows

## Drizzle Database Driver

`DrizzleDatabaseDriver` is the common abstraction for Drizzle-backed database environments.

Current implementations:

- `BunSQLDriver`: runtime/real environment
- `PGliteDriver`: embedded integration environment

Both expose:

- `db`
- `unitOfWorkFactory`
- `reset()`
- `runMigrations()`
- `readMigrations()`
- `close()`

Use this mental model:

- `DrizzleClient` is the query client
- `DrizzleDatabaseDriver` is the environment wrapper around that client
- runtime uses `BunSQLDriver`
- embedded integration tests use `PGliteDriver`

Do not bypass that distinction when writing integration tests or registry wiring.

## What `TestBed` Exposes

- `testBed.resolve(Token)`:
  - resolves from the test child container
  - auto-binds `Handler` subclasses to that container
- `testBed.pipe(...)`:
  - builds typed command chains from registered use case names
- `testBed.spy`:
  - spies on the internal mediator
  - records dispatched events and internal handler activations
- `testBed.externalSpy`:
  - spies on the external mediator
  - records published events and external handler activations
- `testBed.reset()`:
  - resets spies/mock infrastructure
  - in integration mode, delegates database cleanup to `DrizzleDatabaseDriver.reset()`
- `testBed.destroy()`:
  - releases integration resources

## Use Case Tests

Keep use case tests colocated next to the use case file.

Choose between two styles:

1. Pure unit test:
   Only when the use case is truly in-memory and does not depend on container-bound infrastructure.

2. TestBed-backed application test:
   Default for use cases extending `Handler` or using repositories, mediators, outbox, or unit-of-work wiring.

Use `integration` mode for colocated use case tests. Given helpers set up prerequisite entities via repos directly (never use cases).

### What to Test (and What NOT to Test)

Use case tests focus on **orchestration logic** — the value the use case adds beyond what entities already enforce:

- **Test**: permission checks, not-found errors, cross-entity coordination, state transitions, side effects (events, onboarding), correct persistence
- **Do NOT test**: entity-level input validation (VALIDATION_ERROR). Schema validation, value object parsing, and domain invariants are already covered by entity/value-object unit tests. Duplicating them at the use case level is redundant and adds maintenance burden without coverage value.

Example of what belongs in a use case test:
```ts
// Good — orchestration-level error
it('should throw PATIENT_NOT_FOUND when patient does not exist', ...)
it('should throw INVALID_PERMISSION when member lacks role', ...)
it('should throw INVITATION_EXPIRED when invite has expired', ...)
```

Example of what does NOT belong in a use case test:
```ts
// Bad — entity-level validation (already tested in Entity.test.ts)
it('should throw VALIDATION_ERROR when email is invalid', ...)
it('should throw VALIDATION_ERROR when phone is invalid', ...)
it('should throw VALIDATION_ERROR when priceRange.from > priceRange.to', ...)
```

Canonical example:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed, givenClinicWithOwner, givenPatient } from '@test/support'
import { PatientRepository } from '@patient/repositories'
import { Phone } from '@shared/objects'
import { UpdatePatient } from './UpdatePatient'

describe('UpdatePatient', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let patientRepository: PatientRepository
	let updatePatient: UpdatePatient

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', {
			testContainer,
			ownerId: 'integration-tenant',
		})

		patientRepository = testBed.resolve(PatientRepository)
		updatePatient = testBed.resolve(UpdatePatient)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('should update patient name', async () => {
		const { unit } = await givenClinicWithOwner(testBed)
		const patient = await givenPatient(testBed, {
			ownerId: unit.ownerId.value,
			phone: Phone.parsePhone('+5511999999999'),
		})

		const result = await updatePatient.execute({
			patientId: patient.id.value,
			unitId: unit.id.value,
			fullName: 'Maria Souza',
		})

		expect(result.fullName).toBe('Maria Souza')
	})
})
```

## Given Helpers

Given helpers live in `packages/api/typescript/tests/support/given/` and provide a composable way to set up test data via repositories directly (never via use cases).

Import from `@test/support`:

```ts
import { givenUserWithAccount, givenOwner, givenOwnerWithResponsible } from '@test/support'
```

Rules:

- Given helpers **always use repositories directly**, never use cases
- Each helper accepts `testBed` as first argument and optional `overrides`
- Composite helpers compose lower-level ones (e.g., `givenOwnerWithResponsible` calls `givenUserWithAccount` + `givenOwner`)
- Helpers return the created entity (or a struct of entities for composites)
- They live in `packages/api/typescript/tests/support/given/` and are re-exported from `@test/support`

Composition tree:

```
givenOwnerWithResponsible    ← the workhorse for any owner-scoped test (RequireOwner passes for the returned user)
  ├── givenUserWithAccount → givenUser + givenAccount
  └── givenOwner             (responsibleUserId = that user)
```

Available helpers:

| Helper | Context | Signature | Returns |
|--------|---------|-----------|---------|
| `givenUser` | auth | `(testBed, overrides?)` | `User` |
| `givenAccount` | auth | `(testBed, userId, overrides?)` | `Account` |
| `givenUserWithAccount` | auth | `(testBed, overrides?)` | `{ user, account }` |
| `givenActiveSession` | auth | `(testBed, userId)` | `token: string` |
| `givenOwner` | owner | `(testBed, overrides?)` | `Owner` |
| `givenOwnerWithResponsible` | owner | `(testBed, { user?, owner? })` | `{ user, account, owner }` |
| `givenUserProfile` | auth | `(testBed, { userId?, timezone?, language? })` | `UserProfile` |
| `givenFcmRegistrationToken` | auth | `(testBed, { userId?, token?, platform? })` | `{ token, userId }` |
| `givenDomainEvent` | any | `(testBed, event)` | `void` |

> **The helper set grows with the domain.** When a new use case needs prerequisite
> state that no helper provides (a `ProductCost`, an `Order`, a stubbed exchanger /
> handshaker), add a `givenX` here (repo-direct, composing the helpers above) and ship
> it WITH its first consumer — never hand-cast a partial stub (`{} as unknown as XRepo`)
> in the test. Add the Mock + its tests only when the first consuming use case exists.

## Handler, Workflow, and Saga Tests

Keep these tests colocated with the handler/workflow.

Rules:

- If testing orchestration logic directly, resolve the handler/workflow via `testBed.resolve(...)`
- If testing that a use case starts a workflow, assert only the local contract there
- If testing the whole business process across commands/events, use `packages/api/tests/flows`

## Flows

Use flow tests for scenarios that matter as a process, not as a single artifact.

- Keep them under `packages/api/tests/flows`
- Use `beforeAll` to build longer-lived flow fixtures when needed
- Use `beforeEach` with `testBed.reset()` to clear flow state
- Use `afterAll` with `testBed.destroy()` for integration resources
- Build the scenario with `testBed.pipe(...)`
- Each step can derive its input from previous outputs
- `run()` automatically flushes the outbox after each step

```ts
const result = await testBed
	.pipe('create_clinic', {
		name: 'Clinic Alpha',
		userId: 'user-1',
	})
	.pipe('create_unit', prev => ({
		clinicId: prev[0].clinicId,
		name: 'Unit Downtown',
		address: someAddress,
		ownerUserId: 'user-1',
	}))
	.run()

expect(result.success).toBe(true)
if (!result.success) return

expect(testBed.spy.getEventsOfType('clinic.clinic.created')).toHaveLength(1)
expect(testBed.externalSpy.getPublishedOfType('clinic.clinic.created')).toHaveLength(1)
```

### `PipeBuilder.run()` Result Shape

`run()` returns a discriminated union:

- success:
  - `{ success: true, outputs }`
- failure:
  - `{ success: false, outputs, error, failedAt }`

Always guard before reading `outputs`:

```ts
expect(result.success).toBe(true)
if (!result.success) return
```

When failure is expected:

```ts
expect(result.success).toBe(false)
if (result.success) return
expect(result.failedAt).toBe(0)
expect(result.error.name).toBe('DOCTOR_NOT_ASSIGNED_TO_UNIT')
```

## Repository Integration Tests

Every Drizzle repository should have an integration test covering: save, findById, delete, and all query methods.

Canonical pattern:

```ts
import { TestBed, givenUser } from '@test/support'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, DependencyContainer } from 'tsyringe-neo'
import { UserRepository } from './UserRepository'

describe('DrizzleUserRepository', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let userRepository: UserRepository

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', {
			testContainer,
			ownerId: 'integration-tenant',
		})
		userRepository = testBed.resolve(UserRepository)
	})

	beforeEach(async () => {
		await testBed.reset()
	})

	afterAll(async () => {
		await testBed.destroy()
	})

	it('should save and retrieve by id', async () => { ... })
	it('should update on re-save', async () => { ... })
	it('should delete', async () => { ... })
	// + all query methods
})
```

Rules:

- Use given helpers for FK dependencies (e.g., `givenUser()` before creating an Account)
- Test each query method with positive and negative cases
- Use `beforeAll` for TestBed creation (not `beforeEach` — expensive for integration)
- Use `beforeEach` only for `testBed.reset()` to clean DB between tests

Use integration mode when you need:

- real Drizzle mappings
- real schema/migrations
- repository persistence checks
- embedded Postgres behavior via PGlite

Important:

- this validates the **Drizzle + schema + repository** stack
- this does **not** guarantee full production parity for transaction nesting/locking semantics
- `PGliteDriver` uses a specialized unit-of-work strategy because of PGlite's single-connection constraints

## Lifecycle Guidance

Use this cadence for all TestBed-backed tests (use cases, repositories, handlers, flows):

```ts
beforeAll(async () => {
	testContainer = container.createChildContainer()
	testBed = await TestBed.create('integration', {
		testContainer,
		ownerId: 'integration-tenant',
	})
	// resolve repos and use cases here
})

beforeEach(async () => {
	await testBed.reset()
})

afterAll(async () => {
	await testBed.destroy()
})
```

Rules:
- **`beforeAll`**: Create TestBed once per suite (expensive to boot PGlite)
- **`beforeEach`**: Reset DB state between tests
- **`afterAll`**: Close DB connections
- Use `integration` mode for both use case tests and repository tests
- Flow tests in `packages/api/tests/flows` also follow this same lifecycle

## Imports

Prefer these imports:

- `@test/support` for `TestBed`
- the `@codm/core-typescript` barrel (BaseError, tryCatchAsync, z, Handler, Transaction)
- direct artifact-relative imports for colocated tests

Do not use removed or outdated test paths like:

- `@shared/__tests__`
- `packages/api/typescript/src/shared/__tests__/*`

In tests, assert errors with `expect().rejects` (TST-17) — `tryCatchAsync` is a production-code convention.

## Hard Cases

### Asserting thrown errors (TST-17)

Use `bun:test`'s built-in typed API instead of hand-rolling try/catch:

```ts
// sync (entity / value object invariant):
expect(() => Store.create({ name: '' })).toThrow(BaseError)

// async — assert the error CODE, not the message:
await expect(useCase.execute({ storeId: testId() })).rejects.toMatchObject({ name: 'STORE_NOT_FOUND' })
```

Never do this (bp-19):

```ts
let caught: unknown = null
try { await useCase.execute({ ... }) } catch (e) { caught = e }
expect((caught as BaseError).name).toBe('STORE_NOT_FOUND')   // silently passes for non-BaseError
```

### HTTP collaborators — createFakeFetch (bp-20)

Services that accept `fetchFn: typeof fetch` (e.g. `ShopifyHandshaker`) need a typed stub, not a raw cast. Use `createFakeFetch` from `@test/support`:

```ts
import { createFakeFetch, jsonResponse } from '@test/support'

const { fetch, calls } = createFakeFetch({
  routes: { '/shop.json': () => jsonResponse({ shop: { myshopify_domain: 'foo.myshopify.com' } }) },
})
const handshaker = new ShopifyHandshaker(fetch)   // typed; no cast in the test
```

The one `as unknown as typeof fetch` cast lives inside `createFakeFetch` — nowhere else.

### Seeding persisted domain events — givenDomainEvent vs bp-16

`givenDomainEvent(testBed, event)` persists a real event row via `DomainEventRepository.save`. Use it **only** for use cases that query the events table as their read-model (e.g. `ListSubscriptionEventHistory`). This is distinct from `givenEvent` (bp-16), which seeds the outbox for cross-process replay — do not confuse the two.

```ts
import { givenDomainEvent, testId } from '@test/support'

await givenDomainEvent(testBed, new SubscriptionCreatedEvent({
  entityId: testId('subscription', '1'),
  ownerId: testId('user', '1'),
  payload: { ... },
}))
const events = testBed.resolve(DomainEventRepository)
const found = await events.findByType(SubscriptionCreatedEvent)
expect(found).toHaveLength(1)
```

### Test identifiers — testId (bp-18)

Replace opaque UUID literals with `testId`:

```ts
import { testId } from '@test/support'

const storeId = testId('store', 'a')   // deterministic UUIDv5 — stable across runs
const unknown  = testId()              // fresh random UUIDv7 — for not-found / uniqueness cases
```

### Event ordering (bp-22)

`BaseDomainEvent` carries no `createdAt`; the DB assigns it at insert. Do not `setTimeout` between saves to force ordering. Assert set membership or count instead:

```ts
const types = items.map(i => i.type)
expect(types).toContain(SubscriptionCreatedEvent.name)
```

If strict ordering is required, fix the read-side query (add `ORDER BY inserted_at`), not the test.

## Given Helpers Index

All helpers live in `packages/api/typescript/tests/support/given/` and are re-exported from `@test/support`. Call the bare function form — `givenX(testBed, overrides?)` — which is the canonical API (TST-18). The `createGivenHelpers` facade is deprecated.

| Module | Helpers | Context |
|--------|---------|---------|
| `users` | `givenUser`, `givenAccount`, `givenUserWithAccount` | auth |
| `sessions` | `givenActiveSession` | auth |
| `owners` | `givenOwner`, `givenOwnerWithResponsible` | owner |
| `identity` | `givenUserProfile` | auth (UserProfile) |
| `workspaces` | `givenWorkspace` | workspace |
| `threads` | `givenThread` | thread |
| `issues` | `givenIssue` | issue |
| `stops` | `givenStop` | issue (repo-direct stop row) |
| `events` | `givenDomainEvent` | any (cross-context event-as-data) |

## Test Homes

Colocated `*.test.ts` in `src/**` (unit / repository / use case / handler), process-level flows in
`tests/flows/`, repo-wide mechanical rails in `tests/architecture/`, kernel suites in
`tests/kernel/`, and **`tests/integration/` is a legitimate home** for cross-context integration
suites that fit none of the colocated homes.


---

## Review Checklist

Before finishing a testing task, confirm:

- the test is in the correct folder for its intent
- pure unit tests do not boot `TestBed`
- TestBed-backed specs are described as app-level tests, not unit tests
- repositories, use cases, and handlers are resolved through `testBed.resolve(...)`
- flow tests assert state and relevant internal/external event activity
- integration tests respect the `DrizzleDatabaseDriver` abstraction instead of wiring ad-hoc clients

## Spec-Compliance vs Code-Quality Review

`/build` runs **two separate reviews** on every Task's test changes:

- **Stage 1 — spec-compliance** (`spec-compliance-reviewer` agent, haiku).
  Asks: *does this test exercise the AC the Task is supposed to cover,
  no more / no less?* Catches under-building (the AC has no
  corresponding assertion) and over-building (the test asserts
  details the spec never required, e.g. a `--json` flag the spec
  didn't mention).
- **Stage 2 — code-quality** (`scripts/review.ts`, haiku).
  Asks: *does the test follow this skill's canonical patterns?*
  Catches `testBed.http.*` for usecase tests, missing
  `TestBed.create('integration', ...)`, raw SQL in repository tests,
  pure unit tests booting DI, tests in the wrong folder, etc.

Stage 1 runs first. If Stage 1 flags `MISSING` (the AC isn't tested),
the implementer fixes that **before** Stage 2 audits the code. This
prevents wasted style review on tests that are about to be rewritten.

When you author a test, the safest sequence:

1. Read the Task's listed ACs.
2. Write the **outer** failing test that asserts the AC's observable
   outcome (E2E for full-stack, integration test for backend-only,
   flow test for cross-context async).
3. Drive each inner layer (entity, repository, usecase, …) with
   focused inner-cycle tests as the implementation grows.
4. Self-check against the patterns above. Avoid the common mistakes
   so Stage 2 doesn't have to flag them.
