# SPEC-17: Drop `GoSyncWorkerClient`; use `@template/client-typescript/go` SDK

**Wave:** 6   **Stream:** C (parallel)   **Depends on:** Wave 5 complete   **Status:** done

## Motivation

`packages/api/typescript/src/integration/services/GoSyncWorkerClient/` contains hand-written HTTP code that calls the Go worker's REST endpoints:
- `GoSyncWorkerClient.ts` — interface
- `HttpGoSyncWorkerClient.ts` — concrete HTTP impl
- `MockGoSyncWorkerClient.ts` — test mock
- `index.ts` — barrel

Meanwhile, the monorepo already generates a typed Go-backend SDK at `@template/client-typescript/go` (via Kubb + oapi-codegen from the Go worker's OpenAPI). The hand-written client duplicates what the SDK provides and drifts when the Go worker's endpoints change.

Swap to the SDK; delete the hand-written client.

## Scope

### Verify the generated SDK has the operations

Before deleting anything, confirm `@template/client-typescript/go` exposes the operations `HttpGoSyncWorkerClient` currently consumes:

```bash
ls packages/client/dist/typescript/src/go/client/
# Check that the operations match what HttpGoSyncWorkerClient calls
```

If the Go worker's OpenAPI doesn't expose an endpoint the TS API depends on, fix the Go side first (add the endpoint to a `controllers/` file in the go-api). Then regenerate: `bun emit-openapi && bun sdk`.

### Replace import sites

Two known consumer files (from prior grep):
- `packages/api/typescript/src/integration/usecases/TriggerReintegration.ts`
- `packages/api/typescript/src/marketing/usecases/ReconcileMarketingAccounts.ts`

For each:
1. Replace `import { GoSyncWorkerClient } from '../services/GoSyncWorkerClient'` with `import { ... } from '@template/client-typescript/go'`.
2. Replace `private readonly client: GoSyncWorkerClient` constructor dep with whatever the SDK exposes (typically a configured client function or a hooks-like factory).
3. Replace `await this.client.triggerReintegration(...)` with the equivalent SDK call.

SDK call shape (verify against the generated code):

```ts
import { triggerReintegration } from '@template/client-typescript/go'
// or per the Kubb-generated client style:
import { createGoSyncClient } from '@template/client-typescript/go'
const goClient = createGoSyncClient({ baseUrl: env.GO_WORKER_URL })
await goClient.triggerReintegration({ storeIntegrationId: ... })
```

### Configure the SDK client

The SDK client needs a base URL (the Go worker's host). Wire via DI:

- Add `GoWorkerHttpClient` token in `integration/registry.ts` registering the configured client.
- Provide via `useFactory` so the URL is read from env at boot time:

```ts
// integration/registry.ts (excerpt)
import { createClient } from '@template/client-typescript/http'

{ token: 'GoWorkerHttpClient', useFactory: () => createClient({ baseUrl: process.env.GO_WORKER_URL }) }
```

Use-case constructors inject the configured client:
```ts
constructor(@inject('GoWorkerHttpClient') private readonly goWorker: GoWorkerHttpClient) { super() }
```

### Delete the hand-written client

Once all import sites are migrated:
- Delete `packages/api/typescript/src/integration/services/GoSyncWorkerClient/` entirely (the whole folder including tests).
- Drop the registration from `integration/registry.ts`.
- Drop any re-exports from `integration/services/index.ts`.

## Affected files

- `packages/api/typescript/src/integration/usecases/TriggerReintegration.ts` — swap to SDK
- `packages/api/typescript/src/integration/usecases/TriggerReintegration.test.ts` — update mocks (SDK functions vs interface methods)
- `packages/api/typescript/src/marketing/usecases/ReconcileMarketingAccounts.ts` — swap to SDK
- `packages/api/typescript/src/marketing/usecases/ReconcileMarketingAccounts.test.ts` — update mocks
- `packages/api/typescript/src/integration/registry.ts` — add SDK-client registration, drop old binding
- `packages/api/typescript/src/integration/services/GoSyncWorkerClient/**` — DELETE folder entirely
- Possibly `packages/api/typescript/src/integration/services/index.ts` — drop re-export

## Acceptance criteria

- [ ] `rg "GoSyncWorkerClient" packages/api/typescript --type ts` returns zero matches.
- [ ] `packages/api/typescript/src/integration/services/GoSyncWorkerClient/` folder doesn't exist.
- [ ] Both consumer use cases (`TriggerReintegration`, `ReconcileMarketingAccounts`) work via the SDK.
- [ ] Tests pass with the new mock pattern.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- Refactoring the Go worker's OpenAPI shape — only stop and fix the Go side if a required endpoint is missing.
- Migrating to the SDK from other locations (e.g. if some other TS code uses the Go SDK indirectly). Audit broadly but only touch what blocks the deletion.
- Frontend code consuming the Go SDK — already uses `@template/client-typescript/go`; no changes here.

## Notes

- The mock strategy changes: instead of injecting a `MockGoSyncWorkerClient` via the test container, the test sets up an HTTP mock (e.g. with `msw`) that intercepts the SDK's outgoing HTTP calls. The e2e/integration test harness might already have this pattern — verify before reinventing.
- For local development, the `GO_WORKER_URL` env var must be set (typically `http://localhost:3032` per CLAUDE.md). Update `.env.example` if not already there.
- If `TriggerReintegration.test.ts` was passing a mock client into the use case directly (constructor injection), that test path remains valid — just replace the mock with a stub of the SDK's call signature instead of an interface impl. Or rewrite to use `msw`-style HTTP mocking.
