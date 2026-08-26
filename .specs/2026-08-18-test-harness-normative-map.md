# Test Harness — Normative Map

*Synthesis of a 5-dimension audit (inventory, identity, multi-service, fragility, coverage, givens) plus adversarial refutation of each finding. Every number below was measured in this worktree unless explicitly marked "not measured".*

> **Provenance.** Produced 2026-08-18 by a 20-agent audit workflow (`test-harness-audit`, run
> `wf_6a0f5d92-f9b`): 7 parallel dimension auditors, then an adversarial refuter per falsifiable
> claim — **12 verdicts, 8 survived, 4 refuted** — then this synthesis. 2.5M tokens, 1212 tool calls,
> 38 min. One auditor (`doutrina`, doctrine-drift) **died on a transient API error**; §7 was
> reconstructed from the other six, so treat that section as thorough-but-not-exhaustive.
>
> **Read §5 F1 and F7 first.** They are the two findings that cost something today, not eventually.

---

## 0. The one-line boundary

**Anything that needs an external world — a phone, a provider CLI, the OS browser, the OS keychain, a deployed Postgres, Redis, a webview — is out. Anything the repo can raise from its own source is in, and it is in *for real*: real processes, real binaries, a real file on disk.** There are 4 runners (`bun test` v1.3.14, `go test`, `cargo test`, `playwright`) and **zero vitest** (`grep -rn vitest package.json packages/*/package.json packages/*/*/package.json` → empty).

Totals, unique (no double-counting re-execution):

| Runner | Files | Cases | Executable today |
|---|---|---|---|
| `bun test` | 332 | 2,539 | 2,539 |
| `go test` | 42 | 273 top-level funcs / **309 leaves** | 309 |
| `cargo test` | 18 (3 crates) | 82 declared `#[test]` | **17** (8 contracts + 9 client; 64 tauri don't compile, 1 client `#[ignore]`) |
| `playwright` | 10 | 13 | 11 (2 `test.skip`) |
| **Total** | **402** | **~2,943 declared** | **2,878** |

Redundancy inside `bun run test`: 383 file-runs / 3,035 case-runs, i.e. **496 redundant executions** — `core-typescript` (40 files / 268 cases) runs in both `core-typescript:test` and `api-typescript:test`; `detect:self-test` (10 files / 170 cases) is a subset of `test:tooling`; `union-parity.test.ts` (58 cases) is declared in two targets.

---

## 1. THE HIERARCHY

Ordered cheapest → most expensive. **Rule: pick the cheapest layer whose boundary is real for the assertion you want to make. Escalate one layer only when the thing you are asserting is precisely the boundary the cheaper layer fakes.**

### L0 — Unit (no harness)
`src/*/entities/*.test.ts` (9 files / 112 cases), value objects, `shared/objects` (5 files). Direct instantiation, no container, no DB, no identity.
- **Can assert:** invariants, `DomainError` codes, VO self-validation, enum closure, pure transitions (`Projection.applyEvent` branches).
- **Cannot assert:** anything about wiring, persistence, ownership scoping, or event delivery.
- **Cost:** microseconds.

### L1 — Static rails (no harness, tree scan / ts-morph)
`packages/api/typescript/tests/architecture/` (33 files / 201 cases; `ls` shows 38 entries, 34 `.test.ts`/`.typecheck.ts`), `packages/app/react/tests/architecture/` (8 files / 69 cases, incl. a stories-smoke over 52 `*.stories.tsx`), `packages/app/tauri/src-tauri/tests/no_raw_http.rs`.
- **Can assert:** universally-quantified structural claims over the whole tree, at near-zero cost, with a falsifiable negative fixture. This is the layer the repo *substitutes for booting* when booting is too expensive — `tests/architecture/build-output.test.ts:23-27` exists because booting the bundle under the cloud profile would stage `pglite.wasm` + `pglite.data` (13 MB measured) into a 20 MB `dist/` = **+65 % on every production image** for a driver production never builds.
- **Cannot assert:** any runtime behavior. A rail proves shape, never execution — see `scripts/test-liveness.test.ts`, which proves every test file is *reached* by a declared target and cannot prove it *runs* (§5, F7).

### L2 — Pure library / codegen tests (no harness)
`packages/contracts/{codegen,catalog}` (10 / 102), `packages/contracts/generated/{rust,go}/tests` (3 / 8 + 2 / 6), `packages/client/lib` (3 / 10), `packages/client/dist/rust/tests` (3 / 10), `core-typescript` (40 / 268), `test:tooling` (57 / 726).
- **Can assert:** generator output, kernel driver conformance, scaffolder goldens, parity gates.
- **Cannot assert:** anything about the application's DI columns.

### L3 — `TestBed.create('mock')`
`tests/flows/*.flow.test.ts` (9 / 47). `MockUnitOfWorkFactory`, `MockOutboxDispatcher`, `OutboxAwareMockDomainEventRepository`, in-memory mediators, `Mock*Repository` holding `Map`s.
- **Can assert:** choreography across use cases (sagas): use case A raises event → handler fires → use case B runs. `MockExternalMediator` captures integration events without publishing.
- **Cannot assert:** SQL, transactional atomicity, dialect, ownership scoping at the DB level.
- **Load-bearing precondition nothing declares:** `_resetFn` clears **no** `Mock*Repository`. This lane is only safe because flow tests rebuild the child container in `beforeEach`. See §5 F4.

### L4 — `TestBed.create('integration')`
The workhorse: 44 usecase files / 288 cases, 15 services / 169, 11 controllers / 69, 8 repositories / 44, 4 handlers / 14. Real outbox, real `OutboxDispatcher`, real mediators.
- **Database, corrected:** default family is **libsql**, not PGlite. `TestBed.ts:117` → `registerAll(testContainer, withFamily(ALL_REGISTRIES.integration, FAMILY_REGISTRY[options.db ?? 'libsql'].integration))`; `:51` `FAMILY_REGISTRY = { libsql: LIBSQL_DB_REGISTRY, pg: PG_DB_REGISTRY }`; `:60` comment "Default `libsql`". Chain: `src/shared/registry.ts:160` (`integration: libsqlDriver`) → `:72` `useFactory: () => getTestDatabaseDriver()` → `:68-70` `new LibSqlDriver({ schema, migrationsDir })`, SQLite in `mkdtemp`, memoized. **79 files** call `TestBed.create('integration'`; **13** pass `db: 'pg'` → `PGliteDriver`. So **~66/79 (84 %) of integration suites run SQLite.**
- **When you must pass `db: 'pg'`:** when the context's `PLACEMENT` puts it on the cloud deployment — `src/shared/deployment.ts:143-144` places `auth` and `owner` under `{ deployment: 'cloud', infra: { db: 'pg' } }`; `shared` is dual by design. Omitting it does **not** fail `tsc`; it fails at tsyringe resolve-time with an error pointing at the container, far from the `TestBed.create` line.
- **Can assert:** persistence, complex queries, use-case orchestration, outbox → dispatcher → handler end to end, controller Zod validation + status codes.
- **Cannot assert:** the HTTP middleware chain's identity stamping (no `CloudSessionMiddleware` runs here), cross-process behavior.
- **Cost anchor:** `bun test src/agent/repositories/AgentSessionRepository/LibSqlAgentSessionRepository.test.ts` → 7 pass / 0 fail in **537 ms**.

### L5 — `startIntegrationBackend()` (the second door)
`packages/api/typescript/tests/support/testing.ts`. Boots the daemon in-process over HTTP under column `integration` → `MockCloudSession`. **This is a second entry point, not a `TestBed` mode.** `TestBedMode` is exactly `'mock' | 'integration'` (`TestBed.ts:55`); the `e2e` column enters via `start({ env: withServices ? 'e2e' : 'integration' })` at `testing.ts:199`.
- **Can assert:** routing, middleware chain, serialization, real HTTP status codes against the real driver.
- **Cannot assert:** cross-process integration, real cloud identity.

### L6 — `startIntegrationBackend({ services: ['apiGo'] })`
Same door + a **real second OS process**. Flipping `services` switches the column from `integration` to `e2e`, because only `e2e` binds `FileLibsqlDriver` (a file, not memory) and `SqlExternalMediator` (`shared_outbox` lanes with a poller). **The transport between the two processes is not a socket — it is one SQLite file in `HARNESS_DATA_DIR`, and integration events cross as `shared_outbox` rows.**
- **Requires `identity: 'double'`** or every controller returns 503 (§3, trap T2).
- **Can assert:** TS ⇄ Go co-tenancy, the real Go router / mapper / outbox / handler / projector.
- **Cannot assert:** anything the `MailboxDispatcher` does (§3, trap T3); anything needing the `real` column.

### L7 — React component harnesses
`packages/app/react/src/**/*.test.ts(x)` (38 / 195) + rails (8 / 69) + spikes (2 / 3) + cross-service (5 / 8). Four distinct harnesses in `packages/app/react/tests/support/`:
- `storybook.ts` (21 files) — `mockQuery` / `mockMutation` / `mockSession` from `@/storybook`. Cheapest; dumb components and `play` stories.
- `mountRouter.tsx` (11 files) — happy-dom + router; navigation, search-param contracts.
- `fetchStub.ts` (4 files) — fetch-level isolation.
- `integration-harness.ts` (20 files) — `useIntegrationBackend()`, a **pure pass-through** to L5/L6 (`integration-harness.ts:247-266`).

### L8 — Playwright e2e
`packages/e2e/tests/*.spec.ts` — 10 files / 13 cases (11 effective). `workers: 1` (measured: 14.9 s serial vs ~26 s parallel — SQLite contention cost more than the parallelism bought), `retries: 0`. **Excluded from `bun run test`.** Four `webServer` entries (§4).
- **Can assert:** the shipped artifact under a real browser across 4 processes.
- **Cannot assert:** anything gated on credential issuance (§3) or the `real` column.

### The layer that does not exist
**`real`.** Measured: grep for `'real'` combined with `start(` / `TestBed.create` / `startIntegrationBackend` across every `*.test.ts` → **zero occurrences**. No test boots the production column. This defines §6 mechanically.

---

## 2. THE DECISION RULE

| I want to test… | Layer | Harness / entry point | Command |
|---|---|---|---|
| Entity invariant, VO validation, enum closure | L0 | none — direct instantiation | `bun test` from `packages/api/typescript` |
| `Projection.applyEvent` / `static create` branch | L0 | none | idem |
| "no file in the tree may do X" | L1 | `tests/architecture/` + **negative fixture** | idem |
| TypeSpec → ts/go/rust binding shape | L2 | none | `bun x nx run @codm/contracts:test` |
| Kernel driver conformance (LibSql, PGlite) | L2 | direct drivers, `tests/kernel/**` (9 / 61) | `api-typescript:test` |
| Scaffolder / hook / detector / parity gate | L2 | tmpdir fixtures, synthetic repos | **`bun run test:tooling`** (no Nx target, no CI) |
| Saga across use cases | L3 | `TestBed.create('mock')`, rebuild child container in `beforeEach` | `bun test tests/flows` |
| Repository SQL / atomic projection op | L4 | `TestBed.create('integration', { testContainer, ownerId })` | `api-typescript:test` |
| …for `auth` / `owner` / cloud `shared` | L4 | **same + `db: 'pg'`** (13 files do) | idem |
| Use case + outbox + handler reaction | L4 | `integration` (real dispatcher) | idem |
| Controller Zod validation / status code | L4 | `integration`, colocated `controllers/*.test.ts` | idem |
| Full HTTP path incl. `CloudSessionMiddleware` | L5 | `startIntegrationBackend()` | idem |
| TS ⇄ Go gateway co-tenancy | L6 | `startIntegrationBackend({ services: ['apiGo'], identity: 'double' })` | `api-typescript:test` → `bun run test:cross-service` |
| React dumb component / visual | L7 | `@/storybook` mocks | `app-react:test` |
| React routing / search params | L7 | `mountRouter.tsx` | idem |
| React component against the real backend | L7 | `useIntegrationBackend()` | idem |
| React component + real Go gateway | L7/L6 | `useIntegrationBackend({ services: ['apiGo'], identity: 'double' })` — **1 process per file** | `app-react:test` → `scripts/test-cross-service.ts` |
| Browser-real user flow across 4 processes | L8 | Playwright fixtures `daemonSession` / `network` / `goto` + `utils/given/` | **`bun e2e`** (not in `bun run test`) |
| Go handler / store / mapper | — | sqlite temp store + fakes | `api-go:test` (`go test ./...` + `go -C core test ./...`) |
| Tauri shell (Rust) | — | none | `app-tauri:test` — **BROKEN, see §5 F1** |
| Migration ledger interlock Go ↔ TS | — | `core/db/sqlite/store_test.go:383` spawns `bun apply-migrations-once.ts` | `api-go:test` |
| A **second TS process** as co-tenant | — | **impossible** — no `testBoot` recipe; `services: ['apiTs']` is a compile error | — |
| `whatsmeow`, `ClaudeAgentRunner`, `PgDriver`, `GatewayChannelSender`, `RedisRateLimitStore` | — | **no layer** — see §6 | — |

**Seeding rule:** state comes from a `given*`, never from a use case, so that a `CancelX` test does not depend on `CreateX` being correct. Backend catalog: `packages/api/typescript/tests/support/given/` — 16 `givenX` + `GIVEN_MENTION_TAG`, each **declared by its owning context** (`ContextDecl.givens` in `<ctx>/context.ts`; 6 of 11 contexts declare), aggregated into `CONTEXT_GIVENS` (`@contexts.generated`), and locked by a falsifiable rail (`tests/architecture/testing-dts.test.ts`) that fails both an undeclared new name and a removed one. **This is the only given tree with a contract** (§5 F8).

---

## 3. IDENTITY / AUTHENTICATION

One axis (`ownerId`), **four different producers**, and no layer checks that it agrees with its neighbor.

**The real model.** After ADR 0001 (+ Amendment 1, 2026-08-15) the local daemon does not *issue* identity: `src/shared/middlewares/CloudSessionMiddleware.ts` calls `CloudSession.identity()` and stamps `ctx.user` / `session` / `ownerId` (`:69` → `ownerId: identity.session.ownerId`). **53 controllers** declare that middleware in a non-test `middlewares = [...]` array (counted by script; 62 files mention the symbol, the rest are docblocks/barrels), out of 67 controller files. The port has two implementations, bound **per column** (`src/shared/registry.ts:323`):

```
{ mock: MockCloudSession, integration: MockCloudSession, real: FileCloudSession, e2e: FileCloudSession }
```

**Non-obvious and load-bearing: the local daemon's identity is PROCESS-WIDE, not per-request.** No client presents a credential to the daemon. `SetCloudTokenController` (`POST /v1/session/cloud-token`, deliberately without the middleware, because of a bootstrap deadlock) installs **one** credential in the process, and everyone who reaches the port inherits that operator. Only the **cloud** authenticates per request: `AuthAccountMiddleware` → better-auth (`bearer` plugin), mapping `activeOwnerId` → `ownerId` and even healing legacy sessions via `owners.ensureOwnerFor` (`AuthAccountMiddleware.ts:84`).

### Map: "I need identity at layer X → I use Y"

| Layer | Where the owner comes from | Notes / numbers |
|---|---|---|
| L0 unit | nothing | no identity exists |
| L3/L4 TestBed | **you declare it**: `TestBed.create(mode, { testContainer, ownerId })` | No middleware, no `CloudSession`. Givens default to `overrides.ownerId ?? testBed.ownerId` (`given/issues.ts:23`, `threads.ts:40`, `channels.ts:47`); the getter **throws** if undeclared (`TestBed.ts:190-198`). Measured: **96** `TestBed.create` calls, **93** with `ownerId` — 60 use `MOCK_CLOUD_OWNER_ID`, 15 use `'integration-tenant'` (the `pg` family: `auth`/`owner`; **not even a UUID**), 6 use local constants. |
| L5 `startIntegrationBackend()` | **derived by asking the session** (`testing.ts:144-150, 236`) → `MOCK_CLOUD_OWNER_ID` (`33333333-3333-4333-8333-333333333333`) | Column `integration` binds `MockCloudSession` |
| L6 `+ services` | column flips to `e2e` → `FileCloudSession` → **you must pass `identity: 'double'`** | `'double'` does exactly one thing (`testing.ts:206-208`): after `start()` and before any request, `container.registerInstance(CloudSession as never, new MockCloudSession() as never)` in the **root** container. It works because `Controller.executeMiddlewares` resolves the middleware **per request** (`core/src/types/Controller.ts:206`). The hop to Go is **explicit**: `X-Owner-Id: backend.ownerId` (`given/gateway.ts:72-73`) — the gateway never infers the owner. |
| L7 react | `useIntegrationBackend(...)` is pure pass-through (`integration-harness.ts:247-266`) | The 5 `services` suites pass `{ services: ['apiGo'], identity: 'double' }` and **none declares `ownerId`** |
| L8 e2e | worker-scoped `auto: true` fixture `daemonSession` (`packages/e2e/utils/test.ts:47-54`), two hops (`utils/given/daemon-session.ts`) | (1) cloud mints a session at `POST /v1/_test/session` — controller mounted **only** under column `e2e`, writing **directly** to `users` + `sessions` on the pg trunk, opaque token `e2e-<uuid><uuid>`; (2) the token is pushed to the daemon via `POST /v1/session/cloud-token`. From hop 2 on **nothing is short-circuited**: `FileCloudSession` → `GET /v1/session` on the cloud with Bearer → `bearer` plugin → `AuthAccountMiddleware` → `ctx`. What **is** short-circuited is only credential **issuance** (OAuth device-code through the OS browser, `oneTimeToken`, keychain, `useLoopbackAuth`). |
| L8 browser side | a **second, unrelated** credential | `utils/given/cloud.ts` seeds `localStorage['codm.native.secret.codm.cloud.deviceToken'] = 'e2e-fake-device-token'` purely to satisfy the browser's `CloudSessionGate`, which checks **presence** and never validates. |
| Go's own tests | explicit header, local `testOwnerID` | `internal/channel/qr_pairing_test.go:33` |

### The traps

**T1 — declared `ownerId` ≠ stamped `ownerId`, silently.** `testing.ts:236`: `const ownerId = options?.ownerId ?? (await stampedOwnerId())`. The `??` short-circuits: **when the caller declares, the session is never consulted.** The only throw is `ownerId === undefined` (`:237-242`). Meanwhile `CloudSessionMiddleware.ts:69` stamps whatever the bound `CloudSession` says. Under column `integration` that is **always** `MOCK_CLOUD_OWNER_ID`, immune to `options.ownerId`. Nothing compares the two — no given, no rail, no probe. `tests/architecture/cloud-identity.test.ts` (IDN-01..04) is pure unit over the middleware with a hand-injected `MockCloudSession` and never touches `startIntegrationBackend`. The risk exists only as **prose** in two docblocks (`TestBed.ts:178`, `testing.ts:223`), neither of which became code.
- **Failure shape:** positive assertions after a given go loudly **red**. The silent subset is **negative / empty-state assertions** — seed under `tenant-a`, read under `33333333-…`, get nothing, and `not.toContain(...)` passes forever. Reproduced: `SetupChecklist/index.test.tsx` case 1 (`nada feito: os três passos aparecem`) stays green permanently and would stay green if the given seeded wrong, if the checklist filter were deleted, if the projection were never written, or if the endpoint vanished.
- **Also disproven:** the write path does **not** fail loudly on a nonexistent owner — `SetupChecklist/index.test.tsx` calls `addWorkspace({ path })` with no `givenOwner` and passes.
- **Cure, 4 lines in `boot()`:** always compute `const stamped = await stampedOwnerId()` and throw naming both values when `options?.ownerId !== undefined && stamped !== undefined && options.ownerId !== stamped`. The comment at `testing.ts:232-235` that argues against this ("would blow up a caller who declared everything correctly") is **false** — `stampedOwnerId()` has a `try/catch` returning `undefined` (`:144-150`). No current call site is affected: the ~15 react suites omit `ownerId`, and the spike runs under column `e2e` where `stamped` is `undefined`.

**T2 — `services` + `ownerId` without `identity: 'double'`: green boot, armed cloud gate, 503 on every controller.** Reproduced in-process, three probes:
1. `startIntegrationBackend({ services: ['apiGo'], ownerId: '0000…0001' })` — the exact shape of `tests/spikes/cross-service.spike.test.ts:72` — **boots successfully**: `[harness] apiGo ready on http://127.0.0.1:64281`, `BOOT OK`. No warning. Then `GET /v1/ui/home → 503 {"code":"CLOUD_UNREACHABLE"}`, `GET /v1/issues/overview → 503`, `GET /v1/health → 200` (Health is the only route without the middleware).
2. Same boot **with** `identity: 'double'`: `GET /v1/ui/home → 403 ONBOARDING_NOT_COMPLETED`, `GET /v1/issues/overview → 400 VALIDATION_ERROR`. Application-level answers. The option is literally the difference between a usable HTTP harness and universal 503.
3. `services` **without** `ownerId` and without `identity`: boot fails with `startIntegrationBackend: nenhum ownerId foi declarado e a CloudSession montada não soube dizer qual é (…). Passe ownerId nas options (F3/T3).` — **the boot error recommends exactly the fix that installs the mask.** Follow it and you land in state (1).
- Chain: `registry.ts` binds `e2e: FileCloudSession`; `FileCloudSession.identity()` throws `CLOUD_UNREACHABLE` when `!isCloudConfigured()`, which is `Config.env.CLOUD_CONFIGURED = Boolean(data.CODM_CLOUD_URL)` computed **before** the cross-default to `API_URL` (`core/utils/Config.ts:162`); `GlobalErrorMapper.ts:50` maps it to `SERVICE_UNAVAILABLE`.
- **Environment-dependent error code:** with the root `.env` loaded into the process (`CODM_CLOUD_URL=http://localhost:3033`), the same call measures `GET /v1/ui/home → 401 UNAUTHORIZED` (FileCloudSession finds an empty cache in `HARNESS_DATA_DIR`, returns `null`). The code changes; the fact does not.
- Why the existing spike survives: it never speaks HTTP to the TS daemon — it reads through the driver (`db()`) and only calls the gateway (`baseURL: ${gatewayUrl}/api`); `givenConnectedGatewayChannel` likewise.

**T3 — the identity swap only reaches whoever resolves *after* boot.** Measured probe against column `e2e`: `dispatcher.cloudSession BEFORE swap: FileCloudSession` / `container CloudSession AFTER swap: MockCloudSession` / `dispatcher.cloudSession AFTER swap: FileCloudSession` / `same dispatcher instance? true` / `dispatcher.running: true`. The `agent` context **does** mount in the harness (`deployment.ts:153`, `agent: [{ when: { deployment: 'local' } }]`; `criteriaFromEnv` only yields `cloud` under `CODM_PROFILE=cloud`). The binding is a **singleton** (`core/src/types/Registry.ts:44-48` calls `registerSingleton` for class values), so the `LibSqlMailboxDispatcher` constructed inside `start()` (`agent/lifecycle.ts:31`) holds `FileCloudSession` forever. The HTTP side *does* swap (`CloudSessionMiddleware` is `@injectable` and transient, resolved per request), which is why the 4 `.services.test.tsx` suites pass.
- **Today's blast radius, corrected upward:** under `bun run test` **from the repo root**, bun loads the root `.env` and the child inherits `CODM_CLOUD_URL=http://localhost:3033` (measured: `child in react pkg sees: http://localhost:3033`). Then `CLOUD_CONFIGURED=true`, the scratch data dir has no cached credential, and the probe measures `isEntitled(): false` → `drainLoop` returns 0 at `LibSqlMailboxDispatcher.ts:228` **before any `claimNext`**. The background-work gate is **already closed today under the documented command**; nothing breaks only because no `services` suite drives a turn.
- The obvious escape hatch is a **no-op**: `backend.asTestBed().resolve(CloudSession).setEntitled(true)` mutates the Mock while the dispatcher holds the File (measured `after === before`).
- Run the same file from `packages/app/react` and it **passes**, because bun never loads the root `.env` there and `FileCloudSession.ts:151`'s dev-compat `return true` fires. A textbook "passes here, hangs in CI" with no log, no assertion, and no health-check signal — `mailboxDispatcher` reports green because `running: true` means `timer !== null`, not that the gate is open.

**T4 — process-wide credential.** Anyone who reaches the daemon port inherits the operator. There is no per-request credential in the local deployment, by design (ADR 0001).

### Why each harness diverges (all traceable to ADR 0001)
`PLACEMENT` (`deployment.ts:143-144`) removes `auth` and `owner` from the local deployment. Consequences, measured: (a) TestBed needed a `db: 'pg'` axis purely for identity/tenancy suites (`givenActiveSession` writes to `@codm/contracts/db/cloud`); (b) e2e needed a **fourth** server (the cloud daemon on :3134) and a test-only minting seam, because there is no programmatic sign-up path (social providers only); (c) the react component harness inherited column `e2e` without a login mandate — hence `identity: 'double'`; (d) the Go gateway's `Session` middleware now reads a table nobody writes.

---

## 4. MULTI-SERVICE

Three seams exist, and **they do not know about each other.**

### Seam 1 — the recipe runner (`tests/support/testBoot.ts`, 165 lines)
Zero service names, zero `if` on language. `bootService(id, { dataDir })` resolves `REPO.workspaces[id].testBoot` (`template.config.ts:92`), builds once per process (cache is the promise, `builds` Map), asks the OS for a free port via a listener probe, spawns with `{ ...process.env, ...recipe.env, [recipe.binds.port]: port, [recipe.binds.dataDir]: dataDir }`, and polls `recipe.healthPath` until 2xx (30 s deadline, draining stdout/stderr into the error so the failure shows what the child said).

**Measured: `grep -c "testBoot: {" template.config.ts` → 1.** Of 7 workspaces (`apiTs`, `apiGo`, `appReact`, `appAstro`, `contracts`, `client`, `appTauri`), **only `apiGo` declares a recipe**. `TestBootWorkspaceId` (`template.config.ts:212`) is *derived* from the recipes, so **`services: ['apiTs']` is a compile error** — there is no path to raise a second TS process as co-tenant.

Invoked from `startIntegrationBackend({ services })` (`testing.ts:211-219`), which under `services` flips the column to `e2e` because only `e2e` binds `FileLibsqlDriver` (file, not memory) and `SqlExternalMediator` (`shared_outbox` lanes + poller). **The inter-process transport is a single SQLite file in `HARNESS_DATA_DIR`; integration events cross as `shared_outbox` rows, not over a socket.**

### Seam 2 — Playwright (`packages/e2e/playwright.config.ts`)
**Four `webServer` entries** (`grep -c "command:"` → 4), not the three the repo prose still describes:

| # | Line | What | Why |
|---|---|---|---|
| a | :31 | local daemon **from the bundle** — `node dist/server.js` | deliberate: proves the run-under-Node path of the artifact we ship |
| b | :105 | **cloud** daemon **from source** — `bun run ./src` + `CODM_PROFILE=cloud` | same binary, different deployment column; exists because ADR 0001 made `auth`/`owner` cloud-only — without it "10 of 11 specs failed". Runs from source because staging `pglite.wasm` + `pglite.data` (13 MB) into a 20 MB `dist/` is +65 % on every production image; what the bundle-under-cloud loses became a static rail (`tests/architecture/build-output.test.ts:23-27`) |
| c | :124 | Vite (the console) | |
| d | :146 | **prebuilt Go gateway** — `./api` | `go build` per the manifest recipe |

`workers: 1`, measured (14.9 s serial vs ~26 s with contention on the shared SQLite).

### Seam 3 — Go → TS (`packages/api/go/core/db/sqlite/store_test.go:383`)
Spawns the TS migration applier (`bun .../apply-migrations-once.ts`) as a real process, with a filesystem barrier, to prove a modernc `BEGIN IMMEDIATE` and a libsql one interlock over the same file. **The only Go → TS direction that exists**, and it covers the migration ledger, not a live service. Related: `t.Fatalf` (not `t.Skip`) when `bun` is missing — `store_test.go:367`.

### What combines with what

| Combination | Status |
|---|---|
| L4 TestBed + Go gateway | **no** — TestBed has no process supervision |
| L5 + `services: ['apiGo']` | **yes**, and it forces column `e2e` → must add `identity: 'double'` |
| L5 + `services: ['apiTs']` (a second TS process) | **compile error** — no recipe declared |
| L7 react + `services` | **yes**, via pass-through; **must be 1 process per file** (`scripts/test-cross-service.ts`) |
| L8 Playwright + all four servers | **yes**, that is the config |
| `identity: 'double'` + background workers | **no** — the swap misses anything constructed during `start()` (T3) |
| Anything + column `real` | **never happens** — zero occurrences |

### Corrected premise
**The e2e no longer simulates the gateway — it boots it.** `/v1/_test/gateway` (`src/shared/controllers/TestIngressController.ts:73`) still exists and is still used, but as a **background-state given** (CONNECTED channel + inbound injection), complementary to the real gateway, not a substitute. Four committed sites still assert the opposite — the most expensive drift in this dimension, because it describes a topology nobody has run in weeks. *(Which four sites: reported but not enumerated in the input — not measured here.)*

---

## 5. FRAGILITY — confirmed findings only

### F1 — `app-tauri:test` (64 Rust tests) dies in `build.rs`; the prerequisite is undeclared and never satisfied outside the founder's checkout
- `bun x nx show project app-tauri --json` (resolved by Nx, not read from the file): `"test": { executor: "nx:run-commands", cache: true, options: { command: "cargo test --quiet", cwd: "packages/app/tauri/src-tauri" } }` — **no `dependsOn`**. Only `dev` (`project.json:60`) and `bundle` (`:70`) carry `dependsOn: ["sidecars"]`. No implicit inheritance either: `nx.json` `targetDefaults.test` is `{ cache: true, inputs: [...] }`; the only default `dependsOn` is `build`'s `["^build"]`.
- Measured: `cargo test --quiet --manifest-path .../src-tauri/Cargo.toml` → **exit 101**, `failed to run custom build command for 'codm-desktop v0.1.0'`, stdout ending in `` resource path `binaries/codm-daemon-aarch64-apple-darwin` doesn't exist ``. Cause: `tauri.conf.json` `bundle.externalBin: ["binaries/codm-daemon","binaries/codm-gateway"]` + `bundle.resources` (`binaries/migrations`, `binaries/daemon-runtime`), all resolved by `tauri_build::build()` **before any test compiles** — the test profile exempts nothing. `git check-ignore -v` confirms all three paths pinned by `packages/app/tauri/src-tauri/.gitignore:6:/binaries/`. Worktree clean (`git status --porcelain -- packages/app/tauri` → empty): this is HEAD, not local dirt.
- No hidden mitigation: the **only** producers of `sidecars` are `release-beta.yml:95` and `release-stable.yml:66` (`bun config/build-sidecars.ts`) — both release workflows. `correctness.yml` does `bun install --frozen-lockfile` → `cp -n .env.example .env && bun emit-openapi` → `bun run detect` → `bun tsc` → `bun run test`. Nothing materializes `binaries/`. No `.cargo/config.toml` anywhere.
- Count confirmed: `grep -rc '#\[test\]'` → **62 in 11 `src/` files** (updater 12, supervision 9, system_preconditions/mod 8, reaper 7, lifecycle 6, full_disk_access 5, gate 5, api/mod 4, sidecar_log 4, crash 1, commands/mod 1) **+ 2 in `tests/no_raw_http.rs` = 64**.
- **Not "silently skipped" — loudly red.** `nx run-many -t test` *selects* `app-tauri`; the target dies at exit 101 before the first `#[test]`. `.githooks/pre-push:10` has `set -e`, so every push is blocked.
- **It has not bitten yet only because the commit is unpushed:** `git merge-base --is-ancestor 192f8ce9 origin/main` → NO; `git rev-list --left-right --count origin/main...main` → `0 185`. `origin/main` frozen 2026-08-10, last `correctness.yml` run 2026-08-12, target born 2026-08-14 (`192f8ce9`). Its commit body claims "Rodados a mão pela primeira vez: EXIT=0" — true only in a tree that still had ~110 MB of sidecars from an earlier `desktop:dev`/`bundle`. **The lane was born red-from-clean.**
- **Invariant lost without notice:** `tests/no_raw_http.rs` — the rail forbidding raw `reqwest` outside `src/api/mod.rs` — is among the 64. A `reqwest` violation in the desktop shell walks straight through the merge gate.
- **Collateral not previously reported:** `desktop-shell/SKILL.md:73` and `:183` state that `packages/app/tauri/bindings.ts` (tauri-specta) is regenerated **by** `cargo test`. Same missing prerequisite therefore blocks binding regeneration, not just the suite.
- **Fix (one line):** add `"dependsOn": ["sidecars"]` to the `test` target in `packages/app/tauri/project.json`, mirroring `dev` and `bundle`.
- **Blind spot that let it in:** `scripts/test-liveness.test.ts` measures **reach** (is every test file covered by some declared target), not **executability** — and it cites `app-tauri:test` at lines 297 and 350 as proof the crate is no longer orphaned.

### F2 — `app-react:test` is a load-sensitive flake, not a logic failure (refutes "two independent deterministic causes")
`bun test` directly in `packages/app/react`: **3/3 green (267 pass, 0 fail)**. Via `bun x nx run app-react:test`: **2/2 failed, with different test sets each run** (6 fail, then 3 fail). Signatures are temporal: `OnboardingFlow — contra o backend real > concluir` blew **5003.87 ms against a 5000 ms budget**; `tests/spikes/storybook.spike.test.tsx` passes 1/1 in isolation. Wall clock: **15.0–15.4 s under nx vs 6.5 s direct** — nx's output piping roughly doubles runtime and pushes time-budgeted tests past their limit.

### F3 — asymmetric per-process backend cache
`startIntegrationBackend` caches in `booted`; `stop()` clears that cache (`testing.ts:257`). The **next file in the same process reboots the entire daemon** over the same `testDriverSingleton` whose `close()` is a contractual no-op. The react `bunfig.toml` **documents** that this reboot leaves a stale DB handle — and applies the cure (one process per file) **only to the `services` lane**. The default lane performs the same 10 boot→stop cycles in a single process with **no mitigation**.

### F4 — `reset()` is not "clean state"
`TestBed.ts:141-145` does exactly three things: clears two spies and truncates the tables. **It never touches the DI container.** **78 of 96** suites create the TestBed in `beforeAll`, so every in-memory singleton survives while the database under it is zeroed — notably `AgentStreamRegistry`, bound in **all** columns, holding `writers` / `ownerCounts` / `history`. Combined with a **deterministic `testId()`**, that is a real silent cross-case contamination channel inside one file. In `mock` mode the hole is larger: `_resetFn` clears no `Mock*Repository` (all hold `Map`s); it is safe only because flow tests rebuild the child container in `beforeEach` — a property nothing declares and nothing verifies.

### F5 — time and ports
- `beforeAll` hooks that raise the Go co-tenant run under bun's **5000 ms default**, while `bootService` budgets a **30 s health poll after an untimed `go build`**.
- `freePort()` is a textbook TOCTOU: bind `:0` → close → the child rebinds.
- e2e runs `retries: 0`, a fixed owner, and **zero DB reset between specs**.

### F6 — identity (T1, T2, T3 in §3)
All three reproduced in-process, not inferred. T1 is silent on negative assertions; T2 is a green boot with 100 % of gated controllers unusable; T3 already has the background gate closed today under the documented root command.

### F7 — 681 cases (~23.6 %) have no CI gate at all
Only **4 workflows** exist and there is no other CI system (no CircleCI/GitLab/Buildkite/Jenkins; `.github/` contains nothing but the 4 `.yml`). In `correctness.yml`, `grep -c "test:tooling"` → 0 and `grep -c "e2e"` → 0; the three verification steps are `bun run detect` (:45), `bun tsc` (:48), `bun run test` (:51). `release-stable.yml`, `release-beta.yml`, `deploy-landing.yml` invoke no test at all. Reproduced: `bun run test:tooling` → "Ran 726 tests across 57 files"; `playwright test --list` → "Total: 13 tests in 10 files".
- **Number corrected from 739 → 681** (668 tooling + 13 e2e): `tests/architecture/union-parity.test.ts` is declared in **both** `test:tooling` and `api-typescript:project.json#test`, so its 58 cases **do** run in CI.
- Four candidate mitigations, all dead: (1) `.githooks/pre-push` runs only `bun run test` — the same command CI runs; (2) `scripts/detectors/gate-vacuity.ts` does read `.github/workflows/` in CI, but only enforces GV-01/02/03 (pipe discarding exit status, `PIPESTATUS` under zsh, `bun --cwd <dir> run`) — a rail against a **vacuous** gate, not an **absent** one; (3) `app-tauri:test` runs only `cargo test --quiet` (its own `//shape` comment says the bun tests in `config/` "already belong to test:tooling"); (4) `scripts/test-liveness.test.ts` counts `test:tooling` as declared because it is "nameable in CI" (`:298`) — **nameable ≠ named**, and test-liveness lives *inside* `test:tooling`, so it cannot trigger anything.
- **Gate-of-gates scenario:** a PR narrows a glob in `scripts/detectors/registry-scan.ts` so it reports 0 findings and exits 0. `bun run detect` prints "all 7 detectors clean" → green. `bun tsc` → green. `bun run test` → no Nx project roots at `scripts/` (there is no root `project.json`; verified), and `scripts/detectors/registry-scan.test.ts` — which pins the detector against fixtures — lives only in `test:tooling` and `detect:self-test` → green. The rung-2 merge gate becomes a no-op, every subsequent PR passes `detect` for free, and `--update-baseline` freezes the new debt as pre-existing. Author paths that bypass the hook entirely: fork PRs, GitHub web UI, cloud agents, `git commit --no-verify`, platform squash-merges (`core.hooksPath` is set by the `prepare` script during `bun install`).
- Surfaces with **no** gate: the whole `scripts/cli` scaffolder (the CLAUDE.md "first thing to reach for"), `scripts/graph`, the parity gates (taxonomy, sqlc, skill-examples), `.claude/hooks`. And on the e2e side: the 10 specs covering onboarding, QR channel pairing, live SSE, archive/restore, artifact preview run nowhere automated — and since neither release workflow runs a test, **a broken login/onboarding flow gets bundled and signed into a desktop release without anything in the pipeline ever opening the app.**
- **CI is currently broken upstream of the gate:** the last three runs (31390794387, 31565623819, 31565824106) failed at `bun run detect` in 33–45 s, never reaching the test step; and CI has not run on HEAD at all (last run 2026-08-12; HEAD commits are from Aug 14+).

### F8 — three given trees, one contract
- **Backend (contracted):** 16 `givenX` + `GIVEN_MENTION_TAG`, declared per owning context (`ContextDecl.givens`, 6 of 11 contexts), aggregated in `CONTEXT_GIVENS`, railed by `tests/architecture/testing-dts.test.ts` (fails an undeclared new name **and** a removed one). The "repo-direct, never a use case" doctrine holds **11/16**; 4 write raw Drizzle (`givenChannel`, `givenRemote`, `givenRemoteMembership` over `gateway_*` tables TS owns no repository for; `givenActiveSession` over the cloud pg trunk) and 1 goes up over HTTP into the real Go gateway on purpose (`givenConnectedGatewayChannel` — its docblock explains that what matters there is the row's **provenance**, not its shape). **All 5 divergences are documented at the point of divergence.**
- **e2e (uncontracted):** `packages/e2e/utils/given/` exports **15 symbols**, with **zero declaration, zero rail, zero manifest**, and mixes four species in one folder: 4 real `given*` preconditions, 2 stimuli (`injectInboundMessage`, `runIssueTurn` — correctly prefixed by convention but living in the precondition folder), 3 mis-prefixed preconditions (`seedConnectedChannel`, `authenticateDaemon`, `authenticateCloudSession`), 2 HTTP client factories (`apiOperatorSession`, `cloudClient` — they seed nothing), 2 fixture-file writers (`writeSampleWav`, `writeSampleFile`), and 1 dead no-op (`injectSession`). "Givens are never Playwright fixtures" holds only **by accident of naming**: `authenticateDaemon` lives in `given/` and **is** the worker-scoped `daemonSession` fixture (`utils/test.ts:47-54`, `auto: true`) — nothing declared prevents the next one, and `.claude/skills/e2e/SKILL.md` step 6 **instructs** exactly that.
- **The unjustified part is the *extent* of divergence, not the mechanism.** The mechanism divergence (e2e seeds 100 % over HTTP/SDK, no container) is justified and correctly stated by the SKILL. What is not: **the same semantic state is seeded by paths that produce different rows.** "CONNECTED channel" has **four** producers — `givenChannel` (Drizzle, `name='WhatsApp'`, `ownerRemoteId='acct-<id>'`), `TestIngressController` (Drizzle upsert, `name = body.platform = 'WHATSAPP'`, `ownerRemoteId='e2e-account'`), `givenConnectedGatewayChannel` (real Go gateway), and `12-channel-qr.spec.ts` (real gateway through the UI, no helper). `GetOperatorIdentity` reads `ownerRemoteId` **as a JID joined against `gateway_remotes`** — a path e2e cannot exercise, because the seam has no `givenRemote` equivalent. "Thread bound to channel+workspace" has two: `givenThread` (fabricates `mentionTag` from a literal constant) and `givenAttachedThread` (calls the `attachThread` use case and reads the tag back).
- **React adds a fourth vocabulary** (`mockQuery`/`mockMutation`/`mockSession` from `@/storybook`) and — worse — **two competing access paths to the same backend catalog**: 5 files import `givenX` statically from `@codm/api-typescript/testing`, 3 use `loadBackendGivens()`; `bun x tsc --noEmit` in react exits 0 with **both**, falsifying the docblock that claims only the dynamic path is possible.
- **Regression:** the defect `given/identity.ts` claims to have cured (bp-17, `seedAuthUser` duplicated across 8 files) has reappeared as a local `seedSession()` in `BetterAuth.test.ts`.

---

## 6. WHAT IS NOT COVERED — and the declared reason

**The mechanical definition:** coverage is declared **per DI column**, and **no test boots the `real` column** (measured: zero occurrences of `'real'` combined with `start(` / `TestBed.create` / `startIntegrationBackend` across every `*.test.ts`). Therefore, without opinion, the uncovered set is exactly what only exists in `real`:

| Uncovered | Why (declared in a docblock at the site) |
|---|---|
| `whatsapp.NewWhatsmeowChannelFactory` | needs a real phone / WhatsApp pairing |
| `ClaudeAgentRunner` (via `DefaultAgentRunnerFactory`) | needs the provider CLI |
| `PgDriver` | needs a deployed Postgres |
| `GatewayChannelSender` | needs a live channel |
| `RedisRateLimitStore` | needs Redis |

Additional confessed / measured gaps:
- **The only double inside the e2e stack** is the Go `ChannelFactory`: `registry.EnvE2e` → `mock.NewMockChannelFactory(defaultE2eScenario())` (`internal/channel/overlay.go:53`). Everything else in that process — HTTP router, mapper, outbox, handler, projector — is production code.
- **Bundle-under-cloud-profile** is replaced by a static rail (`tests/architecture/build-output.test.ts`) with the price stated in numbers: +13 MB PGlite over a 20 MB `dist/` = +65 % on every production image.
- **Two honest e2e skips**, both pointing at the *same* missing capability: the agent stub has no lifecycle control (it neither raises stop nor holds the session open). Both ship an un-skip recipe.
- **`client` rust `live_smoke`** is `#[ignore]` — requires :3030 and :3032 up.
- **`scripts/skill-evals/seeds/**/*.test.ts`** (4 files) are non-executable **by design** — evaluation specimens, listed as CORPORA at `scripts/test-liveness.test.ts:125`.
- **The big *unconfessed* gap: `app-astro` has no coverage whatsoever** — zero test files, no `test` target in `project.json`, lint scoped to a single directory, no Playwright `webServer` serving astro, and the workspace's own `CLAUDE.md` asserting "Tests assert on the JSON keys" about a test layer that does not exist.
- `app-styles`, `@codm/contracts-typescript`, `@codm/client-typescript`: no `test` target (measured).
- **The repo rejects the silent skip, twice, in writing:** `t.Fatalf` instead of `t.Skip` when `bun` is missing (`core/db/sqlite/store_test.go:367`); `skipWithNoise()` instead of `it.skipIf` (`scripts/sqlc-parity.test.ts:68`).

---

## 7. DRIFT — written doctrine that became false, with the fix

| # | Where | What it says | Reality (measured) | Fix |
|---|---|---|---|---|
| D1 | `CLAUDE.md:333` | "`integration` — driver PGlite" | Default family is **libsql** (`TestBed.ts:117`, `:51`, `:60`) → `LibSqlDriver` in `mkdtemp`. 79 files use `integration`, 13 pass `db: 'pg'` → **~84 % run SQLite** | "`integration` — `LibSqlDriver` (in-process SQLite) by default; `PGliteDriver` only under `db: 'pg'`, required for `auth`/`owner`/cloud `shared` per `PLACEMENT`" |
| D2 | 19 files teach `DrizzleDatabaseDriver` (15 skills + 3 `bun cli` fixtures + 1 seed patch) | it is the type to inject; `.claude/skills/test/typescript/SKILL.md:29` points at `core/src/db/drivers/DrizzleDatabaseDriver.ts` | **Symbol does not exist.** `ls core/src/db/drivers/` → `DatabaseDriver.ts DataDirLock.ts index.ts`. The only code hit is a historical docblock at `DatabaseDriver.ts:38` ("before ADR 0006 there was one level, called `DrizzleDatabaseDriver`"). Real hierarchy (`DatabaseDriver.ts:23-35`): port `DatabaseDriver` → means `LibSqlDatabaseDriver`/`PgDatabaseDriver` → concretes `LibSqlDriver`/`PgDriver`/`PGliteDriver` | Rewrite `SKILL.md:3,20,29,138,145,164,186,611`. **Trap to call out:** guessing the top level type-checks but breaks at runtime — `DatabaseDriver` does **not** expose `db` by contract (`DatabaseDriver.ts:27`), and a repository needs `.db` |
| D3 | `CLAUDE.md:308` | repository tests live at `src/**/Drizzle*Repository.test.ts` | `find . -name "Drizzle*Repository*"` → **zero files**. Real: `LibSql*Repository.test.ts`, `Pg*Repository.test.ts` | update the glob |
| D4 | `CLAUDE.md:336` | `NodePgDriver` is the production driver | `PgDriver.ts:39` says `NodePgDriver` is "from the sibling repo"; `grep -rn "NodePgDriver"` → 1 hit, that comment | replace with `PgDriver` / `LibSqlDriver` per deployment |
| D5 | `CLAUDE.md:314` | "what passes in the test passes in real Postgres" | Directly contradicts `:58` ("there is NO Postgres: persistence is a single SQLite file in `$CODM_DATA_DIR`"). `:314` is unmigrated residue and actively induces pg-only SQL (`jsonb`, `gen_random_uuid()`, pg-shaped `EXCLUDED`/`RETURNING`) that fails at runtime in the ~66 default-family suites | delete `:314`; state the dialect per family and that the **local deployment's production dialect is SQLite** |
| D6 | `CLAUDE.md:305-310` (4-layer table) | four rows, all pointing at api-ts | It answers "what test do I write for this artifact and in which DI mode", which is legitimate — but `startIntegrationBackend` appears **zero times** in the whole file. The second door is undocumented | add an L5/L6 row and the `identity: 'double'` requirement |
| D7 | (frequent oral claim) | "TestBed has 3 modes incl. e2e" | `TestBedMode` is exactly `'mock' \| 'integration'` (`TestBed.ts:55`); `e2e` is a **column**, entered via `start({ env: withServices ? 'e2e' : 'integration' })` (`testing.ts:199`) | keep "2 TestBed modes"; document columns separately from modes |
| D8 | 4 committed sites | "the e2e simulates the Go gateway" | Playwright **boots the real binary** (`webServer` #4, `:146`). `TestIngressController.ts:73` survives as a background-state given, not a substitute | rewrite the 4 sites *(their identities were reported but not enumerated in the input — not measured here)* |
| D9 | `CLAUDE.md:384` | the pre-commit hook "already runs `lint-staged` (biome + eslint) on staged files" | The hook **also** runs the api-typescript tests, `test:tooling`, `tsc` and `build`. The manual doesn't merely omit the gate — it positively states something that makes the reader conclude the hook is lint-only. `docs/AGENTIC_CODING.md:471` already lists "bypassing the pre-commit hook without explicit authorization" as a known temptation | describe what the hook actually runs |
| D10 | `CLAUDE.md` `## Commands` (lines 83-128) | — | `grep -n "test:tooling\|detect:self-test" CLAUDE.md` → **exit 1, zero hits**. `detect:self-test` has zero references anywhere in the repo outside `package.json` (grepped `docs/`, `.claude/`, `.specs/`, `.plans/`, README, CONTEXT) | add `bun run test:tooling` to `## Commands`; add it to `correctness.yml`; delete or document `detect:self-test` |
| D11 | `.claude/skills/e2e/SKILL.md` | cites 8 `given*` names; describes a `given.freshUser()` fixture API | **1 of the 8 exists**; `given.freshUser()` never existed. Step 6 mandates the pattern that turned `authenticateDaemon` into a fixture inside `given/` | regenerate from the real 15 exports; split the folder by species (precondition / stimulus / client / fixture-file) and add a declaration + rail mirroring `testing-dts.test.ts` |
| D12 | `.claude/skills/test/typescript/SKILL.md` | cites `givenPatient`, `givenClinicWithOwner`, `givenFcmRegistrationToken`, `givenEvent` | **0 implementations each**; the SKILL also omits **5 of the 16 real** helpers | regenerate from `CONTEXT_GIVENS` |
| D13 | `.claude/skills/desktop-shell/SKILL.md:73,:183` | `bindings.ts` (tauri-specta) is regenerated **by** `cargo test` | `cargo test` exits 101 in any clean tree (F1), so binding regeneration is blocked too | fix F1 first; then the doc becomes true again |
| D14 | `CLAUDE.md:78` | "for TS tests the database runs in-process (PGlite)" | "in-process" is right (LibSqlDriver is embedded SQLite, no Docker); the engine parenthetical is wrong | swap the parenthetical |
| D15 | assorted | "`bun run test` covers 2 of 8 projects" | Nx runs **7** projects (8 declare `test`, `e2e` is excluded). `app-tauri:test` = `cargo test --quiet`, `client:test` = `bun test lib && cargo test`, `@codm/contracts:test` = `bun test codegen/ catalog/ && test:rust && test:go` — the `//shape` comment at `packages/app/tauri/project.json:25` documents that `nx run-many -t test` "has been invoking cargo and go all along" | state 7 |

**Doctrine that is NOT drift** (checked, do not "fix"): react's 275 cases have their own 4-layer taxonomy at `docs/FRONTEND.md:529-581` (visual Story / `play` Story under bun test / colocated / e2e), routed to by `CLAUDE.md:27`; go's 309 have `.claude/skills/test/go/SKILL.md` (399 lines), delegated at `CLAUDE.md:366`; the 201 architecture rails have `packages/api/typescript/tests/architecture/README.md` (13-rail table + rung ladder) and are named at `CLAUDE.md:42`; the 13 Playwright cases are covered by the Workspaces table, `bun e2e` in Commands, and the `e2e` skill. The orphan-lane failure mode is already eliminated mechanically by `scripts/test-liveness.test.ts` (polyglot rail — ts/go/rust, module-aware for `go -C` and cargo crates — with living corpora/exemptions and a negative fixture in three languages). **What genuinely has no documented path at all is `test:tooling`** (§5 F7).

---

## Not measured / out of scope of this synthesis

- Per-layer wall-clock cost beyond the four anchors quoted (LibSql repo suite 537 ms; react 15.0–15.4 s under nx vs 6.5 s direct; e2e 14.9 s serial vs ~26 s parallel; boot health-poll budget 30 s).
- The identities of the **four committed sites** that still claim the e2e simulates the gateway (D8) — reported as a count, not enumerated.
- Line-level coverage percentages for any runner — no coverage tooling appeared anywhere in the input.
- Whether `app-astro` has any *intended* test design — only its absence was measured.
- Flake rate of `app-react:test` beyond the 2 nx runs + 3 direct runs observed.