# Event-Driven Sync Trigger (Plan A) — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax for
> tracking. Each Task wraps one observable behavior in an outer RED→GREEN cycle.

**Goal:** Connecting an integration auto-starts a Go backfill sync for it — Go consumes the
`integration.activated` event, exchanges a capability handle for the provider credentials,
and runs the pipelines — with no HTTP push from TS.

**Architecture:** TS publishes an enriched `integration.activated` over Redis Streams carrying
a non-secret `storeIntegrationExternalId` + an opaque, short-lived `credentialHandle`. Go gains
a real inbound Streams consumer (`RedisExternalMediator`), a sync-context handler that
exchanges the handle at a TS internal endpoint (via the generated `template/client-go`), starts
a `SyncJob`, and runs it async. Secrets never ride the bus; the exchange endpoint is S2S-gated
by `INTERNAL_SERVICE_KEY`.

**Tech Stack:** Go (fx, net/http, go-redis, oapi-codegen client), TypeScript (Bun, tsyringe,
Zod, ioredis, Drizzle), TypeSpec contracts, Kubb/oapi-codegen SDK.

**Spec:** .specs/2026-05-26-event-driven-sync-trigger-design.md
**Tasks:** 8
**Estimated minutes:** 380

**Plan B (separate plan, depends on this one):** SSE vertical (`ListenEventsController` +
`EventPayloads`), executor publishing `progress_updated`/`last_sync_updated`, `SyncJob.Progress`
percent, `lastSyncAt` re-add + migration + TS handler, frontend `useServerEvents` + progress UI.
**Out of scope here.**

**Waves & critical path:**
- Wave 0: T1 (contract enrich)
- Wave 1: T2 (Go consumer infra) ∥ T3 (TS exchange) → T4 (TS mint) → T5 (SDK lock) → T6 (Go client)
- Wave 2: T7 (externalId + creds threading) → T8 (the trigger)
- Critical path: T1 → T3 → T5 → T6 → T8 ; T2, T7 feed T8.

---

## Task 1: Activation event carries externalId + credential handle

**Files:**
- Modify: `packages/contracts/wire/events/integration-activated.tsp` — add two fields
- Regen: `packages/contracts/generated/{ts,go}/wire/**`, `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /event, /sdk
**Depends on:** (none)

- [ ] **Step 1: Add the two fields to the wire model**

Modify `packages/contracts/wire/events/integration-activated.tsp` — after the `platform` field,
add:

```tsp
  @doc("Provider-side identifier (e.g. shop domain) so the Go worker can key sync + progress without re-reading the StoreIntegration table.")
  storeIntegrationExternalId: string;

  @doc("Opaque, short-lived capability token. The Go worker exchanges it at the TS internal credential-exchange endpoint for the decrypted provider credentials. The secret never rides the bus; the handle is revocable and TTL-bound.")
  credentialHandle: string;
```

- [ ] **Step 2: Regenerate wire bindings + SDK**

```bash
cd packages/contracts && bun run tsp:compile && bun run codegen:wire && cd ../.. && bun sdk
```

- [ ] **Step 3: Verify both fields landed in the generated bindings**

```bash
grep -n "StoreIntegrationExternalID\|CredentialHandle" packages/contracts/generated/go/wire/events.go
grep -rn "storeIntegrationExternalId\|credentialHandle" packages/contracts/generated/typescript/wire/events
```

Expected: the Go `IntegrationActivatedIntegrationEvent` struct shows both
`StoreIntegrationExternalID string` and `CredentialHandle string`; the TS event class exposes both.

- [ ] **Step 4: Type-check + Go build**

```bash
bun tsc && cd packages/api/go && go build ./... && cd ../../..
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/wire/events/integration-activated.tsp packages/contracts/generated packages/client/dist packages/api/typescript/public/docs/openapi.json
git commit -m "feat(contracts): activation event carries externalId + credentialHandle (Task 1)"
```

---

## Task 2: Go consumes published integration events + outbox runs

The Go `RedisExternalMediator` is publish-only (`Register` no-op, `Start` pings). Give it the
consume side that mirrors the TS `RedisExternalMediator` and the in-memory `MemoryExternalMediator`,
and start both it and the never-started `OutboxDispatcher` on boot.

**Files:**
- Modify: `packages/api/go/core/services/mediator/redis_mediator.go` — handler map + `Register` + `Start` consumer loop + `rawIntegrationEvent`
- Modify: `packages/api/go/core/module.go` — fx lifecycle starting/stopping the consumer + the outbox dispatcher
- Test: `packages/api/go/core/services/mediator/redis_mediator_test.go` — dispatch path (no live Redis)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event, /handler
**Depends on:** (none)

- [ ] **Step 1: Write the failing test for the dispatch path**

Create `packages/api/go/core/services/mediator/redis_mediator_test.go`:

```go
package mediator

import (
	"context"
	"encoding/json"
	"testing"

	"template/core-go/types"
)

type fakeIntegrationHandler struct {
	event   string
	gotName string
	gotJSON []byte
}

func (h *fakeIntegrationHandler) EventName() string { return h.event }
func (h *fakeIntegrationHandler) Handle(_ context.Context, e types.IntegrationEventI) error {
	h.gotName = e.GetEventName()
	if p, ok := e.(interface{ GetPayload() json.RawMessage }); ok {
		h.gotJSON = p.GetPayload()
	}
	return nil
}

func TestRedisExternalMediator_DispatchRoutesToRegisteredHandler(t *testing.T) {
	m := &RedisExternalMediator{handlers: map[string][]IntegrationEventHandler{}}
	h := &fakeIntegrationHandler{event: "integration.shared.integration.activated"}
	m.Register(h)

	raw := []byte(`{"name":"integration.shared.integration.activated","ownerId":"o1","storeIntegrationId":"s1"}`)
	if err := m.dispatchRaw(context.Background(), "integration.shared.integration.activated", raw); err != nil {
		t.Fatalf("dispatchRaw: %v", err)
	}

	if h.gotName != "integration.shared.integration.activated" {
		t.Fatalf("handler not invoked with event name, got %q", h.gotName)
	}
	if string(h.gotJSON) != string(raw) {
		t.Fatalf("handler got wrong payload: %s", h.gotJSON)
	}
}

func TestRedisExternalMediator_DispatchNoHandlerIsNoop(t *testing.T) {
	m := &RedisExternalMediator{handlers: map[string][]IntegrationEventHandler{}}
	if err := m.dispatchRaw(context.Background(), "unknown.event", []byte(`{}`)); err != nil {
		t.Fatalf("expected no error for unregistered event, got %v", err)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/go && go test ./core/services/mediator/ -run TestRedisExternalMediator && cd ../../..
```
Expected: FAIL — `m.handlers` undefined / `m.Register` no-op / `dispatchRaw` undefined.

- [ ] **Step 3: Implement the consume side**

Modify `packages/api/go/core/services/mediator/redis_mediator.go`. Add consumer-group constants
near the existing `streamPrefix`:

```go
const (
	deadSuffix    = ":dead"
	readCount     = 32
	blockMS       = 5000
	maxDeliveries = 5
)
```

Add fields to the struct (after `callbacks`):

```go
	handlers    map[string][]IntegrationEventHandler
	groupID     string
	consumerName string
	stopped     chan struct{}
```

In `NewRedisExternalMediator`, initialize the new fields (read group id from config):

```diff
-	return &RedisExternalMediator{client: redis.NewClient(opts)}, nil
+	return &RedisExternalMediator{
+		client:       redis.NewClient(opts),
+		handlers:     make(map[string][]IntegrationEventHandler),
+		groupID:      cfg.EventGroupID,
+		consumerName: fmt.Sprintf("%s-%d", cfg.EventGroupID, os.Getpid()),
+		stopped:      make(chan struct{}),
+	}, nil
```

(add `"os"` to imports.) Replace the no-op `Register`:

```go
func (m *RedisExternalMediator) Register(h IntegrationEventHandler) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.handlers[h.EventName()] = append(m.handlers[h.EventName()], h)
	slog.Info("redis: registered integration handler", "event", h.EventName())
}
```

Replace `Start` (publish-only) with a consumer that creates a group per registered stream and
runs an XREADGROUP loop — drain pending (`0`) then live (`>`), `XACK` on success, dead-letter
after `maxDeliveries`:

```go
func (m *RedisExternalMediator) Start(ctx context.Context) error {
	if err := m.client.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis ping: %w", err)
	}
	m.mu.RLock()
	streams := make([]string, 0, len(m.handlers))
	for name := range m.handlers {
		streams = append(streams, streamPrefix+name)
	}
	m.mu.RUnlock()
	if len(streams) == 0 {
		slog.Info("redis: no integration handlers registered, consumer idle")
		return nil
	}
	for _, s := range streams {
		// MKSTREAM creates the stream if absent; BUSYGROUP means it already exists.
		if err := m.client.XGroupCreateMkStream(ctx, s, m.groupID, "$").Err(); err != nil &&
			!strings.Contains(err.Error(), "BUSYGROUP") {
			slog.Warn("redis: XGROUP CREATE failed", "stream", s, "error", err)
		}
	}
	go m.runReadLoop(streams)
	slog.Info("redis: external mediator consuming", "streams", len(streams), "group", m.groupID)
	return nil
}

func (m *RedisExternalMediator) runReadLoop(streams []string) {
	draining := true
	for {
		select {
		case <-m.stopped:
			return
		default:
		}
		ids := make([]string, len(streams))
		for i := range streams {
			if draining {
				ids[i] = "0"
			} else {
				ids[i] = ">"
			}
		}
		args := append(append([]string{}, streams...), ids...)
		res, err := m.client.XReadGroup(context.Background(), &redis.XReadGroupArgs{
			Group:    m.groupID,
			Consumer: m.consumerName,
			Streams:  args,
			Count:    readCount,
			Block:    blockMS * time.Millisecond,
		}).Result()
		if err != nil {
			if err == redis.Nil {
				draining = false
				continue
			}
			select {
			case <-m.stopped:
				return
			default:
			}
			slog.Error("redis: XREADGROUP failed", "error", err)
			time.Sleep(time.Second)
			continue
		}
		sawAny := false
		for _, stream := range res {
			eventName := strings.TrimPrefix(stream.Stream, streamPrefix)
			for _, msg := range stream.Messages {
				sawAny = true
				m.processEntry(stream.Stream, eventName, msg)
			}
		}
		if draining && !sawAny {
			draining = false
		}
	}
}

func (m *RedisExternalMediator) processEntry(stream, eventName string, msg redis.XMessage) {
	data, _ := msg.Values["data"].(string)
	if data == "" {
		_ = m.client.XAck(context.Background(), stream, m.groupID, msg.ID).Err()
		return
	}
	if err := m.dispatchRaw(context.Background(), eventName, []byte(data)); err != nil {
		count, _ := m.deliveryCount(stream, msg.ID)
		if count >= maxDeliveries {
			m.client.XAdd(context.Background(), &redis.XAddArgs{
				Stream: stream + deadSuffix, MaxLen: maxStreamLen, Approx: true,
				Values: map[string]any{"data": data, "reason": err.Error(), "originalId": msg.ID},
			})
			_ = m.client.XAck(context.Background(), stream, m.groupID, msg.ID).Err()
		}
		return // leave unacked for redelivery on next draining pass
	}
	_ = m.client.XAck(context.Background(), stream, m.groupID, msg.ID).Err()
}

func (m *RedisExternalMediator) deliveryCount(stream, id string) (int64, error) {
	pending, err := m.client.XPendingExt(context.Background(), &redis.XPendingExtArgs{
		Stream: stream, Group: m.groupID, Start: id, End: id, Count: 1,
	}).Result()
	if err != nil || len(pending) == 0 {
		return 0, err
	}
	return pending[0].RetryCount, nil
}

// dispatchRaw routes a decoded stream entry to all handlers registered for eventName.
// The mediator stays generic — it wraps the raw JSON in a rawIntegrationEvent and lets
// the handler (which owns the wire types) decode the concrete payload.
func (m *RedisExternalMediator) dispatchRaw(ctx context.Context, eventName string, raw []byte) error {
	m.mu.RLock()
	handlers := m.handlers[eventName]
	m.mu.RUnlock()
	evt := &rawIntegrationEvent{name: eventName, raw: raw}
	for _, h := range handlers {
		if err := h.Handle(ctx, evt); err != nil {
			return err
		}
	}
	return nil
}
```

Add the `rawIntegrationEvent` type (mirrors the outbox's `rawDomainEvent`) at the bottom of the file:

```go
// rawIntegrationEvent is a generic IntegrationEventI built from a stream entry.
// GetPayload returns the full (flat) wire JSON so a handler can decode it via
// the generated wire.UnmarshalIntegrationEvent.
type rawIntegrationEvent struct {
	name string
	raw  json.RawMessage
}

func (e *rawIntegrationEvent) GetEventName() string        { return e.name }
func (e *rawIntegrationEvent) GetOwnerID() string          { return "" }
func (e *rawIntegrationEvent) GetPayload() json.RawMessage { return e.raw }

var _ types.IntegrationEventI = (*rawIntegrationEvent)(nil)
```

Update `Stop` to signal the loop:

```diff
 func (m *RedisExternalMediator) Stop(_ context.Context) error {
+	close(m.stopped)
 	if err := m.client.Close(); err != nil {
```

Add imports as needed: `"strings"`, `"time"`, `"os"`.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/api/go && go test ./core/services/mediator/ -run TestRedisExternalMediator && cd ../../..
```
Expected: PASS — 2 tests.

- [ ] **Step 5: Start the consumer + outbox dispatcher on boot**

Modify `packages/api/go/core/module.go` — add an `fx.Invoke` lifecycle hook after
`fx.Invoke(registerMiddlewares)`:

```go
	fx.Invoke(func(lc fx.Lifecycle, em mediator.ExternalMediator, ob *outbox.OutboxDispatcher) {
		lc.Append(fx.Hook{
			OnStart: func(ctx context.Context) error {
				if err := em.Start(ctx); err != nil {
					return err
				}
				ob.Start(ctx)
				return nil
			},
			OnStop: func(ctx context.Context) error {
				ob.Stop()
				return em.Stop(ctx)
			},
		})
	}),
```

> Note: `em.Start` is called AFTER all `fx.Invoke` handler registrations (lifecycle OnStart
> runs during `app.Start()`), so every `Register(handler)` is in the map before the consumer
> reads the stream set. `ob.Start`/`ob.Stop` self-manage their context (existing impl).

- [ ] **Step 6: Build + boot smoke**

```bash
cd packages/api/go && go build ./... && cd ../../..
```
Expected: 0 errors. (Outbox dispatcher behavior is covered by its existing tests; this step
only wires its lifecycle.)

- [ ] **Step 7: Commit**

```bash
git add packages/api/go/core/services/mediator/redis_mediator.go \
        packages/api/go/core/services/mediator/redis_mediator_test.go \
        packages/api/go/core/module.go
git commit -m "feat(go-core): inbound integration-event consumer + outbox lifecycle (Task 2)"
```

---

## Task 3: Exchange a credential handle for decrypted credentials

A capability handle resolves to a `storeIntegrationId`; the endpoint opens that integration's
vault secret and returns the plaintext. S2S-gated; not reachable with a session token.

**Files:**
- Create: `packages/api/typescript/src/integration/services/CredentialHandleStore/{CredentialHandleStore,RedisCredentialHandleStore,MockCredentialHandleStore,index}.ts`
- Create: `packages/api/typescript/src/integration/usecases/ExchangeCredentials.ts`
- Create: `packages/api/typescript/src/integration/controllers/ExchangeCredentialsController.ts`
- Create: `packages/api/typescript/src/integration/middlewares/{InternalServiceKey,index}.ts`
- Modify: `packages/api/typescript/core/src/utils/Config.ts` — add `INTERNAL_SERVICE_KEY`
- Modify: `integration/errors/index.ts` — add `CREDENTIAL_HANDLE_INVALID`
- Modify: `integration/{controllers,usecases}/index.ts` — exports
- Modify: `integration/registry.ts` — bind `CredentialHandleStore` (mock/integration/real)
- Test: `packages/api/typescript/src/integration/usecases/ExchangeCredentials.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /usecase, /controller, /middleware, /errors, /schema, /test
**Depends on:** (none)

- [ ] **Step 1: Define the CredentialHandleStore port + impls**

Create `packages/api/typescript/src/integration/services/CredentialHandleStore/CredentialHandleStore.ts`:

```typescript
/**
 * Issues + resolves opaque, short-lived capability handles that map to a
 * StoreIntegration id. The handle (not the secret) rides the activation event;
 * the Go worker exchanges it for the decrypted credentials. Multi-use within TTL
 * so outbox redelivery of the activation event can re-exchange (the RUNNING-job
 * guard prevents duplicate syncs).
 */
export abstract class CredentialHandleStore {
	/** Default handle lifetime — must comfortably exceed outbox delivery latency. */
	static readonly DEFAULT_TTL_SECONDS = 15 * 60

	abstract issue(storeIntegrationId: string): Promise<string>
	abstract resolve(handle: string): Promise<string | undefined>
}
```

Create `RedisCredentialHandleStore.ts`:

```typescript
import IORedis from 'ioredis'
import { randomUUID } from 'node:crypto'
import { injectable } from 'tsyringe-neo'
import { Config } from '@template/core-typescript'
import { CredentialHandleStore } from './CredentialHandleStore'

const KEY_PREFIX = 'cred-handle:'

@injectable()
export class RedisCredentialHandleStore extends CredentialHandleStore {
	private redis = new IORedis(Config.env.REDIS_URL, { maxRetriesPerRequest: null })

	async issue(storeIntegrationId: string): Promise<string> {
		const handle = randomUUID()
		await this.redis.set(KEY_PREFIX + handle, storeIntegrationId, 'EX', CredentialHandleStore.DEFAULT_TTL_SECONDS)
		return handle
	}

	async resolve(handle: string): Promise<string | undefined> {
		const value = await this.redis.get(KEY_PREFIX + handle)
		return value ?? undefined
	}
}
```

Create `MockCredentialHandleStore.ts` (in-memory, used by mock/integration DI):

```typescript
import { randomUUID } from 'node:crypto'
import { CredentialHandleStore } from './CredentialHandleStore'

export class MockCredentialHandleStore extends CredentialHandleStore {
	private map = new Map<string, string>()
	async issue(storeIntegrationId: string): Promise<string> {
		const handle = randomUUID()
		this.map.set(handle, storeIntegrationId)
		return handle
	}
	async resolve(handle: string): Promise<string | undefined> {
		return this.map.get(handle)
	}
}
```

Create `index.ts`:

```typescript
export { CredentialHandleStore } from './CredentialHandleStore'
export { RedisCredentialHandleStore } from './RedisCredentialHandleStore'
export { MockCredentialHandleStore } from './MockCredentialHandleStore'
```

- [ ] **Step 2: Write the failing usecase test**

Create `packages/api/typescript/src/integration/usecases/ExchangeCredentials.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { BaseError, CredentialVault } from '@template/core-typescript'
import { TestBed } from '@test/support'
import { StoreIntegration } from '../entities/StoreIntegration'
import { IntegrationCredentialSecret } from '../entities/IntegrationCredentialSecret'
import { StoreIntegrationRepository } from '../repositories/StoreIntegrationRepository'
import { IntegrationCredentialSecretRepository } from '../repositories/IntegrationCredentialSecretRepository'
import { CredentialHandleStore } from '../services/CredentialHandleStore'
import { ExchangeCredentials } from './ExchangeCredentials'
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'

describe('ExchangeCredentials', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let usecase: ExchangeCredentials
	let handles: CredentialHandleStore

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'tenant' })
		usecase = testBed.resolve(ExchangeCredentials)
		handles = testBed.resolve(CredentialHandleStore)
	})
	beforeEach(async () => { await testBed.reset() })
	afterAll(async () => { await testBed.destroy() })

	async function seedIntegrationWithSecret(creds: Record<string, string>): Promise<string> {
		const repo = testBed.resolve(StoreIntegrationRepository)
		const secretRepo = testBed.resolve(IntegrationCredentialSecretRepository)
		const vault = testBed.resolve(CredentialVault)
		const integration = StoreIntegration.create({
			storeId: '019e4d24-6524-7041-9e1c-8108180cddae',
			platform: { type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.SHOPIFY },
			externalId: 'acme.myshopify.com',
			displayName: 'Acme',
			ownerId: 'tenant',
		})
		const sealed = await vault.seal(creds)
		const secret = IntegrationCredentialSecret.create({ storeIntegrationId: integration.id.value, sealed })
		integration.attachCredentialSecret(secret.id.value)
		await repo.save(integration)
		await secretRepo.save(secret)
		return integration.id.value
	}

	it('returns the decrypted credentials for a valid handle', async () => {
		const integrationId = await seedIntegrationWithSecret({ accessToken: 'shpat_xyz' })
		const handle = await handles.issue(integrationId)

		const out = await usecase.execute({ handle })

		expect(out.credentials).toEqual({ accessToken: 'shpat_xyz' })
	})

	it('throws CREDENTIAL_HANDLE_INVALID for an unknown handle', async () => {
		await expect(usecase.execute({ handle: 'does-not-exist' })).rejects.toThrow(BaseError)
	})
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/integration/usecases/ExchangeCredentials.test.ts; cd ../../..
```
Expected: FAIL — `Cannot find module './ExchangeCredentials'`.

- [ ] **Step 4: Add the error code**

Modify `packages/api/typescript/src/integration/errors/index.ts`:
- Add `'CREDENTIAL_HANDLE_INVALID'` to the `IntegrationApplicationErrors` union.
- In the `registerErrorCodes({...})` call, add: `CREDENTIAL_HANDLE_INVALID: HttpStatusCode.UNAUTHORIZED,`

- [ ] **Step 5: Implement the usecase**

Create `packages/api/typescript/src/integration/usecases/ExchangeCredentials.ts`:

```typescript
import { injectable } from 'tsyringe-neo'
import { BaseError, CredentialVault, Handler, z, type Transaction } from '@template/core-typescript'
import { CredentialHandleStore } from '../services/CredentialHandleStore'
import { IntegrationCredentialSecretRepository } from '../repositories/IntegrationCredentialSecretRepository'
import type { ApplicationErrors } from '../errors'

export const ExchangeCredentialsInputSchema = z.object({
	handle: z.string().min(1),
})

export const ExchangeCredentialsOutputSchema = z.object({
	credentials: z.record(z.string(), z.string()),
})

/**
 * Resolves a capability handle to its StoreIntegration, opens that integration's
 * sealed vault secret, and returns the plaintext. Multi-use within TTL — redelivery
 * of the activation event re-exchanges the same handle. The endpoint exposing this
 * is S2S-gated (InternalServiceKey middleware); the use case trusts the gate.
 */
@injectable()
export class ExchangeCredentials extends Handler<typeof ExchangeCredentialsInputSchema, typeof ExchangeCredentialsOutputSchema> {
	readonly name = 'exchange_credentials' as const
	readonly inputSchema = ExchangeCredentialsInputSchema
	readonly outputSchema = ExchangeCredentialsOutputSchema

	constructor(
		private readonly handles: CredentialHandleStore,
		private readonly credentialSecretRepo: IntegrationCredentialSecretRepository,
		private readonly vault: CredentialVault,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const storeIntegrationId = await this.handles.resolve(input.handle)
		if (storeIntegrationId === undefined) {
			throw new BaseError<ApplicationErrors>('CREDENTIAL_HANDLE_INVALID')
		}
		const secret = await this.credentialSecretRepo.findByStoreIntegrationId(storeIntegrationId, tx)
		if (secret === undefined) {
			throw new BaseError<ApplicationErrors>('STORE_INTEGRATION_CREDENTIAL_NOT_FOUND')
		}
		const credentials = await this.vault.open<Record<string, string>>({
			encryptionAlgorithm: secret.encryptionAlgorithm,
			encryptedPayload: secret.encryptedPayload,
		})
		return { credentials }
	}
}
```

- [ ] **Step 6: Bind the store in the registry**

Modify `packages/api/typescript/src/integration/registry.ts`:
- Import: `import { CredentialHandleStore, RedisCredentialHandleStore, MockCredentialHandleStore } from './services/CredentialHandleStore'`
- In the `mock` and `integration` arrays, add: `{ token: CredentialHandleStore, instance: MockCredentialHandleStore },`
- In the `real` array, add: `{ token: CredentialHandleStore, instance: RedisCredentialHandleStore },`
  (The codebase's `InstanceRegistry` binds classes via the `instance:` field — `useClass` is not supported. See any sibling registry.)

- [ ] **Step 7: Run usecase test to verify it passes**

```bash
cd packages/api/typescript && bun test src/integration/usecases/ExchangeCredentials.test.ts; cd ../../..
```
Expected: PASS — 2 tests.

- [ ] **Step 8: Add the S2S middleware**

Create `packages/api/typescript/src/integration/middlewares/InternalServiceKey.ts`:

```typescript
import { singleton } from 'tsyringe-neo'
import { BaseError, Config } from '@template/core-typescript'
import type { HttpControllerRequest, HttpMiddlewareResponse, Middleware, BaseInterfaceErrors } from '@template/core-typescript'

const HEADER = 'x-internal-service-key'

/**
 * Service-to-service gate. Rejects any request whose `x-internal-service-key`
 * header does not match `INTERNAL_SERVICE_KEY`. Used to keep the credential
 * exchange endpoint reachable only by sibling services (the Go worker), never
 * by browser/session callers — the endpoint still appears in the app SDK but is
 * inert without the key.
 */
@singleton()
export class InternalServiceKey implements Middleware {
	async execute(request: HttpControllerRequest<unknown>): Promise<HttpMiddlewareResponse<void>> {
		const expected = Config.env.INTERNAL_SERVICE_KEY
		const provided = (request.raw.headers as Headers).get(HEADER)
		if (!expected || provided !== expected) {
			throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED', 'invalid or missing internal service key')
		}
		return {}
	}
}
```

Create `packages/api/typescript/src/integration/middlewares/index.ts`:

```typescript
export { InternalServiceKey } from './InternalServiceKey'
```

Modify `packages/api/typescript/core/src/utils/Config.ts` — in the `env` object, after
`GO_WORKER_BASE_URL`, add:

```typescript
		// Shared secret for service-to-service calls (e.g. the Go worker calling
		// the credential-exchange endpoint). Sent as the `x-internal-service-key`
		// header. Empty in dev rejects all S2S calls — set in any env that uses them.
		INTERNAL_SERVICE_KEY: process.env.INTERNAL_SERVICE_KEY ?? '',
```

- [ ] **Step 9: Add the controller**

Create `packages/api/typescript/src/integration/controllers/ExchangeCredentialsController.ts`:

```typescript
import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { InternalServiceKey } from '../middlewares'
import { ExchangeCredentials, ExchangeCredentialsInputSchema, ExchangeCredentialsOutputSchema } from '../usecases/ExchangeCredentials'

export const ExchangeCredentialsControllerInputSchema = z.object({
	body: ExchangeCredentialsInputSchema,
})

export const ExchangeCredentialsControllerOutputSchema = ExchangeCredentialsOutputSchema

/**
 * Internal credential exchange. POST /credentials/exchange.
 * S2S-only (InternalServiceKey). Swaps a capability handle for the decrypted
 * provider credentials so the Go worker can run a sync without the secret ever
 * being placed on the event bus.
 */
@injectable()
export class ExchangeCredentialsController extends Controller<
	typeof ExchangeCredentialsControllerInputSchema,
	typeof ExchangeCredentialsControllerOutputSchema
> {
	readonly path = '/credentials/exchange'
	readonly method = 'post' as const
	readonly description = 'Exchange a credential handle for decrypted provider credentials (service-to-service only)'
	readonly inputSchema = ExchangeCredentialsControllerInputSchema
	readonly outputSchema = ExchangeCredentialsControllerOutputSchema

	override middlewares = [InternalServiceKey]

	constructor(private exchange: ExchangeCredentials) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.exchange.execute({ handle: request.body.handle })
		return { status: HttpStatusCode.OK, data }
	}
}
```

Modify `integration/controllers/index.ts` — add `export { ExchangeCredentialsController } from './ExchangeCredentialsController'`.
Modify `integration/usecases/index.ts` — add `export { ExchangeCredentials } from './ExchangeCredentials'`.

- [ ] **Step 10: Type-check + lint + full integration suite**

```bash
bun tsc && bun lint && cd packages/api/typescript && bun test src/integration/; cd ../../..
```
Expected: 0 errors; integration tests pass.

- [ ] **Step 11: Commit**

```bash
git add packages/api/typescript/src/integration packages/api/typescript/core/src/utils/Config.ts
git commit -m "feat(integration): credential handle store + S2S exchange endpoint (Task 3)"
```

---

## Task 4: Activation mints a handle + publishes the enriched event

**Files:**
- Modify: `packages/api/typescript/src/integration/handlers/IntegrationActivatedHandler.ts` — mint handle + set externalId/handle on the published event
- Test: `packages/api/typescript/src/integration/handlers/IntegrationActivatedHandler.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler, /test
**Depends on:** 1, 3

- [ ] **Step 1: Write the failing test**

Create `packages/api/typescript/src/integration/handlers/IntegrationActivatedHandler.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { ExternalMediator } from '@template/core-typescript'
import { TestBed } from '@test/support'
import { StoreIntegration } from '../entities/StoreIntegration'
import { StoreIntegrationRepository } from '../repositories/StoreIntegrationRepository'
import { CredentialHandleStore } from '../services/CredentialHandleStore'
import { IntegrationActivatedEvent } from '../events'
import { IntegrationActivatedHandler } from './IntegrationActivatedHandler'
import { SalesPlatform, StoreIntegrationType } from '@template/contracts-typescript/wire/enums'

describe('IntegrationActivatedHandler', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let handler: IntegrationActivatedHandler

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'tenant' })
		handler = testBed.resolve(IntegrationActivatedHandler)
	})
	beforeEach(async () => { await testBed.reset() })
	afterAll(async () => { await testBed.destroy() })

	it('publishes an integration event carrying externalId + a resolvable handle', async () => {
		const repo = testBed.resolve(StoreIntegrationRepository)
		const handles = testBed.resolve(CredentialHandleStore)
		const mediator = testBed.resolve(ExternalMediator)
		const published: any[] = []
		mediator.registerCallback(e => published.push(e))

		const integration = StoreIntegration.create({
			storeId: '019e4d24-6524-7041-9e1c-8108180cddae',
			platform: { type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.SHOPIFY },
			externalId: 'acme.myshopify.com',
			displayName: 'Acme',
			ownerId: 'tenant',
		})
		await repo.save(integration)

		await handler.handle(new IntegrationActivatedEvent({
			entityId: integration.id.value,
			ownerId: 'tenant',
			payload: { storeIntegrationId: integration.id.value },
		}))

		expect(published).toHaveLength(1)
		expect(published[0].payload.storeIntegrationExternalId).toBe('acme.myshopify.com')
		const handle = published[0].payload.credentialHandle
		expect(handle).toBeTruthy()
		expect(await handles.resolve(handle)).toBe(integration.id.value)
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/api/typescript && bun test src/integration/handlers/IntegrationActivatedHandler.test.ts; cd ../../..
```
Expected: FAIL — published payload lacks `storeIntegrationExternalId`/`credentialHandle`.

- [ ] **Step 3: Mint the handle + enrich the published event**

Modify `packages/api/typescript/src/integration/handlers/IntegrationActivatedHandler.ts`:
- Add constructor dep: `private readonly handles: CredentialHandleStore` (import from `../services/CredentialHandleStore`).
- In `handle`, after loading `integration` and before publishing, mint the handle:

```typescript
		const credentialHandle = await this.handles.issue(integration.id.value)
```

- Extend the published event payload:

```diff
 			payload: {
 				storeIntegrationId: integration.id.value,
 				storeId: integration.storeId.value,
 				type: integration.type as never,
 				platform: integration.platform,
 				activatedAt: new Date(),
+				storeIntegrationExternalId: integration.externalId,
+				credentialHandle,
 			},
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/api/typescript && bun test src/integration/handlers/IntegrationActivatedHandler.test.ts; cd ../../..
```
Expected: PASS — 1 test.

- [ ] **Step 5: Type-check + lint**

```bash
bun tsc && bun lint
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/typescript/src/integration/handlers/IntegrationActivatedHandler.ts \
        packages/api/typescript/src/integration/handlers/IntegrationActivatedHandler.test.ts
git commit -m "feat(integration): activation mints credential handle + enriches event (Task 4)"
```

---

## Task 5: Contract Lock — SDK regen for the exchange endpoint

**Files:**
- Regen: `packages/api/typescript/public/docs/openapi.json`, `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** 3

- [ ] **Step 1: Regenerate OpenAPI + SDK**

```bash
bun emit-openapi && bun sdk
```

- [ ] **Step 2: Verify the operation reached both clients**

```bash
grep -rn "exchangeCredentials\|ExchangeCredentials\|credentials/exchange" packages/client/dist/go/pkg/typescript packages/client/dist/typescript/src/typescript | head
```
Expected: the Go `typescript` client exposes an `ExchangeCredentials` operation; the TS client/types include it.

- [ ] **Step 3: Type-check after regen**

```bash
bun tsc
```
Expected: 0 errors across workspaces.

- [ ] **Step 4: Commit**

```bash
git add packages/api/typescript/public/docs/openapi.json packages/client/dist
git commit -m "chore(sdk): regenerate openapi+sdk for credential exchange (Task 5)"
```

---

## Task 6: Go can call the TS credential-exchange endpoint

Wire the generated `template/client-go` into the Go service and provide an aggregate client that
attaches the `x-internal-service-key` header on every request.

**Files:**
- Modify: `packages/api/go/go.mod` — require + replace `template/client-go`
- Modify: `packages/api/go/core/config/config.go` — add `InternalServiceKey` + `TypescriptAPIURL`
- Create: `packages/api/go/core/services/tsclient/provider.go` — fx provider + header RoundTripper
- Test: `packages/api/go/core/services/tsclient/provider_test.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service
**Depends on:** 5

- [ ] **Step 1: Add config fields**

Modify `packages/api/go/core/config/config.go`:
- In `Config` struct add: `InternalServiceKey string` and `TypescriptAPIURL string `validate:"required"``
- In `Load()` add: `InternalServiceKey: getEnvOrDefault("INTERNAL_SERVICE_KEY", ""),` and
  `TypescriptAPIURL: getEnvOrDefault("API_URL", "http://localhost:3030"),`

- [ ] **Step 2: Add module require/replace**

Modify `packages/api/go/go.mod`:
- Add under the existing replaces: `replace template/client-go => ../../client/dist/go`
- Add `template/client-go v0.0.0` to the `require (...)` block.

Then sync:

```bash
cd packages/api/go && go mod tidy && cd ../../..
```

- [ ] **Step 3: Write the failing test (header injection)**

Create `packages/api/go/core/services/tsclient/provider_test.go`:

```go
package tsclient

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestServiceKeyTransport_InjectsHeader(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("x-internal-service-key")
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	hc := &http.Client{Transport: &serviceKeyTransport{key: "secret-123", base: http.DefaultTransport}}
	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	if _, err := hc.Do(req); err != nil {
		t.Fatalf("request: %v", err)
	}
	if got != "secret-123" {
		t.Fatalf("header not injected, got %q", got)
	}
}
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd packages/api/go && go test ./core/services/tsclient/ 2>&1 | head; cd ../../..
```
Expected: FAIL — package/`serviceKeyTransport` undefined.

- [ ] **Step 5: Implement the provider**

Create `packages/api/go/core/services/tsclient/provider.go`:

```go
// Package tsclient provides the generated Go→TS API client, wired with the
// service-to-service auth header. Reusable for any future Go→TS call.
package tsclient

import (
	"net/http"

	tsclientgen "template/client-go/pkg/client"
	"template/core-go/config"
)

// serviceKeyTransport injects the shared S2S key header on every outbound request.
type serviceKeyTransport struct {
	key  string
	base http.RoundTripper
}

func (t *serviceKeyTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if t.key != "" {
		req.Header.Set("x-internal-service-key", t.key)
	}
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(req)
}

// NewClient builds the aggregate generated client pointed at the TS API, with
// the S2S key attached. fx provides it for any consumer (e.g. the sync trigger).
func NewClient(cfg *config.Config) (*tsclientgen.Client, error) {
	hc := &http.Client{Transport: &serviceKeyTransport{key: cfg.InternalServiceKey, base: http.DefaultTransport}}
	return tsclientgen.New(tsclientgen.Config{
		TypescriptURL: cfg.TypescriptAPIURL,
		HTTPClient:    hc,
	})
}
```

> Note: confirm the aggregate package path during build — the generated aggregate lives at
> `template/client-go/pkg/client` (`client.New(client.Config{...}) (*client.Client, error)` with
> a `Typescript *ClientWithResponses` field, per `packages/client/dist/go/pkg/client/client.go`).

- [ ] **Step 6: Provide it in the shared fx module**

Modify `packages/api/go/core/module.go` — add to the `Module` provides:

```go
	fx.Provide(tsclient.NewClient),
```

(import `"template/core-go/services/tsclient"`).

- [ ] **Step 7: Run test + build**

```bash
cd packages/api/go && go test ./core/services/tsclient/ && go build ./... && cd ../../..
```
Expected: PASS; build clean.

- [ ] **Step 8: Commit**

```bash
git add packages/api/go/go.mod packages/api/go/go.sum packages/api/go/core/config/config.go \
        packages/api/go/core/services/tsclient packages/api/go/core/module.go
git commit -m "feat(go-core): wire generated TS client with S2S auth header (Task 6)"
```

---

## Task 7: SyncJob carries the provider externalId + credentials reach the pipeline

Thread `storeIntegrationExternalId` onto the job (new column) and pass credentials into the
executor so pipelines can authenticate. This also un-drops the `credentials`/`externalId` the
back-compat `/sync` controller already receives.

**Files:**
- Modify: `packages/contracts/db/schema/sync.ts` — add `storeIntegrationExternalId` column
- Migration: generated by `bun migrate:create` (Drizzle)
- Modify: `packages/api/go/internal/sync/entities/sync_job.go` — field + params
- Modify: `packages/api/go/internal/sync/repositories/syncjob/syncjob_pg.go` — column in upsert/select/scan
- Modify: `packages/api/go/internal/sync/usecases/start_sync.go` — input + mapping
- Modify: `packages/api/go/internal/sync/services/executor/executor.go` — `Execute`/`ExecuteAsync` accept creds; populate `RunInput`
- Modify: `packages/api/go/internal/sync/usecases/{execute_sync,async_execute_sync}.go` — thread creds
- Modify: `packages/api/go/internal/sync/controllers/{sync_controller,start_sync,execute_sync,async_execute_sync}.go` — pass externalId/creds
- Test: `sync_job_test.go`, `syncjob_pg_test.go`, `executor_test.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /repository, /db-modelling, /migrate, /usecase, /test
**Depends on:** (none)

- [ ] **Step 1: Add the Drizzle column + migrate**

Modify `packages/contracts/db/schema/sync.ts` — on the `sync_jobs` table add (nullable, since
existing rows predate it):

```typescript
	storeIntegrationExternalId: text('store_integration_external_id'),
```

Generate + apply:

```bash
bun migrate:create && bun migrate:dev
```
Expected: a new `packages/contracts/db/migrations/NNNN_*.sql` adds the column.

- [ ] **Step 2: Write the failing entity + repo round-trip test**

Add to `packages/api/go/internal/sync/repositories/syncjob/syncjob_pg_test.go` (uses the file's
existing DB harness):

```go
func TestPgSyncJobRepository_PersistsExternalID(t *testing.T) {
	repo, cleanup := newTestRepo(t) // existing helper in this test file
	defer cleanup()

	job, err := entities.NewSyncJob(entities.NewSyncJobParams{
		StoreID:                    objects.MustID(),
		StoreIntegrationID:         objects.MustID(),
		StoreIntegrationExternalID: "acme.myshopify.com",
		Platform:                   "SHOPIFY",
		Pipelines:                  []enums.SyncPipelineName{enums.SyncPipelineOrders},
	})
	if err != nil {
		t.Fatalf("NewSyncJob: %v", err)
	}
	if err := repo.Save(context.Background(), job); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := repo.FindByID(context.Background(), job.ID)
	if err != nil {
		t.Fatalf("FindByID: %v", err)
	}
	if got.StoreIntegrationExternalID != "acme.myshopify.com" {
		t.Fatalf("externalId not persisted, got %q", got.StoreIntegrationExternalID)
	}
}
```

> If `newTestRepo`/`objects.MustID` names differ, match the helpers already used in
> `syncjob_pg_test.go` — do not introduce new harness.

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/api/go && go test ./internal/sync/repositories/syncjob/ -run PersistsExternalID 2>&1 | head; cd ../../..
```
Expected: FAIL — `StoreIntegrationExternalID` field/param undefined.

- [ ] **Step 4: Add the field through the entity**

Modify `packages/api/go/internal/sync/entities/sync_job.go`:
- Add `StoreIntegrationExternalID string` to `SyncJob`, `NewSyncJobParams`, `ReconstructSyncJobParams`.
- In `NewSyncJob` and `Reconstruct`, set `StoreIntegrationExternalID: p.StoreIntegrationExternalID`.

- [ ] **Step 5: Persist + read the column**

Modify `packages/api/go/internal/sync/repositories/syncjob/syncjob_pg.go`:
- `upsertSQL`: add `store_integration_external_id` to the column list and a new `$15` value; add
  it to the `ON CONFLICT DO UPDATE SET` list.
- `selectCols`: add `store_integration_external_id`.
- `Save`: append `j.StoreIntegrationExternalID` to the exec args (matching the new `$15`).
- `scanInto`: add a `var extID sql.NullString`, include `&extID` in the `Scan` call (in column
  order), and set `StoreIntegrationExternalID: extID.String` in the `Reconstruct` call.

- [ ] **Step 6: Thread externalId through StartSync**

Modify `packages/api/go/internal/sync/usecases/start_sync.go`:
- Add `StoreIntegrationExternalID string` to `StartSyncInput`.
- Pass it into `entities.NewSyncJob(entities.NewSyncJobParams{ ..., StoreIntegrationExternalID: in.StoreIntegrationExternalID })`.

- [ ] **Step 7: Thread credentials into the executor + RunInput**

Modify `packages/api/go/internal/sync/services/executor/executor.go`:
- Change `Execute(ctx, jobID string)` → `Execute(ctx context.Context, jobID string, creds map[string]string)`.
- Change `ExecuteAsync(ctx, jobID string)` → `ExecuteAsync(ctx context.Context, jobID string, creds map[string]string)`.
- Change `runPipelines` to accept `creds` and build:

```go
	in := pipelines.RunInput{
		StoreID:                    job.StoreID.String(),
		StoreIntegrationID:         job.StoreIntegrationID.String(),
		StoreIntegrationExternalID: job.StoreIntegrationExternalID,
		Credentials:                creds,
	}
```

Modify `packages/api/go/internal/sync/usecases/execute_sync.go` + `async_execute_sync.go`:
- Add `Credentials map[string]string` to their `*Input` structs and pass through to the executor.
- Update the `AsyncExecutor` interface signature to `ExecuteAsync(ctx context.Context, jobID string, creds map[string]string) error`.

Modify the four controllers to pass `req.Credentials` through:
- `sync_controller.go`: pass `req.Credentials` into the (now creds-aware) ExecuteSync call and
  `req.StoreIntegrationExternalID` into `StartSyncInput`.
- `start_sync.go`: add `StoreIntegrationExternalID` to `StartSyncRequest` (`from:"body"`) and pass through.
- `execute_sync.go` / `async_execute_sync.go`: accept optional `credentials` in the request body
  and pass through.

- [ ] **Step 8: Update existing executor test for the new signature**

Modify `packages/api/go/internal/sync/services/executor/executor_test.go` — update `Execute`/
`ExecuteAsync` call sites to pass a `creds` map (e.g. `map[string]string{"accessToken":"t"}`),
and assert the mock Shopify pipeline received it via `RunInput.Credentials` (extend the existing
fake pipeline to capture `in.Credentials`). Keep the existing COMPLETED-state assertions.

- [ ] **Step 9: Run sync tests + build**

```bash
cd packages/api/go && go test ./internal/sync/... && go build ./... && cd ../../..
```
Expected: PASS; build clean.

- [ ] **Step 10: Commit**

```bash
git add packages/contracts/db packages/api/go/internal/sync
git commit -m "feat(sync): thread provider externalId + credentials through execution (Task 7)"
```

---

## Task 8: Connecting an integration auto-starts a sync

The headline behavior. A Go `IntegrationEventHandler` consumes `integration.activated`, resolves
the pipelines for `(type, platform)`, exchanges the handle for credentials via the generated TS
client, starts a `SyncJob`, and runs it async.

**Files:**
- Create: `packages/api/go/internal/sync/services/pipelineresolver/resolver.go`
- Create: `packages/api/go/internal/sync/services/credentials/exchanger.go` — `CredentialExchanger` port + client-backed impl
- Create: `packages/api/go/internal/sync/handlers/integration_activated_handler.go`
- Modify: `packages/api/go/internal/sync/module.go` — provide handler/resolver/exchanger; register handler with `ExternalMediator`
- Test: `packages/api/go/internal/sync/handlers/integration_activated_handler_test.go`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler, /service, /test
**Depends on:** 1, 2, 6, 7

- [ ] **Step 1: Implement the pipeline resolver (pure, unit-testable)**

Create `packages/api/go/internal/sync/services/pipelineresolver/resolver.go`:

```go
// Package pipelineresolver maps a (StoreIntegrationType, platform) pair to the
// set of sync pipelines to run — the resolvePipelines analogue from the legacy
// NewWorker handler.
package pipelineresolver

import (
	"template/api-go/internal/sync/enums"
	"template/contracts-go/wire"
)

// Resolve returns the pipelines for the integration's category. Unknown types
// return nil (the handler treats that as "nothing to sync" and no-ops).
func Resolve(t wire.StoreIntegrationType) []enums.SyncPipelineName {
	switch t {
	case wire.StoreIntegrationTypeSALES_CHANNEL:
		return []enums.SyncPipelineName{enums.SyncPipelineOrders, enums.SyncPipelineProducts, enums.SyncPipelineProductVariants}
	case wire.StoreIntegrationTypePAYMENT_GATEWAY:
		return []enums.SyncPipelineName{enums.SyncPipelineTransactions, enums.SyncPipelineDisputes}
	case wire.StoreIntegrationTypeMARKETING_PLATFORM:
		return []enums.SyncPipelineName{enums.SyncPipelineMarketingMetricsConcurrent, enums.SyncPipelineCampaigns}
	default:
		return nil
	}
}
```

> Confirm the exact `wire.StoreIntegrationType*` constant identifiers during build (generated
> from `store-integration-type.tsp`); adjust casing if the codegen differs.

- [ ] **Step 2: Define the CredentialExchanger port + client-backed impl**

Create `packages/api/go/internal/sync/services/credentials/exchanger.go`:

```go
// Package credentials exchanges a capability handle for decrypted provider
// credentials by calling the TS credential-exchange endpoint via the generated client.
package credentials

import (
	"context"
	"fmt"

	tsclient "template/client-go/pkg/typescript"
)

// Exchanger swaps a handle for credentials. An interface so the trigger handler
// is unit-testable with a stub.
type Exchanger interface {
	Exchange(ctx context.Context, handle string) (map[string]string, error)
}

// NOTE: the aggregate pkg/client is unusable (pre-existing codegen bug in pkg/go),
// so we use the pkg/typescript sub-client directly — which is exactly what the
// core tsclient.NewClient provider returns (*typescript.ClientWithResponses).
type clientExchanger struct {
	client *tsclient.ClientWithResponses
}

func NewClientExchanger(client *tsclient.ClientWithResponses) Exchanger {
	return &clientExchanger{client: client}
}

func (e *clientExchanger) Exchange(ctx context.Context, handle string) (map[string]string, error) {
	resp, err := e.client.ExchangeCredentialsWithResponse(ctx, tsclient.ExchangeCredentialsJSONRequestBody{
		Handle: handle,
	})
	if err != nil {
		return nil, fmt.Errorf("exchange credentials: %w", err)
	}
	if resp.JSON200 == nil {
		return nil, fmt.Errorf("exchange credentials: unexpected status %d", resp.StatusCode())
	}
	return resp.JSON200.Credentials, nil
}
```

> The exact generated method/type names (`ExchangeCredentialsWithResponse`,
> `ExchangeCredentialsJSONRequestBody`, `JSON200.Credentials`) come from oapi-codegen — confirm
> against `packages/client/dist/go/pkg/typescript/client.gen.go` after Task 5 and adjust.

- [ ] **Step 3: Write the failing handler test**

Create `packages/api/go/internal/sync/handlers/integration_activated_handler_test.go`:

```go
package handlers

import (
	"context"
	"encoding/json"
	"testing"

	"template/api-go/internal/sync/enums"
	"template/core-go/types"
)

type stubExchanger struct{ creds map[string]string }
func (s stubExchanger) Exchange(_ context.Context, _ string) (map[string]string, error) { return s.creds, nil }

type stubStarter struct {
	platform  string
	pipelines []enums.SyncPipelineName
	extID     string
	jobID     string
}
func (s *stubStarter) Start(_ context.Context, in StartSyncArgs) (string, error) {
	s.platform, s.pipelines, s.extID = in.Platform, in.Pipelines, in.StoreIntegrationExternalID
	return "job-1", nil
}

type stubAsyncExec struct{ ran string }
func (s *stubAsyncExec) ExecuteAsync(_ context.Context, jobID string, _ map[string]string) error {
	s.ran = jobID
	return nil
}

func rawActivated() types.IntegrationEventI {
	raw := []byte(`{"name":"integration.shared.integration.activated","storeId":"s1","storeIntegrationId":"i1","type":"SALES_CHANNEL","platform":"SHOPIFY","storeIntegrationExternalId":"acme.myshopify.com","credentialHandle":"h1"}`)
	return &fakeRawEvent{name: "integration.shared.integration.activated", raw: raw}
}

type fakeRawEvent struct{ name string; raw json.RawMessage }
func (e *fakeRawEvent) GetEventName() string        { return e.name }
func (e *fakeRawEvent) GetOwnerID() string          { return "" }
func (e *fakeRawEvent) GetPayload() json.RawMessage { return e.raw }

func TestIntegrationActivatedHandler_StartsSyncWithResolvedPipelines(t *testing.T) {
	starter := &stubStarter{}
	exec := &stubAsyncExec{}
	h := NewIntegrationActivatedHandler(starter, exec, stubExchanger{creds: map[string]string{"accessToken": "t"}})

	if err := h.Handle(context.Background(), rawActivated()); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if starter.platform != "SHOPIFY" {
		t.Fatalf("platform = %q", starter.platform)
	}
	if starter.extID != "acme.myshopify.com" {
		t.Fatalf("externalId = %q", starter.extID)
	}
	if len(starter.pipelines) == 0 || starter.pipelines[0] != enums.SyncPipelineOrders {
		t.Fatalf("pipelines = %v", starter.pipelines)
	}
}

type errStarter struct{ err error }
func (s errStarter) Start(_ context.Context, _ StartSyncArgs) (string, error) { return "", s.err }

// AC-6: a redelivered activation event whose integration already has a RUNNING
// job is absorbed — no error bubbles, and execution is NOT kicked again.
func TestIntegrationActivatedHandler_IdempotentOnAlreadyRunning(t *testing.T) {
	exec := &stubAsyncExec{}
	h := NewIntegrationActivatedHandler(
		errStarter{err: coreerrors.NewBaseError(ctxerrors.CodeSyncAlreadyRunning, "running")},
		exec,
		stubExchanger{creds: map[string]string{"accessToken": "t"}},
	)
	if err := h.Handle(context.Background(), rawActivated()); err != nil {
		t.Fatalf("expected nil (idempotent absorb), got %v", err)
	}
	if exec.ran != "" {
		t.Fatalf("ExecuteAsync must not run when a sync is already running, ran=%q", exec.ran)
	}
}
```

> Test imports include `coreerrors "template/core-go/errors"` and
> `ctxerrors "template/api-go/internal/sync/errors"`.

- [ ] **Step 4: Run test to verify it fails**

```bash
cd packages/api/go && go test ./internal/sync/handlers/ -run IntegrationActivated 2>&1 | head; cd ../../..
```
Expected: FAIL — handler/`StartSyncArgs`/constructor undefined.

- [ ] **Step 5: Implement the handler**

Create `packages/api/go/internal/sync/handlers/integration_activated_handler.go`:

```go
package handlers

import (
	"context"
	"log/slog"

	"template/api-go/internal/sync/enums"
	"template/api-go/internal/sync/services/credentials"
	"template/api-go/internal/sync/services/pipelineresolver"
	"template/contracts-go/wire"
	"template/core-go/types"
)

// StartSyncArgs decouples the handler from the concrete StartSync use case (testable).
type StartSyncArgs struct {
	StoreID                    string
	StoreIntegrationID         string
	StoreIntegrationExternalID string
	Platform                   string
	Pipelines                  []enums.SyncPipelineName
}

// SyncStarter is satisfied by an adapter over usecases.StartSync.
type SyncStarter interface {
	Start(ctx context.Context, in StartSyncArgs) (jobID string, err error)
}

// AsyncExecutor is satisfied by executor.Executor.ExecuteAsync.
type AsyncExecutor interface {
	ExecuteAsync(ctx context.Context, jobID string, creds map[string]string) error
}

// IntegrationActivatedHandler consumes integration.activated and auto-starts a sync.
type IntegrationActivatedHandler struct {
	starter   SyncStarter
	exec      AsyncExecutor
	exchanger credentials.Exchanger
}

func NewIntegrationActivatedHandler(s SyncStarter, e AsyncExecutor, x credentials.Exchanger) *IntegrationActivatedHandler {
	return &IntegrationActivatedHandler{starter: s, exec: e, exchanger: x}
}

func (h *IntegrationActivatedHandler) EventName() string {
	return wire.IntegrationActivatedIntegrationEventName
}

func (h *IntegrationActivatedHandler) Handle(ctx context.Context, event types.IntegrationEventI) error {
	decoded, err := decodeActivated(event)
	if err != nil {
		return err
	}

	pipelines := pipelineresolver.Resolve(decoded.Type)
	if len(pipelines) == 0 {
		slog.Info("integration.activated: no pipelines for type, skipping", "type", decoded.Type)
		return nil
	}

	creds, err := h.exchanger.Exchange(ctx, decoded.CredentialHandle)
	if err != nil {
		return err
	}

	jobID, err := h.starter.Start(ctx, StartSyncArgs{
		StoreID:                    decoded.StoreID,
		StoreIntegrationID:         decoded.StoreIntegrationID,
		StoreIntegrationExternalID: decoded.StoreIntegrationExternalID,
		Platform:                   decoded.Platform,
		Pipelines:                  pipelines,
	})
	if err != nil {
		// SYNC_ALREADY_RUNNING is the idempotency guard for redelivered events — absorb it.
		if isAlreadyRunning(err) {
			slog.Info("integration.activated: sync already running, idempotent skip", "integrationId", decoded.StoreIntegrationID)
			return nil
		}
		return err
	}

	// Detached: a backfill must not block the consumer goroutine.
	go func() {
		if err := h.exec.ExecuteAsync(context.WithoutCancel(ctx), jobID, creds); err != nil {
			slog.Error("integration.activated: ExecuteAsync failed", "jobId", jobID, "error", err)
		}
	}()
	return nil
}
```

Add the decode helper + the already-running check in the same file:

```go
import (
	coreerrors "template/core-go/errors"
	ctxerrors "template/api-go/internal/sync/errors"
)

func decodeActivated(event types.IntegrationEventI) (wire.IntegrationActivatedIntegrationEvent, error) {
	provider, ok := event.(interface{ GetPayload() json.RawMessage })
	if !ok {
		return wire.IntegrationActivatedIntegrationEvent{}, fmt.Errorf("event %s carries no payload", event.GetEventName())
	}
	decoded, err := wire.UnmarshalIntegrationEvent(provider.GetPayload())
	if err != nil {
		return wire.IntegrationActivatedIntegrationEvent{}, err
	}
	v, ok := decoded.(wire.IntegrationActivatedIntegrationEvent)
	if !ok {
		return wire.IntegrationActivatedIntegrationEvent{}, fmt.Errorf("unexpected event type %T", decoded)
	}
	return v, nil
}

func isAlreadyRunning(err error) bool {
	var be *coreerrors.BaseError
	return errors.As(err, &be) && be.Code() == ctxerrors.CodeSyncAlreadyRunning
}
```

Add imports: `"encoding/json"`, `"errors"`, `"fmt"`. Confirm `BaseError.Code()` accessor name
during build (adjust to the actual accessor on `coreerrors.BaseError` if it differs).

- [ ] **Step 6: Run handler test to verify it passes**

```bash
cd packages/api/go && go test ./internal/sync/handlers/ -run IntegrationActivated && cd ../../..
```
Expected: PASS.

- [ ] **Step 7: Wire it into the module + register with the external mediator**

Modify `packages/api/go/internal/sync/module.go`:
- Provide the resolver-backed dependencies:

```go
	fx.Provide(credentials.NewClientExchanger),
	fx.Provide(func(uc *usecases.StartSync) handlers.SyncStarter { return &startSyncAdapter{uc: uc} }),
	fx.Provide(func(exec *executor.Executor) handlers.AsyncExecutor { return exec }),
	fx.Provide(handlers.NewIntegrationActivatedHandler),
```

- Add the adapter (bottom of module.go) translating `StartSyncArgs` → `usecases.StartSyncInput`:

```go
type startSyncAdapter struct{ uc *usecases.StartSync }

func (a *startSyncAdapter) Start(ctx context.Context, in handlers.StartSyncArgs) (string, error) {
	out, err := a.uc.Execute(ctx, usecases.StartSyncInput{
		StoreID:                    in.StoreID,
		StoreIntegrationID:         in.StoreIntegrationID,
		StoreIntegrationExternalID: in.StoreIntegrationExternalID,
		Platform:                   in.Platform,
		Pipelines:                  in.Pipelines,
	})
	if err != nil {
		return "", err
	}
	return out.ID, nil
}
```

- Register the handler with the ExternalMediator (so the Task-2 consumer subscribes to its stream):

```go
	fx.Invoke(func(em coremediator.ExternalMediator, h *handlers.IntegrationActivatedHandler) {
		em.Register(h)
	}),
```

Add imports: `credentials`, `pipelineresolver` (transitively), `coremediator` (already present).

- [ ] **Step 8: Build + full sync suite**

```bash
cd packages/api/go && go build ./... && go test ./internal/sync/... ./core/services/mediator/ && cd ../../..
```
Expected: build clean; tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/api/go/internal/sync
git commit -m "feat(sync): consume integration.activated → exchange creds → start sync (Task 8)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `cd packages/api/go && go build ./... && go vet ./... && go test ./...` — Go clean
- [ ] `cd packages/api/typescript && bun test src/integration/` — integration suite passes
- [ ] AC mapping (every Plan-A-relevant spec AC → ≥1 test path):
  - AC-2 (Go consumes `integration.activated` + outbox runs) → `packages/api/go/core/services/mediator/redis_mediator_test.go:"TestRedisExternalMediator_DispatchRoutesToRegisteredHandler"`
  - AC-3 (event carries externalId + handle; secret never serialized) → `packages/api/typescript/src/integration/handlers/IntegrationActivatedHandler.test.ts:"publishes an integration event carrying externalId + a resolvable handle"`
  - AC-4 (exchange returns creds only for a valid handle, S2S-gated) → `packages/api/typescript/src/integration/usecases/ExchangeCredentials.test.ts:"returns the decrypted credentials for a valid handle"` + `"throws CREDENTIAL_HANDLE_INVALID for an unknown handle"`
  - AC-1 (connecting → a SyncJob runs to COMPLETED with rows) → `packages/api/go/internal/sync/handlers/integration_activated_handler_test.go:"TestIntegrationActivatedHandler_StartsSyncWithResolvedPipelines"` (job started) + `packages/api/go/internal/sync/services/executor/executor_test.go` (COMPLETED with creds threaded)
  - AC-6 (redelivery does not create a second concurrent job) → `packages/api/go/internal/sync/handlers/integration_activated_handler_test.go:"TestIntegrationActivatedHandler_IdempotentOnAlreadyRunning"`

> AC-5 (live progress over SSE + `lastSyncAt`) is **Plan B** — intentionally not covered here.

## Notes

- **New env vars** (add to `.env.example` + `.env`): `INTERNAL_SERVICE_KEY` (shared S2S secret,
  same value in both api-typescript and api-go); api-go reads `API_URL` for the TS base URL and
  `INTERNAL_SERVICE_KEY` for the header.
- **Library added:** Go `require template/client-go` via local `replace ../../client/dist/go`
  (the generated symmetric client; ensure `bun sdk` ran so the module exists before `go mod tidy`).
- **Generated-name confirmations** (verify post-`bun sdk`, adjust if codegen differs): the Go TS
  client method (`Typescript.ExchangeCredentialsWithResponse` + `…JSONRequestBody` + `JSON200.Credentials`),
  the `wire.StoreIntegrationType*` constants, and `coreerrors.BaseError.Code()`.
- **Idempotency** rests on `StartSync`'s existing `FindRunning` guard (`SYNC_ALREADY_RUNNING`),
  absorbed by the handler — no new dedupe store.
- **Handle TTL** is 15 min (`CredentialHandleStore.DEFAULT_TTL_SECONDS`), multi-use within TTL so
  outbox redelivery re-exchanges; the RUNNING guard prevents duplicate jobs.
- A reaper for jobs stranded `RUNNING` by a process restart (D2 accepted risk) is a documented
  follow-up, out of scope for Plan A.
- **tx convention (updated 2026-05-26):** a parallel migration reversed the project rule to
  `tx?: Transaction` (was `DrizzleClient`) and added registry rule `bp-12`. `ExchangeCredentials`
  now uses `Transaction`. Remaining plan-review triage that still holds: the `z` import comes from
  `@template/core-typescript` (not `@shared/utils/schema`); the use case is a read-only S2S
  orchestration (Redis+vault) that legitimately stays a `Handler` (not `/query`) with no write to
  wrap in `withTransaction`.
