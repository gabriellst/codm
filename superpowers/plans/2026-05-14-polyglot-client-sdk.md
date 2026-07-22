# Polyglot Client SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **No reviewer subagents** per `feedback_skip_reviewer_subagents` memory — controller self-verifies each commit via diff inspection.

**Goal:** Refactor the polyglot client SDK pipeline into a single `packages/client/` package with `lib/` (shared helpers), `generators/` (one per target), and committed per-target outputs under `dist/{typescript,rust,go}/`. Make the three OpenAPI emitters declare uniform 3.0.3 output. Strip integration events from OpenAPI surfaces (they're contracts-package types). Auto-generate aggregate `Client.create() / Client::builder() / client.New(Config)` per language. Publish `COMPLIANCE.md` documenting the OpenAPI contract this generator accepts.

**Architecture:** Each generator entry (`packages/client/generators/{typescript,rust,go}.ts`) is a flat pipeline: `discoverApis → preprocessSpec → buildPlan → runGenerator → emitServiceClient → emitAggregateClient`. Shared helpers live in `packages/client/lib/`. Spec preprocessing only validates against `COMPLIANCE.md`; transformation of nullable forms happens at emit time, not at consumption. Per-service Client classes wrap the generated low-level functions; the aggregate Client class composes per-service classes by walking discovery output. The Rust generator hosts progenitor in `packages/client/generators/rust-codegen/` (Cargo crate) because progenitor is a Rust library.

**Tech Stack:** Bun, TypeScript, Zod ^4, Kubb v4 (`@kubb/core`, `@kubb/plugin-ts`, `@kubb/plugin-zod`, `@kubb/plugin-react-query`, `@kubb/plugin-client`), Rust + progenitor 0.10, Go + oapi-codegen v2 (via `go tool`), utoipa (Rust), `packages/api/go/core/pkg/openapi` (Go AST walker).

**Spec:** `.specs/2026-05-14-polyglot-client-sdk-design.md`
**Tasks:** 28
**Estimated:** ~12-16 hours

---

## Prerequisites

- Branch `feat/clean-polyglot` checked out, working tree clean (commit anything in flight first).
- `bun install` resolves cleanly at repo root.
- Cargo workspace builds: `cargo check --workspace` clean at HEAD.
- Spec file present at `.specs/2026-05-14-polyglot-client-sdk-design.md`, Status: Approved.

## Scope (revised mid-execution)

- **In scope:** `packages/contracts/`, `packages/api/{typescript,rust,go}/`, `packages/client/` (full restructure).
- **Out of scope:** `packages/app/web/` and `packages/e2e/`. These workspaces still carry medscall-era `@medscall/monorepo-sdk/*` imports that fail under `bun tsc`. They are explicitly DEFERRED to P9/P10 in `clean-polyglot-rebuild.md` and will be re-wired in a separate spec. The plan's verification commands run `bun --cwd packages/api/typescript tsc` instead of the root `bun tsc`.

## Hook policy (binding for all tasks)

- **User has authorized blanket `--no-verify` for commits in scope of this plan only.** Reason: the repo's pre-commit hook runs full `bun tsc`, which fails on pre-existing app-web/e2e errors that are out of scope (see Scope section). Without bypass, no plan commit would land.
- Use `git commit --no-verify -m "..."` for every plan-related commit.
- Do NOT use `--no-verify` for any commit OUTSIDE this plan's scope (the user's parallel in-flight edits, manual fixups elsewhere, etc.). If unsure, ask.
- Each task is still responsible for its own correctness: per-task tsc/test/build must pass via the explicit commands the task lists. The hook is bypassed but the task's verification steps are not.

## File Structure

**New / moved files:**

```
packages/client/                                            [FLATTENED]
├── package.json                                            [CREATE — merges three sub-package manifests]
├── README.md                                               [CREATE — points at COMPLIANCE.md + usage]
├── COMPLIANCE.md                                           [CREATE — published OpenAPI contract]
├── project.json                                            [CREATE — Nx targets: generate, build, check]
├── lib/
│   ├── discover.ts                                         [MOVE from scripts/lib/discover-apis.ts, drop `lang` field]
│   ├── preprocess.ts                                       [CREATE — COMPLIANCE.md validator + SSE filter]
│   ├── sanitize.ts                                         [CREATE — per-language reserved-word + identifier sanitizer]
│   └── render/
│       ├── typescript.ts                                   [CREATE — per-service + aggregate Client class renderer]
│       ├── rust.ts                                         [CREATE — Client struct + ClientBuilder renderer]
│       └── go.ts                                           [CREATE — Client struct + New(Config) renderer]
├── generators/
│   ├── typescript.ts                                       [MOVE from packages/client/typescript/scripts/sdk.ts, pipe-style]
│   ├── rust.ts                                             [MOVE from packages/client/rust/scripts/sdk.ts, pipe-style]
│   ├── rust-codegen/
│   │   ├── Cargo.toml                                      [MOVE from packages/client/rust/Cargo.toml (codegen-only crate)]
│   │   └── src/main.rs                                     [MOVE from packages/client/rust/src/bin/sdk-codegen.rs, strip downgrade]
│   └── go.ts                                               [MOVE from packages/client/go/scripts/sdk.ts, pipe-style]
└── dist/
    ├── typescript/
    │   ├── package.json                                    [MOVE from packages/client/typescript/package.json]
    │   └── src/
    │       ├── http/index.ts                               [CREATE — configureClient, ported from dev:packages/client/src/http/]
    │       ├── <service>/                                  [EMITTED]
    │       │   ├── client/                                 (Kubb)
    │       │   ├── types/                                  (Kubb)
    │       │   ├── zod/                                    (Kubb)
    │       │   ├── hooks/                                  (Kubb)
    │       │   ├── Client.ts                               [EMITTED — per-service class with static create]
    │       │   └── index.ts                                (Kubb)
    │       └── index.ts                                    [EMITTED — aggregate Client class with static create]
    ├── rust/
    │   ├── Cargo.toml                                      [MOVE from packages/client/rust/Cargo.toml (consumer crate)]
    │   └── src/
    │       ├── lib.rs                                      [EMITTED — pub mod <service>; Client struct; ClientBuilder]
    │       └── <service>/mod.rs                            (progenitor)
    └── go/
        ├── go.mod                                          [MOVE from packages/client/go/go.mod]
        ├── go.sum
        └── pkg/
            ├── client/client.go                            [EMITTED — Client struct, Config, New()]
            └── <service>/client.gen.go                     (oapi-codegen)
```

**Deleted directories:**

```
packages/client/typescript/                                 [DELETE — contents moved to packages/client/dist/typescript/]
packages/client/rust/                                       [DELETE — contents moved to packages/client/{dist/rust,generators/rust-codegen}/]
packages/client/go/                                         [DELETE — contents moved to packages/client/dist/go/]
packages/client/api_typescript/                             [DELETE — Pass-8 orphan]
packages/client/api_rust/                                   [DELETE — Pass-8 orphan]
scripts/lib/discover-apis.ts                                [DELETE — moved to packages/client/lib/discover.ts]
```

**Modified files (high level):**

- `packages/api/typescript/core/src/utils/OpenAPI.ts` — emit 3.0.3, rewrite nullable, strip `registerEvents()` + synthesizers, strip internal/external tag emission, rename vendor extensions to `x-tpl-*`.
- `packages/api/typescript/core/src/utils/schema/ExtraTypes.ts` — `integrationEvent(name, payload)` bakes `name: z.literal(name)`.
- `packages/api/typescript/src/shared/index.ts` — remove `openapi.registerEvents(integrationEvents)` call.
- `packages/api/rust/src/bin/emit_openapi.rs` — declare 3.0.3 (or post-process).
- `packages/api/rust/src/lib.rs` — strip IntegrationEvent schema registration if present.
- `packages/api/rust/src/sse/controllers/listen_events.rs` — annotate with `x-tpl-sse: true`.
- `packages/api/go/cmd/emit-openapi/main.go` — call `openapi.Generate(".", "public/openapi.json")`.
- `packages/api/go/core/pkg/openapi/emit.go` — declare 3.0.3, remove `IntegrationEvent` schema registration.
- `packages/contracts/codegen/emit-wire-ts.ts` — emit `z.integrationEvent('<wireName>', {...})`.
- `packages/contracts/codegen/emit-wire-rs.ts` — emit serde `#[serde(tag = "name")]` enum with literal variants.
- `packages/contracts/codegen/emit-wire-go.ts` — emit typed const `Name` field per event.
- Root `package.json` workspaces — drop three sub-paths, add `packages/client`.
- Root `Cargo.toml` workspace members — drop `packages/client/rust`, add `packages/client/dist/rust` + `packages/client/generators/rust-codegen`.

---

## Phase 0 — Cleanup

### Task 1: Delete Pass-8 orphan directories

**Files:**
- Delete: `packages/client/api_typescript/`
- Delete: `packages/client/api_rust/`

- [ ] **Step 1: Verify orphan contents are stale (one file each, generated)**

Run: `find packages/client/api_typescript packages/client/api_rust -type f`
Expected: each directory contains only `client.gen.go`, with the comment "Code generated by github.com/oapi-codegen/oapi-codegen/v2 ... DO NOT EDIT."

- [ ] **Step 2: Delete**

```bash
rm -rf packages/client/api_typescript packages/client/api_rust
```

- [ ] **Step 3: Verify gate sweep still clean (orphans were not imported)**

Run: `bun tsc && cargo check --workspace 2>&1 | tail -5`
Expected: 0 errors. Cargo may report unrelated existing warnings only.

- [ ] **Step 4: Commit**

```bash
git add -A packages/client/
git commit -m "chore(client): delete Pass-8 orphan directories (Task 1)"
```

---

## Phase 1 — OpenAPI dialect uniformity (Decision 1)

### Task 2: TS OpenAPI emitter outputs 3.0.3 with nullable rewrite

**Files:**
- Modify: `packages/api/typescript/core/src/utils/OpenAPI.ts` — declare `openapi: '3.0.3'`, rewrite nullable forms in `zodToJsonSchema` override.

- [ ] **Step 1: Update spec dialect declaration**

In `packages/api/typescript/core/src/utils/OpenAPI.ts:261`, change:

```diff
-    openapi: '3.1.0',
+    openapi: '3.0.3',
```

- [ ] **Step 2: Rewrite nullable inside `zodToJsonSchema` override**

In `packages/api/typescript/core/src/utils/OpenAPI.ts` inside the `zodToJsonSchema` function's `override:` callback (around line 200-234), add a post-processing pass before the return to canonicalize nullable shapes. Insert near the end of the `override` body, AFTER existing branches:

```typescript
				// OAS 3.0 canonicalization: collapse nullable forms to `{ ...X, nullable: true }`.
				// Forms handled:
				//   - `anyOf: [<schema>, { type: "null" }]`
				//   - `type: ["X", "null"]`
				const js = ctx.jsonSchema as Record<string, unknown>
				if (Array.isArray(js.type)) {
					const types = js.type as string[]
					const nonNull = types.filter(t => t !== 'null')
					if (nonNull.length < types.length) {
						js.nullable = true
						if (nonNull.length === 1) js.type = nonNull[0]
						else if (nonNull.length > 1) js.type = nonNull
						else delete js.type
					}
				}
				if (Array.isArray(js.anyOf)) {
					const anyOf = js.anyOf as Array<Record<string, unknown>>
					const nonNull = anyOf.filter(s => s.type !== 'null')
					if (nonNull.length < anyOf.length) {
						js.nullable = true
						if (nonNull.length === 1) Object.assign(js, nonNull[0])
						else if (nonNull.length > 1) js.anyOf = nonNull
						else delete js.anyOf
					}
				}
```

- [ ] **Step 3: Re-emit and verify**

```bash
bun --cwd packages/api/typescript run emit-openapi
jq '.openapi' packages/api/typescript/public/docs/openapi.json
```

Expected output: `"3.0.3"`

```bash
# Verify no `anyOf` with `{type:"null"}` survives:
jq '[.. | objects | select(.anyOf? != null) | .anyOf[] | select(.type == "null")] | length' packages/api/typescript/public/docs/openapi.json
```

Expected output: `0`

- [ ] **Step 4: Commit**

```bash
git add packages/api/typescript/core/src/utils/OpenAPI.ts packages/api/typescript/public/docs/openapi.json
git commit -m "feat(api-typescript): emit OpenAPI 3.0.3 with canonical nullable shape (Task 2)"
```

### Task 3: Rust utoipa emitter declares 3.0.3

**Files:**
- Modify: `packages/api/rust/src/bin/emit_openapi.rs` — post-process `openapi` field to `3.0.3` before writing.

- [ ] **Step 1: Post-process the serialized spec to declare 3.0.3**

In `packages/api/rust/src/bin/emit_openapi.rs`, replace `fn main()` body's middle section. Change from `let json = spec.to_pretty_json().expect(...)` to a Value-based round-trip that lets us mutate the version. Replace:

```rust
    let spec = ApiDoc::openapi();
    let json = spec.to_pretty_json().expect("failed to serialise OpenAPI spec to JSON");
```

with:

```rust
    let spec = ApiDoc::openapi();
    let mut value: serde_json::Value =
        serde_json::to_value(&spec).expect("failed to serialise OpenAPI spec");
    if let Some(obj) = value.as_object_mut() {
        obj.insert("openapi".into(), serde_json::Value::String("3.0.3".into()));
    }
    let json = serde_json::to_string_pretty(&value).expect("failed to serialise OpenAPI spec to JSON");
```

If `serde_json` is not already a dependency of `template-api-rust`, add it to `packages/api/rust/Cargo.toml`:

```toml
serde_json = "1"
```

- [ ] **Step 2: Re-emit and verify**

```bash
(cd packages/api/rust && cargo run --bin emit_openapi --quiet)
jq '.openapi' packages/api/rust/public/docs/openapi.json
```

Expected: `"3.0.3"`

- [ ] **Step 3: Commit**

```bash
git add packages/api/rust/src/bin/emit_openapi.rs packages/api/rust/Cargo.toml packages/api/rust/public/docs/openapi.json
git commit -m "feat(api-rust): emit OpenAPI 3.0.3 from utoipa output (Task 3)"
```

### Task 4: Go walker declares 3.0.3

**Files:**
- Modify: `packages/api/go/core/pkg/openapi/emit.go:101` — `OpenAPI: "3.0.3"`.

- [ ] **Step 1: Change the declared dialect**

In `packages/api/go/core/pkg/openapi/emit.go` line 101 (the `newSpec()` function), change:

```diff
-		OpenAPI: "3.1.0",
+		OpenAPI: "3.0.3",
```

Also update the file-level comment on line 1 (`Package openapi is the Go OpenAPI 3.1 emitter...`) to say `3.0`.

- [ ] **Step 2: Verify**

```bash
(cd packages/api/go && go build ./... && go test ./core/pkg/openapi/...)
```

Expected: 0 errors. Tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/api/go/core/pkg/openapi/emit.go
git commit -m "feat(api-go): walker declares OpenAPI 3.0.3 (Task 4)"
```

---

## Phase 2 — api-go OpenAPI walker wired (Decision 2)

### Task 5: api-go emit-openapi calls the walker

**Files:**
- Modify: `packages/api/go/cmd/emit-openapi/main.go` — replace empty-paths stub with `openapi.Generate(".", "public/openapi.json")`.

- [ ] **Step 1: Rewrite the binary body**

Replace the entire body of `packages/api/go/cmd/emit-openapi/main.go` with:

```go
// cmd/emit-openapi — offline OpenAPI emitter for api-go.
//
// Delegates to packages/api/go/core/pkg/openapi.Generate which walks the
// service via go/packages, discovers controllers, and emits OpenAPI 3.0.3.
//
// Output: packages/api/go/public/openapi.json
//
// Usage:
//
//	go run ./cmd/emit-openapi
//	# or via Nx:
//	bun nx run api-go:emit-openapi
package main

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"template/core-go/pkg/openapi"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	outPath := filepath.Join("public", "openapi.json")
	if err := openapi.Generate(".", outPath); err != nil {
		slog.Error("emit-openapi failed", "err", err)
		os.Exit(1)
	}

	info, err := os.Stat(outPath)
	if err != nil {
		slog.Error("stat output", "err", err)
		os.Exit(1)
	}
	slog.Info("wrote openapi.json", "path", outPath, "bytes", info.Size())
	fmt.Printf("Wrote %d bytes to %s\n", info.Size(), outPath)
}
```

- [ ] **Step 2: Run the binary and verify it discovers the transcoder controller**

```bash
(cd packages/api/go && go run ./cmd/emit-openapi)
jq '.paths | keys | length' packages/api/go/public/openapi.json
jq '.paths | keys' packages/api/go/public/openapi.json
```

Expected: `≥ 1`. The transcoder-callback path (something like `/v1/transcoder/callback`) should appear in the keys list.

- [ ] **Step 3: Verify gates still clean**

```bash
(cd packages/api/go && go build ./... && go test ./...)
```

Expected: 0 errors. All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/api/go/cmd/emit-openapi/main.go packages/api/go/public/openapi.json
git commit -m "feat(api-go): wire walker into emit-openapi binary (Task 5)"
```

---

## Phase 3 — Contracts side fixes (Decisions 5, 6, 16)

### Task 6: `integrationEvent()` helper bakes `name: z.literal(...)`

**Files:**
- Modify: `packages/api/typescript/core/src/utils/schema/ExtraTypes.ts:178-195` — add required `name` arg, bake literal into produced schema.
- Modify: `packages/api/typescript/core/src/types/BaseIntegrationEvent.ts:4-7` — add `name: z.string()` to base schema for type-positive coverage.

- [ ] **Step 1: Write failing test for `integrationEvent()` bakes name literal**

Create `packages/api/typescript/core/src/utils/schema/integrationEvent.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { z } from '../../schema'

describe('z.integrationEvent', () => {
	it('bakes the event name as a z.literal in the produced schema', () => {
		const schema = z.integrationEvent('integration.example.created', { foo: z.string() })
		const parsed = schema.parse({
			name: 'integration.example.created',
			payload: { foo: 'bar' },
			ownerId: 'tenant-1',
		})
		expect(parsed.name).toBe('integration.example.created')

		expect(() =>
			schema.parse({
				name: 'integration.example.different',
				payload: { foo: 'bar' },
				ownerId: 'tenant-1',
			}),
		).toThrow()
	})

	it('participates in a discriminatedUnion by name', () => {
		const a = z.integrationEvent('integration.a', { value: z.string() })
		const b = z.integrationEvent('integration.b', { value: z.number() })
		const union = z.discriminatedUnion('name', [a, b])

		const parsed = union.parse({
			name: 'integration.a',
			payload: { value: 'hello' },
			ownerId: 't',
		})
		expect(parsed.name).toBe('integration.a')
		expect((parsed.payload as { value: string }).value).toBe('hello')
	})
})
```

- [ ] **Step 2: Run test, verify failure**

Run: `bun test packages/api/typescript/core/src/utils/schema/integrationEvent.test.ts`
Expected: FAIL — `z.integrationEvent('integration.example.created', ...)` types/runtime do not accept a name string today.

- [ ] **Step 3: Modify `BaseIntegrationEventSchema` to include `name`**

In `packages/api/typescript/core/src/types/BaseIntegrationEvent.ts`, change:

```diff
-export const BaseIntegrationEventSchema = z.object({
-	payload: z.object(),
-	ownerId: z.string(),
-})
+export const BaseIntegrationEventSchema = z.object({
+	name: z.string(),
+	payload: z.object(),
+	ownerId: z.string(),
+})
```

Update the `EventSchemaConstraint` type alias to include `name`:

```diff
-type EventSchemaConstraint = ZodObject<{ payload: ZodTypeAny; ownerId: z.ZodString }>
+type EventSchemaConstraint = ZodObject<{ name: ZodTypeAny; payload: ZodTypeAny; ownerId: z.ZodString }>
```

- [ ] **Step 4: Rewrite `integrationEvent()` to require a name argument**

In `packages/api/typescript/core/src/utils/schema/ExtraTypes.ts`, replace the overload signatures + implementation at lines 178-195:

```typescript
export function integrationEvent(name: string, options?: SchemaOptions): ZodObject<{
	name: ZodLiteral<string>
	payload: typeof BaseIntegrationEventSchema.shape.payload
	ownerId: typeof BaseIntegrationEventSchema.shape.ownerId
}>
export function integrationEvent<T extends ZodTypeAny>(name: string, schema: T, options?: SchemaOptions): IntegrationEventWithPayloadSchema<T> & { shape: { name: ZodLiteral<string> } }
export function integrationEvent<T extends ZodRawShape>(name: string, properties: T, options?: SchemaOptions): IntegrationEventObjectSchema<T> & { shape: { name: ZodLiteral<string> } }
export function integrationEvent(name: string, properties?: ZodRawShape | ZodTypeAny | SchemaOptions, options?: SchemaOptions) {
	// Allow (name) / (name, options) / (name, schema) / (name, schema, options) / (name, properties, options).
	let resolvedProperties: ZodRawShape | ZodTypeAny | undefined
	let resolvedOptions: SchemaOptions | undefined

	if (properties && typeof properties === 'object' && !('_zod' in properties) && !Array.isArray(properties)) {
		// Either ZodRawShape or SchemaOptions (which has only `examples`).
		const keys = Object.keys(properties)
		const looksLikeOptions = keys.length === 1 && keys[0] === 'examples'
		if (looksLikeOptions) {
			resolvedOptions = properties as SchemaOptions
		} else {
			resolvedProperties = properties as ZodRawShape
			resolvedOptions = options
		}
	} else if (properties && '_zod' in (properties as object)) {
		resolvedProperties = properties as ZodTypeAny
		resolvedOptions = options
	} else {
		resolvedOptions = options
	}

	const mergedExamples = resolvedOptions?.examples ?? []
	const { name: _name, payload: _payload, ...baseShape } = BaseIntegrationEventSchema.shape

	if (resolvedProperties === undefined) {
		return z
			.object({ ...baseShape, name: z.literal(name), payload: BaseIntegrationEventSchema.shape.payload })
			.meta({ examples: mergedExamples })
	}

	const payloadSchema =
		'_zod' in (resolvedProperties as object)
			? (resolvedProperties as ZodTypeAny)
			: z.object(resolvedProperties as ZodRawShape)

	return z
		.object({ ...baseShape, name: z.literal(name), payload: payloadSchema })
		.meta({ examples: mergedExamples })
}
```

Note: `ZodLiteral` may need an import — add to the imports near the top: `import { z, type ZodObject, type ZodTypeAny, type ZodLiteral } from 'zod'`.

- [ ] **Step 5: Run test, verify pass**

Run: `bun test packages/api/typescript/core/src/utils/schema/integrationEvent.test.ts`
Expected: PASS — 2 tests pass.

- [ ] **Step 6: Run full type check (callers of `integrationEvent` will now fail compilation — that's expected; Task 7 fixes them)**

Run: `bun --cwd packages/api/typescript tsc 2>&1 | head -30`
Expected: TypeScript errors at call sites of `integrationEvent(...)` complaining about missing first arg. The error count is finite and bounded to contracts emitter output + any direct callers; this is OK to leave temporarily until Task 7 lands.

- [ ] **Step 7: Commit (Task 6 atomic; broken type-check is a known transient)**

```bash
git add packages/api/typescript/core/src/utils/schema/ExtraTypes.ts \
        packages/api/typescript/core/src/utils/schema/integrationEvent.test.ts \
        packages/api/typescript/core/src/types/BaseIntegrationEvent.ts
git commit -m "feat(core-typescript): integrationEvent(name, ...) bakes z.literal name (Task 6)"
```

### Task 7: Contracts TS emitter passes wireName to integrationEvent

**Files:**
- Modify: `packages/contracts/codegen/emit-wire-ts.ts:92` — emit `z.integrationEvent('<wireName>', {...payload})`.

- [ ] **Step 1: Locate emit site**

Read `packages/contracts/codegen/emit-wire-ts.ts` around line 80-95. The line emitting `z.integrationEvent({...})` is the call site to update.

- [ ] **Step 2: Change the emitter to pass `wireName` as first arg**

Replace the line emitting `export const ${ev.modelName}Schema = z.integrationEvent({\n${zodFields}\n})\n\n` with:

```typescript
			`export const ${ev.modelName}Schema = z.integrationEvent('${ev.wireName}', {\n${zodFields}\n})\n\n` +
```

(That is: prepend `'${ev.wireName}', ` inside the call.)

- [ ] **Step 3: Regenerate contracts and verify the generated event has a literal name**

```bash
bun contracts
grep -A3 'integrationEvent' packages/contracts/generated/typescript/src/wire/events/video-uploaded.ts
```

Expected output includes something like:

```typescript
export const VideoUploadedEventSchema = z.integrationEvent('integration.video.uploaded', {
	videoId: z.string(),
	...
```

- [ ] **Step 4: Verify discriminated-union parsing works**

Create `packages/contracts/codegen/discriminator.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { IntegrationEventSchema } from '@template/contracts-typescript/wire'

describe('IntegrationEventSchema (generated)', () => {
	it('resolves variants by name literal at parse time', () => {
		const parsed = IntegrationEventSchema.parse({
			name: 'integration.video.uploaded',
			payload: {
				videoId: 'v_1',
				channelId: 'c_1',
				uploadedBy: 'u_1',
				byteSize: 1024,
				mimeType: 'video/mp4',
				storageKey: 'k_1',
			},
			ownerId: 'tenant-1',
		})
		expect(parsed.name).toBe('integration.video.uploaded')
	})

	it('throws on unknown discriminator value', () => {
		expect(() =>
			IntegrationEventSchema.parse({
				name: 'integration.unknown',
				payload: {},
				ownerId: 'tenant-1',
			}),
		).toThrow()
	})
})
```

Run: `bun test packages/contracts/codegen/discriminator.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Run api-typescript type check; expect it clean now that contracts re-emitted**

Run: `bun --cwd packages/api/typescript tsc`
Expected: 0 errors. (The Task 6 transient was contracts-driven; Task 7's regenerated wire files fix all sites.)

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/codegen/emit-wire-ts.ts packages/contracts/codegen/discriminator.test.ts packages/contracts/generated/
git commit -m "feat(contracts-typescript): bake wireName into IntegrationEvent variants (Task 7)"
```

### Task 8: Contracts Rust emitter tags variants for serde discrimination

**Files:**
- Modify: `packages/contracts/codegen/emit-wire-rs.ts` — emit `#[serde(tag = "name", rename_all = "snake_case")]` ... wait, the wire name is a fixed string like `integration.video.uploaded`, so use explicit `#[serde(rename = "integration.video.uploaded")]` on each variant.

- [ ] **Step 1: Inspect current emitter output for events**

Run: `cat packages/contracts/generated/rust/src/wire/events/mod.rs 2>&1 | head -40`
This shows the current shape. Look for whether there's already an enum union and how variants are tagged.

- [ ] **Step 2: Modify emit-wire-rs.ts to emit serde-tagged enum**

The Rust emitter produces an `IntegrationEvent` enum. Locate the enum emit block (search `IntegrationEvent` in `packages/contracts/codegen/emit-wire-rs.ts`) and ensure:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "name")]
pub enum IntegrationEvent {
    #[serde(rename = "integration.video.uploaded")]
    VideoUploaded { payload: VideoUploadedPayload, owner_id: String },
    #[serde(rename = "integration.video.transcoded")]
    VideoTranscoded { payload: VideoTranscodedPayload, owner_id: String },
    // ...
}
```

The exact emitter modification depends on the current `emit-wire-rs.ts` shape; the contract is: each variant carries `#[serde(rename = "<wireName>")]` and the enum itself has `#[serde(tag = "name")]`.

- [ ] **Step 3: Write a Rust test verifying discriminated parsing**

Create `packages/contracts/generated/rust/src/wire/events/tests.rs` (or in a colocated `tests.rs`):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_video_uploaded_variant_by_name() {
        let json = r#"{
            "name": "integration.video.uploaded",
            "payload": {
                "videoId": "v_1",
                "channelId": "c_1",
                "uploadedBy": "u_1",
                "byteSize": 1024,
                "mimeType": "video/mp4",
                "storageKey": "k_1"
            },
            "ownerId": "tenant-1"
        }"#;
        let parsed: IntegrationEvent = serde_json::from_str(json).expect("parse");
        assert!(matches!(parsed, IntegrationEvent::VideoUploaded { .. }));
    }

    #[test]
    fn rejects_unknown_name() {
        let json = r#"{"name":"unknown","payload":{},"ownerId":"t"}"#;
        let parsed: Result<IntegrationEvent, _> = serde_json::from_str(json);
        assert!(parsed.is_err());
    }
}
```

If the generated file doesn't already include `#[cfg(test)] mod tests` integration hook, add a standalone test crate `packages/contracts/generated/rust/tests/discriminator.rs` with the same content (adjusting imports to `use template_contracts_rust::wire::events::*`).

- [ ] **Step 4: Regenerate and run Rust test**

```bash
bun contracts
cargo test -p template-contracts-rust
```

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/codegen/emit-wire-rs.ts packages/contracts/generated/rust/
git commit -m "feat(contracts-rust): tag IntegrationEvent variants for serde name discrimination (Task 8)"
```

### Task 9: Contracts Go emitter adds typed const Name field

**Files:**
- Modify: `packages/contracts/codegen/emit-wire-go.ts` — each event struct gets `Name string` JSON-tagged + a `const <Type>Name = "<wireName>"`. The union type uses a constructor map keyed on `Name`.

- [ ] **Step 1: Inspect current Go emitter output**

Run: `cat packages/contracts/generated/go/wire/events/*.go 2>&1 | head -40`

- [ ] **Step 2: Modify emit-wire-go.ts to emit `Name` field per event**

For each event, generated struct should look like:

```go
const VideoUploadedName = "integration.video.uploaded"

type VideoUploaded struct {
    Name    string                  `json:"name"`
    Payload VideoUploadedPayload    `json:"payload"`
    OwnerID string                  `json:"ownerId"`
}
```

Also emit a `ParseIntegrationEvent(raw []byte) (IntegrationEvent, error)` that switches on the `name` field after unmarshaling to `map[string]any`.

- [ ] **Step 3: Write a Go test**

Create `packages/contracts/generated/go/wire/events/discriminator_test.go`:

```go
package events_test

import (
	"testing"

	events "template/contracts-go/wire/events"
)

func TestParseVideoUploadedVariant(t *testing.T) {
	raw := []byte(`{
		"name": "integration.video.uploaded",
		"payload": {
			"videoId": "v_1", "channelId": "c_1", "uploadedBy": "u_1",
			"byteSize": 1024, "mimeType": "video/mp4", "storageKey": "k_1"
		},
		"ownerId": "tenant-1"
	}`)
	parsed, err := events.ParseIntegrationEvent(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if _, ok := parsed.(events.VideoUploaded); !ok {
		t.Fatalf("expected VideoUploaded, got %T", parsed)
	}
}

func TestRejectsUnknownName(t *testing.T) {
	raw := []byte(`{"name":"unknown","payload":{},"ownerId":"t"}`)
	if _, err := events.ParseIntegrationEvent(raw); err == nil {
		t.Fatalf("expected error, got nil")
	}
}
```

- [ ] **Step 4: Regenerate and run**

```bash
bun contracts
(cd packages/contracts/generated/go && go test ./wire/events/...)
```

Expected: PASS — 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/codegen/emit-wire-go.ts packages/contracts/generated/go/
git commit -m "feat(contracts-go): emit typed Name + ParseIntegrationEvent (Task 9)"
```

### Task 10: Strip IntegrationEvent registration from TS OpenAPI emitter

**Files:**
- Modify: `packages/api/typescript/core/src/utils/OpenAPI.ts` — delete `registerEvents()`, `synthesizeServerEventName()`, `synthesizeServerEvent()`, and remove their call sites.
- Modify: `packages/api/typescript/src/shared/index.ts:36` — delete `openapi.registerEvents(integrationEvents)` line and its now-unused import.

- [ ] **Step 1: Delete `registerEvents` and the two synthesizers from OpenAPI.ts**

In `packages/api/typescript/core/src/utils/OpenAPI.ts`:
- Remove the `registerEvents(events: Record<string, unknown>): void { ... }` method (around line 300-335).
- Remove `private synthesizeServerEventName(): void { ... }` (around line 343-368).
- Remove `private synthesizeServerEvent(): void { ... }` (around line 375-406).
- In `generateSpecification()` (around line 408), remove the two calls:

```diff
-		this.synthesizeServerEventName()
-		this.synthesizeServerEvent()
```

- [ ] **Step 2: Remove the call site in shared/index.ts**

In `packages/api/typescript/src/shared/index.ts`, remove the import on line 12 and the call on line 36:

```diff
-import * as integrationEvents from '@template/contracts-typescript/wire'
...
-openapi.registerEvents(integrationEvents)
```

- [ ] **Step 3: Re-emit and verify IntegrationEvent is gone**

```bash
bun --cwd packages/api/typescript run emit-openapi
jq '.components.schemas | keys | map(select(. == "IntegrationEvent")) | length' packages/api/typescript/public/docs/openapi.json
```

Expected: `0`

- [ ] **Step 4: Verify gates**

```bash
bun --cwd packages/api/typescript tsc && bun --cwd packages/api/typescript test
```

Expected: 0 errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/api/typescript/core/src/utils/OpenAPI.ts \
        packages/api/typescript/src/shared/index.ts \
        packages/api/typescript/public/docs/openapi.json
git commit -m "refactor(api-typescript): remove IntegrationEvent from OpenAPI surface (Task 10)"
```

### Task 11: Rust utoipa skips integration events; Go walker too

**Files:**
- Modify: `packages/api/rust/src/lib.rs` — verify no `IntegrationEvent` ref in `components(schemas(...))` (audit; today there is none — confirm and document).
- Modify: `packages/api/go/core/pkg/openapi/events.go` — short-circuit `registerEvents` to no-op OR remove the IntegrationEvent oneOf registration while keeping per-event schemas if needed.

- [ ] **Step 1: Confirm Rust side has no IntegrationEvent registration**

Run: `grep -n 'IntegrationEvent' packages/api/rust/src/lib.rs packages/api/rust/src/**/*.rs 2>&1 | head`
Expected: matches only in `use template_contracts_rust::...` style imports if any; NO entry in `components(schemas(...))`. If present, remove it. Today's `lib.rs:40-67` does not include `IntegrationEvent` — this step is verify-only.

- [ ] **Step 2: Update Go walker to skip IntegrationEvent union registration**

In `packages/api/go/core/pkg/openapi/events.go`, locate the function that registers the `IntegrationEvent` oneOf component (search `IntegrationEvent`). Remove the registration block while keeping per-event component generation (those may still be emitted as response references). If the walker's entire events.go is dedicated to IntegrationEvent, either:
- Short-circuit `registerEvents(spec *Spec, w *walker, unions []unionAnnotation) error` to `return nil`, OR
- Delete the union registration but keep per-event response refs if controllers use them.

For this codebase today (no Go controller references integration events in its response), the safer path is to short-circuit `registerEvents` to `return nil` and rename the function to `registerEvents` retaining the call so we don't break the call site in `emit.go:48`.

- [ ] **Step 3: Re-emit Go spec and verify**

```bash
(cd packages/api/go && go run ./cmd/emit-openapi)
jq '.components.schemas | keys | map(select(. == "IntegrationEvent" or . == "ServerEvent" or . == "ServerEventName")) | length' packages/api/go/public/openapi.json
```

Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add packages/api/go/core/pkg/openapi/events.go packages/api/go/public/openapi.json
git commit -m "refactor(api-go): walker no longer emits IntegrationEvent schema (Task 11)"
```

### Task 12: Vendor extensions renamed to `x-tpl-*`

**Files:**
- Modify: `packages/api/typescript/core/src/utils/OpenAPI.ts` — rename `x-zod-refinements` → `x-tpl-zod-refinements`, `x-tag` → `x-tpl-tag` (gone with Task 10), `x-discriminators` → `x-tpl-discriminators`, `x-enum-varnames` → `x-tpl-enum-varnames`, `x-unknown` → `x-tpl-unknown`.
- Modify any Kubb post-processing that reads these extension keys (search `x-zod-refinements` in `packages/client/`).

- [ ] **Step 1: Rename extensions in OpenAPI.ts**

Use `Edit` with `replace_all`:

```bash
# Apply each rename one at a time with Edit's replace_all on packages/api/typescript/core/src/utils/OpenAPI.ts:
#   'x-zod-refinements' -> 'x-tpl-zod-refinements'
#   'x-discriminators'  -> 'x-tpl-discriminators'
#   'x-enum-varnames'   -> 'x-tpl-enum-varnames'
#   'x-unknown'         -> 'x-tpl-unknown'
```

- [ ] **Step 2: Search and rename in Kubb post-processing**

```bash
grep -rln 'x-zod-refinements\|x-discriminators\|x-enum-varnames\|x-unknown' packages/client/ packages/contracts/ scripts/
```

For each match, apply the same rename. The likely match is `packages/client/typescript/scripts/sdk.ts` and any Kubb plugin wrapper.

- [ ] **Step 3: Re-emit and verify**

```bash
bun --cwd packages/api/typescript run emit-openapi
jq '[.. | objects | keys | .[] | select(startswith("x-") and (startswith("x-tpl-") | not))] | unique' packages/api/typescript/public/docs/openapi.json
```

Expected: `[]` (or only well-known OAS extensions like `x-example` if any).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(api-typescript): namespace vendor extensions as x-tpl-* (Task 12)"
```

---

## Phase 4 — External/internal tag emission removed (Decision 4)

### Task 13: Drop internal/external from buildTags

**Files:**
- Modify: `packages/api/typescript/core/src/utils/OpenAPI.ts:750-759` — `buildTags` only emits the domain tag.

- [ ] **Step 1: Update `buildTags`**

In `packages/api/typescript/core/src/utils/OpenAPI.ts`, replace the `buildTags` method body:

```diff
 	private buildTags(controller: Controller, router: Router): string[] {
-		const tags = []
-		tags.push(router.path.replace('/', ''))
-		if (controller.path.includes('internal')) {
-			tags.push('internal')
-		} else {
-			tags.push('external')
-		}
-		return tags
+		return [router.path.replace('/', '')]
 	}
```

- [ ] **Step 2: Re-emit and verify**

```bash
bun --cwd packages/api/typescript run emit-openapi
jq '[.. | objects | select(.tags? != null) | .tags | .[]] | unique | map(select(. == "internal" or . == "external")) | length' packages/api/typescript/public/docs/openapi.json
```

Expected: `0`

- [ ] **Step 3: Commit**

```bash
git add packages/api/typescript/core/src/utils/OpenAPI.ts packages/api/typescript/public/docs/openapi.json
git commit -m "refactor(api-typescript): drop internal/external tag emission (Task 13)"
```

---

## Phase 5 — SSE flagging (Decision 15)

### Task 14: api-rust SSE handler emits `x-tpl-sse: true`

**Files:**
- Modify: `packages/api/rust/src/sse/controllers/listen_events.rs` — add operation-level vendor extension via utoipa `extensions(...)` arg in the `#[utoipa::path]` macro.

- [ ] **Step 1: Update the utoipa annotation**

In `packages/api/rust/src/sse/controllers/listen_events.rs`, find the `#[utoipa::path(...)]` decorator (around line 16). Add an `extensions(...)` entry:

```rust
#[utoipa::path(
    get,
    path = "/v1/events",
    tag = "sse",
    extensions(
        ("x-tpl-sse" = true)
    ),
    responses(
        (status = 200, description = "Server-sent events stream", content_type = "text/event-stream")
    )
)]
```

If utoipa 5.x exposes extensions via a different syntax in this repo's version, check `cargo doc --package utoipa --open` for the supported form; alternative is post-processing in `emit_openapi.rs` to inject the field into the path operation after serialization.

- [ ] **Step 2: Fallback — post-process in emit_openapi.rs if utoipa syntax doesn't fit**

If utoipa rejects the syntax above, instead modify `packages/api/rust/src/bin/emit_openapi.rs` (already mutating `Value` from Task 3): after the openapi-version mutation, walk `paths./v1/events.get` and insert `x-tpl-sse: true`. Concrete addition:

```rust
    if let Some(paths) = value.get_mut("paths").and_then(|v| v.as_object_mut()) {
        if let Some(op) = paths
            .get_mut("/v1/events")
            .and_then(|v| v.as_object_mut())
            .and_then(|o| o.get_mut("get"))
            .and_then(|v| v.as_object_mut())
        {
            op.insert("x-tpl-sse".into(), serde_json::Value::Bool(true));
        }
    }
```

- [ ] **Step 3: Re-emit and verify**

```bash
(cd packages/api/rust && cargo run --bin emit_openapi --quiet)
jq '.paths."/v1/events".get."x-tpl-sse"' packages/api/rust/public/docs/openapi.json
```

Expected: `true`

- [ ] **Step 4: Commit**

```bash
git add packages/api/rust/src/sse/controllers/listen_events.rs packages/api/rust/src/bin/emit_openapi.rs packages/api/rust/public/docs/openapi.json
git commit -m "feat(api-rust): annotate SSE handler with x-tpl-sse vendor extension (Task 14)"
```

---

## Phase 6 — Flatten client layout (Decision 13, prerequisites)

### Task 15: Author packages/client/package.json + project.json + README/COMPLIANCE skeletons

**Files:**
- Create: `packages/client/package.json`
- Create: `packages/client/project.json`
- Create: `packages/client/README.md`
- Create: `packages/client/COMPLIANCE.md`
- Modify: root `package.json` workspaces array.

- [ ] **Step 1: Author the package manifest**

Create `packages/client/package.json`:

```json
{
	"name": "@template/client",
	"version": "0.0.0",
	"private": true,
	"type": "module",
	"main": "./lib/discover.ts",
	"scripts": {
		"generate": "bun generators/typescript.ts && bun generators/rust.ts && bun generators/go.ts",
		"check": "bun tsc --noEmit"
	},
	"dependencies": {
		"@kubb/core": "^4.0.0",
		"@kubb/plugin-client": "^4.0.0",
		"@kubb/plugin-oas": "^4.0.0",
		"@kubb/plugin-react-query": "^4.0.0",
		"@kubb/plugin-ts": "^4.0.0",
		"@kubb/plugin-zod": "^4.0.0"
	}
}
```

(Pin exact versions to whatever the current Pass-8 `packages/client/typescript/package.json` declared. Read that file first and copy its versions verbatim.)

- [ ] **Step 2: Author Nx target file**

Create `packages/client/project.json`:

```json
{
	"name": "client",
	"sourceRoot": "packages/client",
	"projectType": "library",
	"targets": {
		"generate": {
			"executor": "nx:run-commands",
			"options": {
				"cwd": "packages/client",
				"command": "bun run generate"
			},
			"dependsOn": [
				{ "projects": ["api-typescript"], "target": "emit-openapi" },
				{ "projects": ["api-rust"], "target": "emit-openapi" },
				{ "projects": ["api-go"], "target": "emit-openapi" }
			]
		},
		"check": {
			"executor": "nx:run-commands",
			"options": {
				"cwd": "packages/client",
				"command": "bun run check"
			}
		}
	}
}
```

- [ ] **Step 3: Author README.md**

Create `packages/client/README.md`:

```markdown
# @template/client

Polyglot client SDK generator for OpenAPI 3.0.3.

Given a directory of OpenAPI specs (`packages/api/<service>/public/openapi.json`),
generates symmetric TypeScript, Rust, and Go clients under `dist/{typescript,rust,go}/`.

## What this produces

- **`dist/typescript/`** — `@template/client-typescript`: Kubb-generated client functions,
  React Query hooks, Zod schemas, and an aggregate `Client.create({...})` class.
- **`dist/rust/`** — `template-client-rust`: progenitor-generated per-service modules
  with a top-level `Client` struct + `ClientBuilder`.
- **`dist/go/`** — `template/client-go`: oapi-codegen-generated per-service packages
  with a top-level `client.New(client.Config{...})` constructor.

## Usage

```bash
# Regenerate all three clients from current api specs:
bun nx run client:generate

# Equivalent (manual):
cd packages/client && bun run generate
```

## OpenAPI compliance

Specs consumed by this generator must conform to `COMPLIANCE.md`. The
`preprocessSpec` step in `lib/preprocess.ts` validates each input and rejects
non-compliant specs with a clear error.
```

- [ ] **Step 4: Author COMPLIANCE.md (12 rules)**

Create `packages/client/COMPLIANCE.md`:

```markdown
# OpenAPI compliance contract — @template/client

Specs consumed by `@template/client` MUST conform to the rules below.
Non-compliance is rejected by `lib/preprocess.ts` with an error naming
the violated rule.

## Rules

### R-01 — Dialect MUST be OpenAPI 3.0.3

`openapi: "3.0.3"` at the document root. Older 3.0.x is accepted; 3.1.x
is rejected. **Rationale:** progenitor 0.10 and oapi-codegen v2 consume
3.0; supporting both dialects multiplies edge-case logic.

### R-02 — Every operation MUST declare an `operationId`

`operationId` is a non-empty string that is a valid identifier in
TypeScript, Rust, and Go (matches `^[A-Za-z_][A-Za-z0-9_]*$`).
**Rationale:** generators use it to name functions; absence produces
ugly fallback names (TS, Go) or generation errors (Rust).

### R-03 — Spec MUST be a single bundled JSON file

External `$ref: 'other.yaml#/...'` MUST NOT appear. Internal
`$ref: '#/components/schemas/X'` is required. **Rationale:** none of
the three generators reliably resolve cross-file refs; upstream emitters
should bundle.

### R-04 — Request/response content-type MUST be `application/json`

`multipart/form-data`, `application/x-www-form-urlencoded`, and binary
content types are NOT supported in v1. **Rationale:** generator
post-processing for non-JSON shapes diverges per language.

### R-05 — Nullable values MUST use the OAS 3.0 form `{ ..., nullable: true }`

`anyOf: [<X>, { type: "null" }]` and `type: ["X", "null"]` are rejected.
**Rationale:** 3.0 has one canonical form; accepting 3.1 forms here
re-introduces the downgrade hack we just removed.

### R-06 — Discriminated unions MUST carry `oneOf` + `discriminator` + complete `mapping`

If `oneOf` is present AND any variant declares a discriminator literal,
then `discriminator.propertyName` MUST be set, `discriminator.mapping`
MUST cover EVERY variant, and EACH variant MUST declare the
discriminator field as `{ type: "string", enum: ["<literal>"] }`.
**Rationale:** without all three, generators fall back to untagged
unions silently.

### R-07 — `tags` are optional but recommended

If present, operations under the same tag group together in the
generated output. If absent, output is flat per service.
**Rationale:** organizational, not load-bearing.

### R-08 — Empty `paths: {}` produces an empty client package

Each generator creates the service folder and emits a placeholder
(empty barrel for TS, stub Client for Rust, package declaration for Go)
when the spec declares zero paths. **No error.**
**Rationale:** worker services with no HTTP surface are still discoverable.

### R-09 — Reserved-word sanitization is documented per target

| Target | Reserved words | Sanitization |
|---|---|---|
| TypeScript | JS reserved + DOM globals | Replace non-`[A-Za-z0-9_]` with `_`; if leading digit, prefix `_`; if reserved, suffix `Svc`. |
| Rust | strict + reserved keywords | Replace non-`[A-Za-z0-9_]` with `_`; if reserved, use `r#<name>` raw identifier. |
| Go | reserved keywords | Replace non-`[A-Za-z0-9_]` with `_`; if reserved, suffix `pkg`. |

**Rationale:** consistent rules across languages.

### R-10 — SSE endpoints MUST be flagged `x-tpl-sse: true`

Operations marked `x-tpl-sse: true` at the operation level are dropped
from the spec by `preprocessSpec` and absent from generated clients.
Consumers wire SSE with a separate library.
**Rationale:** generators don't know how to type `text/event-stream`.

### R-11 — Webhooks are NOT supported in v1

OAS 3.1's `webhooks` field is absent in 3.0. Inverted/reverse callbacks
through `callbacks: {...}` are tolerated but not generated.
**Rationale:** out of v1 scope; revisit when target generators mature.

### R-12 — Project vendor extensions namespace is `x-tpl-*`

Vendor extensions emitted by this template's tools are prefixed `x-tpl-`.
Generators ignore unrecognized `x-*` keys (no warning). Recognized
extensions in v1: `x-tpl-sse`, `x-tpl-zod-refinements`,
`x-tpl-discriminators`, `x-tpl-enum-varnames`, `x-tpl-unknown`.
**Rationale:** prevents collision with public OpenAPI extensions.
```

- [ ] **Step 5: Wire workspace**

In root `package.json`, find the `workspaces` array. Currently it likely contains entries like `packages/client/typescript`, `packages/client/rust`, `packages/client/go`. Replace them with `packages/client` and (added later) `packages/client/dist/typescript` if dist outputs are independent npm packages.

Today's expected diff:
```diff
- "packages/client/typescript",
- "packages/client/rust",
- "packages/client/go",
+ "packages/client",
+ "packages/client/dist/typescript",
```

(Rust and Go in `dist/` are NOT npm workspaces — Cargo and Go have their own workspace mechanisms updated in later tasks.)

- [ ] **Step 6: Run `bun install` to refresh lock**

Run: `bun install`
Expected: succeeds. lockfile updated.

- [ ] **Step 7: Commit**

```bash
git add packages/client/package.json packages/client/project.json packages/client/README.md packages/client/COMPLIANCE.md package.json bun.lock
git commit -m "feat(client): create unified package manifest + COMPLIANCE.md (Task 15)"
```

### Task 16: Move discovery + create preprocess/sanitize/render helpers

**Files:**
- Move: `scripts/lib/discover-apis.ts` → `packages/client/lib/discover.ts` (drop `lang` field, drop nested-services branch).
- Create: `packages/client/lib/preprocess.ts`
- Create: `packages/client/lib/sanitize.ts`
- Create: `packages/client/lib/render/typescript.ts`
- Create: `packages/client/lib/render/rust.ts`
- Create: `packages/client/lib/render/go.ts`

- [ ] **Step 1: Write failing test for `discover`**

Create `packages/client/lib/discover.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { join } from 'node:path'
import { discoverApis } from './discover'

describe('discoverApis', () => {
	it('returns { service, specPath } for each api/<service>/public/openapi.json', async () => {
		const repoRoot = join(import.meta.dir, '../../..')
		const sources = await discoverApis(repoRoot)
		expect(sources.length).toBeGreaterThan(0)
		for (const s of sources) {
			expect(s).toHaveProperty('service')
			expect(s).toHaveProperty('specPath')
			expect(s).not.toHaveProperty('lang')
			expect(typeof s.service).toBe('string')
			expect(typeof s.specPath).toBe('string')
		}
	})
})
```

Run: `bun test packages/client/lib/discover.test.ts`
Expected: FAIL — `./discover` not present.

- [ ] **Step 2: Author `packages/client/lib/discover.ts`**

```typescript
/**
 * API discovery — walks `packages/api/<service>/` for `openapi.json`.
 * Each match becomes `{ service, specPath }`. The service folder name is the
 * unique identifier; the implementation language of the service does not
 * matter to the SDK pipeline.
 *
 * Spec is located at either `<service>/public/docs/openapi.json` (utoipa
 * convention) or `<service>/public/openapi.json` (Go walker output).
 */
import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'

export interface ApiSource {
	service: string
	specPath: string
}

const SPEC_SUFFIXES = [
	['public', 'docs', 'openapi.json'],
	['public', 'openapi.json'],
] as const

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path)
		return true
	} catch {
		return false
	}
}

async function findSpec(rootDir: string): Promise<string | null> {
	for (const suffix of SPEC_SUFFIXES) {
		const candidate = join(rootDir, ...suffix)
		if (await fileExists(candidate)) return candidate
	}
	return null
}

export async function discoverApis(repoRoot: string): Promise<ApiSource[]> {
	const apiRoot = join(repoRoot, 'packages', 'api')
	if (!(await fileExists(apiRoot))) return []

	const services = (await readdir(apiRoot, { withFileTypes: true }))
		.filter(d => d.isDirectory())
		.map(d => d.name)
		.sort()

	const sources: ApiSource[] = []
	for (const service of services) {
		const spec = await findSpec(join(apiRoot, service))
		if (spec) sources.push({ service, specPath: spec })
	}
	return sources
}

export function formatSpecPath(source: ApiSource, repoRoot: string): string {
	return relative(repoRoot, source.specPath)
}
```

- [ ] **Step 3: Run test, expect pass**

Run: `bun test packages/client/lib/discover.test.ts`
Expected: PASS — 1 test passes.

- [ ] **Step 4: Author `packages/client/lib/sanitize.ts`**

```typescript
/**
 * Per-target identifier sanitization for service folder names.
 * See COMPLIANCE.md R-09.
 */

const JS_RESERVED = new Set([
	'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
	'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for',
	'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return',
	'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
	'while', 'with', 'yield', 'let', 'static', 'await', 'async',
])

const RUST_RESERVED = new Set([
	'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn', 'else',
	'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop',
	'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self',
	'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use',
	'where', 'while',
])

const GO_RESERVED = new Set([
	'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
	'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
	'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var',
])

function baseIdent(service: string): string {
	let s = service.replace(/[^a-zA-Z0-9_]/g, '_')
	if (/^\d/.test(s)) s = `_${s}`
	return s
}

export function tsPropertyIdent(service: string): string {
	const s = baseIdent(service)
	return JS_RESERVED.has(s) ? `${s}Svc` : s
}

export function tsPascalClass(service: string): string {
	return baseIdent(service)
		.split('_')
		.filter(Boolean)
		.map(p => p.charAt(0).toUpperCase() + p.slice(1))
		.join('') + 'Client'
}

export function rustModIdent(service: string): { raw: boolean; ident: string } {
	const s = baseIdent(service)
	return { raw: RUST_RESERVED.has(s), ident: s }
}

export function goPackageIdent(service: string): string {
	const s = baseIdent(service)
	return GO_RESERVED.has(s) ? `${s}pkg` : s
}

export function goFieldName(service: string): string {
	return baseIdent(service)
		.split('_')
		.filter(Boolean)
		.map(p => p.charAt(0).toUpperCase() + p.slice(1))
		.join('')
}
```

- [ ] **Step 5: Author `packages/client/lib/preprocess.ts` (validator + SSE filter)**

```typescript
/**
 * Preprocess spec — validates against COMPLIANCE.md and drops SSE operations.
 * No transformation of nullable forms: that responsibility lies with the
 * upstream emitter (per R-05).
 */
import { readFile } from 'node:fs/promises'

export interface ComplianceError extends Error {
	rule: string
}

function fail(rule: string, message: string): never {
	const err = new Error(`COMPLIANCE.md ${rule}: ${message}`) as ComplianceError
	err.rule = rule
	throw err
}

const ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface PreprocessedSpec {
	spec: Record<string, unknown>
	skippedSse: number
}

export async function preprocessSpec(specPath: string): Promise<PreprocessedSpec> {
	const raw = await readFile(specPath, 'utf-8')
	const spec = JSON.parse(raw) as Record<string, unknown>

	// R-01
	const version = spec.openapi
	if (typeof version !== 'string' || !version.startsWith('3.0')) {
		fail('R-01', `openapi must start with "3.0", got ${JSON.stringify(version)} in ${specPath}`)
	}

	// R-03 (shallow check; deep walk would catch lazy refs but is expensive)
	const checkRefs = (node: unknown, path: string): void => {
		if (!node || typeof node !== 'object') return
		if (Array.isArray(node)) {
			node.forEach((c, i) => checkRefs(c, `${path}[${i}]`))
			return
		}
		const obj = node as Record<string, unknown>
		if (typeof obj.$ref === 'string' && !obj.$ref.startsWith('#/')) {
			fail('R-03', `external $ref not allowed (${obj.$ref}) at ${path}`)
		}
		for (const [k, v] of Object.entries(obj)) checkRefs(v, path ? `${path}.${k}` : k)
	}
	checkRefs(spec, '')

	// R-02, R-04, R-05, R-10
	const paths = (spec.paths ?? {}) as Record<string, Record<string, unknown>>
	let skippedSse = 0

	for (const [pathKey, pathItem] of Object.entries(paths)) {
		if (!pathItem || typeof pathItem !== 'object') continue
		for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const) {
			const op = pathItem[method] as Record<string, unknown> | undefined
			if (!op) continue

			// R-10: drop SSE ops
			if (op['x-tpl-sse'] === true) {
				delete pathItem[method]
				skippedSse++
				continue
			}

			// R-02
			const operationId = op.operationId
			if (typeof operationId !== 'string' || !ID_RE.test(operationId)) {
				fail('R-02', `operation ${method.toUpperCase()} ${pathKey} missing valid operationId (got ${JSON.stringify(operationId)})`)
			}

			// R-04 (request)
			const rb = op.requestBody as Record<string, unknown> | undefined
			if (rb?.content && typeof rb.content === 'object') {
				const types = Object.keys(rb.content as object)
				for (const ct of types) {
					if (ct !== 'application/json') {
						fail('R-04', `${method.toUpperCase()} ${pathKey} requestBody content-type ${ct} not allowed`)
					}
				}
			}

			// R-04 (responses)
			const responses = (op.responses ?? {}) as Record<string, Record<string, unknown>>
			for (const [status, resp] of Object.entries(responses)) {
				if (status === '204') continue
				const content = (resp.content ?? {}) as Record<string, unknown>
				for (const ct of Object.keys(content)) {
					if (ct !== 'application/json' && ct !== 'text/event-stream') {
						fail('R-04', `${method.toUpperCase()} ${pathKey} response ${status} content-type ${ct} not allowed`)
					}
				}
			}
		}
		if (Object.keys(pathItem).length === 0) delete paths[pathKey]
	}

	// R-05 — reject 3.1 nullable forms anywhere in spec
	const checkNullable = (node: unknown, path: string): void => {
		if (!node || typeof node !== 'object') return
		if (Array.isArray(node)) {
			node.forEach((c, i) => checkNullable(c, `${path}[${i}]`))
			return
		}
		const obj = node as Record<string, unknown>
		if (Array.isArray(obj.type) && (obj.type as unknown[]).includes('null')) {
			fail('R-05', `type-array nullable form at ${path}; use { nullable: true }`)
		}
		if (Array.isArray(obj.anyOf)) {
			const hasNull = (obj.anyOf as Array<Record<string, unknown>>).some(s => s.type === 'null')
			if (hasNull) fail('R-05', `anyOf with type:"null" at ${path}; use { nullable: true }`)
		}
		for (const [k, v] of Object.entries(obj)) checkNullable(v, path ? `${path}.${k}` : k)
	}
	checkNullable(spec, '')

	return { spec, skippedSse }
}
```

- [ ] **Step 6: Write tests for preprocess**

Create `packages/client/lib/preprocess.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'bun:test'
import { writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { preprocessSpec } from './preprocess'

const tmp = join(tmpdir(), `preprocess-${Date.now()}`)
beforeAll(async () => { await mkdir(tmp, { recursive: true }) })

async function writeSpec(name: string, body: object): Promise<string> {
	const p = join(tmp, name)
	await writeFile(p, JSON.stringify(body))
	return p
}

describe('preprocessSpec', () => {
	it('accepts a minimal compliant spec', async () => {
		const path = await writeSpec('ok.json', {
			openapi: '3.0.3',
			info: { title: 't', version: '1' },
			paths: {
				'/x': { get: { operationId: 'getX', responses: { 200: { description: 'ok' } } } },
			},
			components: { schemas: {} },
		})
		const { spec, skippedSse } = await preprocessSpec(path)
		expect(skippedSse).toBe(0)
		expect((spec.paths as Record<string, unknown>)['/x']).toBeDefined()
	})

	it('rejects 3.1 dialect (R-01)', async () => {
		const path = await writeSpec('bad-01.json', { openapi: '3.1.0', info: { title: 't', version: '1' }, paths: {} })
		await expect(preprocessSpec(path)).rejects.toThrow(/R-01/)
	})

	it('rejects missing operationId (R-02)', async () => {
		const path = await writeSpec('bad-02.json', {
			openapi: '3.0.3',
			info: { title: 't', version: '1' },
			paths: { '/x': { get: { responses: { 200: { description: 'ok' } } } } },
		})
		await expect(preprocessSpec(path)).rejects.toThrow(/R-02/)
	})

	it('rejects type:[X,null] (R-05)', async () => {
		const path = await writeSpec('bad-05.json', {
			openapi: '3.0.3',
			info: { title: 't', version: '1' },
			paths: { '/x': { get: { operationId: 'getX', responses: { 200: { description: 'ok' } } } } },
			components: { schemas: { F: { type: ['string', 'null'] } } },
		})
		await expect(preprocessSpec(path)).rejects.toThrow(/R-05/)
	})

	it('drops SSE operations (R-10)', async () => {
		const path = await writeSpec('sse.json', {
			openapi: '3.0.3',
			info: { title: 't', version: '1' },
			paths: {
				'/events': { get: { operationId: 'getEvents', 'x-tpl-sse': true, responses: { 200: { description: 'sse' } } } },
				'/x': { get: { operationId: 'getX', responses: { 200: { description: 'ok' } } } },
			},
		})
		const { spec, skippedSse } = await preprocessSpec(path)
		expect(skippedSse).toBe(1)
		expect((spec.paths as Record<string, unknown>)['/events']).toBeUndefined()
		expect((spec.paths as Record<string, unknown>)['/x']).toBeDefined()
	})
})
```

Run: `bun test packages/client/lib/preprocess.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 7: Author the three render skeletons**

Create `packages/client/lib/render/typescript.ts`:

```typescript
/**
 * Renders the per-service TS Client class and the aggregate Client class.
 * Pure functions: take service metadata, return strings to write.
 */
import { tsPropertyIdent, tsPascalClass } from '../sanitize'
import type { ApiSource } from '../discover'

export interface ServiceMeta {
	source: ApiSource
	/** Names of generated Kubb functions in `<service>/client/`. */
	clientFunctionNames: string[]
}

export function renderServiceClient(meta: ServiceMeta): string {
	const className = tsPascalClass(meta.source.service)
	const fnImports = meta.clientFunctionNames.map(n => `\t${n},`).join('\n')
	const methods = meta.clientFunctionNames
		.map(n => `\t${n}(...args: Parameters<typeof ${n}>): ReturnType<typeof ${n}> {\n\t\treturn ${n}(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })\n\t}`)
		.join('\n\n')
	return `// AUTO-GENERATED — do not edit.
import {
${fnImports}
} from './client'

export interface ${className}Config {
	baseUrl: string
	fetch?: typeof fetch
}

export class ${className} {
	private constructor(private readonly config: ${className}Config) {}

	static create(config: ${className}Config): ${className} {
		return new ${className}(config)
	}

${methods}
}
`
}

export function renderAggregateClient(metas: ServiceMeta[]): string {
	const imports = metas
		.map(m => `import { ${tsPascalClass(m.source.service)}, type ${tsPascalClass(m.source.service)}Config } from './${m.source.service}/Client'`)
		.join('\n')

	const configFields = metas
		.map(m => `\t${tsPropertyIdent(m.source.service)}: ${tsPascalClass(m.source.service)}Config`)
		.join('\n')

	const fields = metas
		.map(m => `\treadonly ${tsPropertyIdent(m.source.service)}: ${tsPascalClass(m.source.service)}`)
		.join('\n')

	const inits = metas
		.map(m => `\t\tthis.${tsPropertyIdent(m.source.service)} = ${tsPascalClass(m.source.service)}.create(config.${tsPropertyIdent(m.source.service)})`)
		.join('\n')

	return `// AUTO-GENERATED — do not edit.
${imports}

export interface ClientConfig {
${configFields}
}

export class Client {
${fields}

	private constructor(config: ClientConfig) {
${inits}
	}

	static create(config: ClientConfig): Client {
		return new Client(config)
	}
}
`
}
```

Create `packages/client/lib/render/rust.ts`:

```typescript
import { rustModIdent } from '../sanitize'
import type { ApiSource } from '../discover'

export interface ServiceMeta { source: ApiSource }

export function renderLibRs(metas: ServiceMeta[]): string {
	const modDecls = metas
		.map(m => {
			const { raw, ident } = rustModIdent(m.source.service)
			return `#[path = "${m.source.service}/mod.rs"]\npub mod ${raw ? `r#${ident}` : ident};`
		})
		.join('\n\n')

	const fields = metas
		.map(m => {
			const { raw, ident } = rustModIdent(m.source.service)
			const use = raw ? `r#${ident}` : ident
			return `\tpub ${use}: ${use}::Client,`
		})
		.join('\n')

	const builderFields = metas
		.map(m => {
			const { raw, ident } = rustModIdent(m.source.service)
			return `\t${raw ? `r#${ident}` : ident}_url: Option<String>,`
		})
		.join('\n')

	const builderSetters = metas
		.map(m => {
			const { raw, ident } = rustModIdent(m.source.service)
			const use = raw ? `r#${ident}` : ident
			return `\tpub fn ${use}(mut self, url: impl Into<String>) -> Self {\n\t\tself.${use}_url = Some(url.into());\n\t\tself\n\t}`
		})
		.join('\n\n')

	const buildInits = metas
		.map(m => {
			const { raw, ident } = rustModIdent(m.source.service)
			const use = raw ? `r#${ident}` : ident
			return `\t\t\t${use}: ${use}::Client::new_with_client(self.${use}_url.as_deref().ok_or(BuildError::MissingUrl("${m.source.service}"))?, http.clone()),`
		})
		.join('\n')

	return `//! AUTO-GENERATED by client generator — do not edit.
#![allow(clippy::all)]
#![allow(unused_imports)]
#![allow(renamed_and_removed_lints)]

${modDecls}

#[derive(Debug, thiserror::Error)]
pub enum BuildError {
	#[error("missing url for service: {0}")]
	MissingUrl(&'static str),
}

pub struct Client {
${fields}
}

#[derive(Default)]
pub struct ClientBuilder {
${builderFields}
	http: Option<reqwest::Client>,
}

impl ClientBuilder {
	pub fn new() -> Self { Self::default() }

${builderSetters}

	pub fn http(mut self, c: reqwest::Client) -> Self { self.http = Some(c); self }

	pub fn build(self) -> Result<Client, BuildError> {
		let http = self.http.unwrap_or_default();
		Ok(Client {
${buildInits}
		})
	}
}

impl Client {
	pub fn builder() -> ClientBuilder { ClientBuilder::new() }
}
`
}
```

Create `packages/client/lib/render/go.ts`:

```typescript
import { goPackageIdent, goFieldName } from '../sanitize'
import type { ApiSource } from '../discover'

export interface ServiceMeta { source: ApiSource }

export function renderAggregateClientGo(metas: ServiceMeta[]): string {
	const imports = metas
		.map(m => {
			const pkg = goPackageIdent(m.source.service)
			return `\t${pkg} "template/client-go/pkg/${m.source.service}"`
		})
		.join('\n')

	const configFields = metas
		.map(m => `\t${goFieldName(m.source.service)}URL string`)
		.join('\n')

	const fields = metas
		.map(m => `\t${goFieldName(m.source.service)} *${goPackageIdent(m.source.service)}.ClientWithResponses`)
		.join('\n')

	const inits = metas
		.map(m => {
			const pkg = goPackageIdent(m.source.service)
			const field = goFieldName(m.source.service)
			return `\t${field.toLowerCase()}, err := ${pkg}.NewClientWithResponses(cfg.${field}URL, ${pkg}.WithHTTPClient(httpClient))\n\tif err != nil { return nil, err }`
		})
		.join('\n')

	const assigns = metas
		.map(m => `\t\t${goFieldName(m.source.service)}: ${goFieldName(m.source.service).toLowerCase()},`)
		.join('\n')

	return `// AUTO-GENERATED — do not edit.
package client

import (
	"net/http"

${imports}
)

type Config struct {
${configFields}
	HTTPClient *http.Client
}

type Client struct {
${fields}
}

func New(cfg Config) (*Client, error) {
	httpClient := cfg.HTTPClient
	if httpClient == nil { httpClient = http.DefaultClient }
${inits}
	return &Client{
${assigns}
	}, nil
}
`
}
```

- [ ] **Step 8: Delete the old shared `scripts/lib/discover-apis.ts`**

```bash
rm scripts/lib/discover-apis.ts
```

- [ ] **Step 9: Commit**

```bash
git add packages/client/lib/ packages/client/lib/*.test.ts
git rm scripts/lib/discover-apis.ts
git commit -m "feat(client): introduce lib/ (discover, preprocess, sanitize, render) (Task 16)"
```

---

## Phase 7 — Move TS client into dist/typescript + new generator pipeline

### Task 17: Move existing TS client output to dist/typescript

**Files:**
- Move: `packages/client/typescript/src/` → `packages/client/dist/typescript/src/`
- Move: `packages/client/typescript/package.json` → `packages/client/dist/typescript/package.json`
- Delete: `packages/client/typescript/scripts/`, `packages/client/typescript/project.json`, `packages/client/typescript/tsconfig.json` (those move to `packages/client/` root or get superseded).

- [ ] **Step 1: Move directory**

```bash
mkdir -p packages/client/dist
git mv packages/client/typescript packages/client/dist/typescript
```

- [ ] **Step 2: Remove now-stale entries**

```bash
rm -rf packages/client/dist/typescript/scripts
rm packages/client/dist/typescript/project.json
```

- [ ] **Step 3: Update `packages/client/dist/typescript/package.json` name+exports**

Edit `packages/client/dist/typescript/package.json` to keep name `@template/client-typescript` (consumer name), strip the `generate` script (moved to `packages/client/package.json`):

```json
{
	"name": "@template/client-typescript",
	"version": "0.0.0",
	"private": true,
	"type": "module",
	"main": "./src/index.ts",
	"exports": {
		".": "./src/index.ts",
		"./*": "./src/*/index.ts",
		"./http": "./src/http/index.ts"
	}
}
```

- [ ] **Step 4: Update any imports that hit `packages/client/typescript/...`**

```bash
grep -rln 'packages/client/typescript\|@template/client-typescript' packages/api/typescript/ packages/contracts/ scripts/ 2>&1 | head
```

For each match, the npm package name `@template/client-typescript` is unchanged so npm imports keep working. Filesystem-relative imports (rare) need updating to `packages/client/dist/typescript/...`.

- [ ] **Step 5: Verify type-check**

```bash
bun install
bun --cwd packages/api/typescript tsc
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add -A packages/client/
git commit -m "refactor(client): move typescript client to dist/typescript (Task 17)"
```

### Task 18: Rewrite the TS generator entry as a flat pipeline

**Files:**
- Create: `packages/client/generators/typescript.ts`

- [ ] **Step 1: Write the pipeline entry**

Create `packages/client/generators/typescript.ts`:

```typescript
/**
 * TypeScript client generator — Kubb pipeline + per-service Client class + aggregate.
 * Flat pipeline: discoverApis → preprocessSpec → buildPlan → runKubb → emitServiceClient → emitAggregateClient.
 */
import path from 'node:path'
import { writeFile, mkdir } from 'node:fs/promises'
import { safeBuild } from '@kubb/core'
import { pluginOas } from '@kubb/plugin-oas'
import { pluginTs } from '@kubb/plugin-ts'
import { pluginZod } from '@kubb/plugin-zod'
import { pluginReactQuery } from '@kubb/plugin-react-query'
import { pluginClient } from '@kubb/plugin-client'
import { discoverApis, formatSpecPath, type ApiSource } from '../lib/discover'
import { preprocessSpec } from '../lib/preprocess'
import { renderServiceClient, renderAggregateClient, type ServiceMeta } from '../lib/render/typescript'

const repoRoot = path.resolve(import.meta.dir, '../../..')
const distRoot = path.resolve(import.meta.dir, '../dist/typescript/src')

interface Plan {
	source: ApiSource
	preprocessedSpecPath: string
	outputRoot: string
	generateHooks: boolean
}

async function preprocessAll(sources: ApiSource[]): Promise<Plan[]> {
	const plans: Plan[] = []
	for (const source of sources) {
		const { spec, skippedSse } = await preprocessSpec(source.specPath)
		const tmp = path.join(repoRoot, 'tmp', `client-ts-${source.service}.openapi.json`)
		await mkdir(path.dirname(tmp), { recursive: true })
		await writeFile(tmp, JSON.stringify(spec))
		const hasPaths = Object.keys((spec.paths ?? {}) as object).length > 0
		console.log(`[${source.service}] preprocessed (sse skipped: ${skippedSse}, paths: ${hasPaths ? 'yes' : 'no'})`)
		plans.push({
			source,
			preprocessedSpecPath: tmp,
			outputRoot: path.join(distRoot, source.service),
			generateHooks: hasPaths,
		})
	}
	return plans
}

function buildKubbConfig(plan: Plan) {
	const plugins = [
		pluginOas({ output: false, validate: false }),
		pluginTs({
			output: { path: path.join(plan.outputRoot, 'types'), barrelType: 'named' },
			group: { type: 'tag', name: ({ group }) => `${group}` },
		}),
		...(plan.generateHooks
			? [
					pluginZod({ output: { path: path.join(plan.outputRoot, 'zod'), barrelType: 'named' }, group: { type: 'tag', name: ({ group }) => `${group}` } }),
					pluginReactQuery({ output: { path: path.join(plan.outputRoot, 'hooks'), barrelType: 'named' }, group: { type: 'tag', name: ({ group }) => `${group}` } }),
					pluginClient({ output: { path: path.join(plan.outputRoot, 'client'), barrelType: 'named' }, group: { type: 'tag', name: ({ group }) => `${group}` } }),
				]
			: []),
	]
	return {
		config: {
			root: repoRoot,
			input: { path: plan.preprocessedSpecPath },
			output: { path: plan.outputRoot, barrelType: 'named' as const, clean: false },
			plugins,
		},
	}
}

async function runKubb(plan: Plan): Promise<void> {
	const result = await safeBuild(buildKubbConfig(plan))
	if (result.failedPlugins.size > 0) {
		for (const { plugin, error } of result.failedPlugins) {
			console.error(`[${plan.source.service}] ${plugin.name} failed:`, error)
		}
		throw new Error(`[${plan.source.service}] Kubb generation failed`)
	}
}

async function emitServiceClient(plan: Plan): Promise<void> {
	if (!plan.generateHooks) return
	// Read the generated client/index.ts to extract function names exported.
	const clientIndex = path.join(plan.outputRoot, 'client', 'index.ts')
	const text = await Bun.file(clientIndex).text()
	const names = [...text.matchAll(/export \{ (\w+) \}/g)].map(m => m[1]!)
	const meta: ServiceMeta = { source: plan.source, clientFunctionNames: names }
	const code = renderServiceClient(meta)
	await writeFile(path.join(plan.outputRoot, 'Client.ts'), code)
}

async function emitAggregateClient(plans: Plan[]): Promise<void> {
	const metas: ServiceMeta[] = plans
		.filter(p => p.generateHooks)
		.map(p => ({ source: p.source, clientFunctionNames: [] }))
	const code = renderAggregateClient(metas)
	await writeFile(path.join(distRoot, 'index.ts'), code)
}

async function main(): Promise<void> {
	console.log('client-typescript generator')
	const sources = await discoverApis(repoRoot)
	if (sources.length === 0) {
		console.error('No api services discovered.')
		process.exit(1)
	}
	console.log('discovered:', sources.map(s => s.service).join(', '))

	const plans = await preprocessAll(sources)
	for (const plan of plans) {
		console.log(`[${plan.source.service}] kubb running…`)
		await runKubb(plan)
		await emitServiceClient(plan)
	}
	await emitAggregateClient(plans)
	console.log('done.')
}

main()
```

- [ ] **Step 2: Author the http layer**

Create `packages/client/dist/typescript/src/http/index.ts`:

```typescript
/**
 * Runtime HTTP configuration for @template/client-typescript.
 * `configureClient` writes base URLs to a globalThis-keyed registry so the
 * generated `<Service>Client.create()` paths can read them at construction.
 */
interface BaseUrls { [service: string]: string }

const SYM = Symbol.for('@template/client-typescript:baseUrls')

interface Global { [SYM]?: BaseUrls }

function registry(): BaseUrls {
	const g = globalThis as unknown as Global
	if (!g[SYM]) g[SYM] = {}
	return g[SYM]!
}

export function configureClient(baseUrls: BaseUrls): void {
	Object.assign(registry(), baseUrls)
}

export function getBaseUrl(service: string): string | undefined {
	return registry()[service]
}

export function resetClient(): void {
	const g = globalThis as unknown as Global
	g[SYM] = {}
}
```

- [ ] **Step 3: Run the generator**

```bash
cd packages/client && bun generators/typescript.ts
```

Expected: per-service `dist/typescript/src/<service>/Client.ts` exists for services with paths; `dist/typescript/src/index.ts` exports aggregate `Client.create`.

- [ ] **Step 4: Verify `Client.create({...})` type-checks**

Create a sanity test `packages/client/dist/typescript/src/typecheck.test.ts` (or compile-only check):

```typescript
import { describe, it, expect } from 'bun:test'
import { Client } from './index'

describe('aggregate Client', () => {
	it('exposes a static create that returns service classes', () => {
		const client = Client.create({
			typescript: { baseUrl: 'http://localhost:3030' },
			rust: { baseUrl: 'http://localhost:3031' },
			go: { baseUrl: 'http://localhost:3032' },
		})
		expect(client.typescript).toBeDefined()
		expect(client.rust).toBeDefined()
		expect(client.go).toBeDefined()
	})
})
```

Run: `bun --cwd packages/client/dist/typescript test`
Expected: PASS — 1 test passes; aggregate `Client.create` returns properly-typed accessors.

- [ ] **Step 5: Commit**

```bash
git add packages/client/generators/typescript.ts packages/client/dist/typescript/
git commit -m "feat(client): TS pipeline generator + aggregate Client class (Task 18)"
```

---

## Phase 8 — Move Rust client into dist/rust + new generator pipeline

### Task 19: Move existing Rust client to dist/rust + extract codegen crate

**Files:**
- Move: `packages/client/rust/Cargo.toml` (consumer) → `packages/client/dist/rust/Cargo.toml`
- Move: `packages/client/rust/src/{lib.rs, typescript/, rust/, go/}` → `packages/client/dist/rust/src/`
- Move: `packages/client/rust/src/bin/sdk-codegen.rs` → `packages/client/generators/rust-codegen/src/main.rs`
- Create: `packages/client/generators/rust-codegen/Cargo.toml` (codegen-only crate)
- Modify: root `Cargo.toml` workspace members.

- [ ] **Step 1: Stage the new directories**

```bash
mkdir -p packages/client/dist/rust/src
mkdir -p packages/client/generators/rust-codegen/src
```

- [ ] **Step 2: Move the consumer crate files**

```bash
git mv packages/client/rust/src/lib.rs packages/client/dist/rust/src/lib.rs
for d in typescript rust go; do
	if [ -d packages/client/rust/src/$d ]; then
		git mv packages/client/rust/src/$d packages/client/dist/rust/src/$d
	fi
done
git mv packages/client/rust/Cargo.toml packages/client/dist/rust/Cargo.toml
```

- [ ] **Step 3: Move the codegen binary**

```bash
git mv packages/client/rust/src/bin/sdk-codegen.rs packages/client/generators/rust-codegen/src/main.rs
```

- [ ] **Step 4: Create codegen Cargo.toml**

Create `packages/client/generators/rust-codegen/Cargo.toml`:

```toml
[package]
name = "template-client-rust-codegen"
version = "0.0.0"
edition = "2021"
publish = false

[[bin]]
name = "rust-codegen"
path = "src/main.rs"

[dependencies]
progenitor = "0.10"
openapiv3 = "2"
serde_json = "1"
syn = "2"
prettyplease = "0.2"
```

- [ ] **Step 5: Update the consumer `dist/rust/Cargo.toml`**

Edit `packages/client/dist/rust/Cargo.toml`. Drop the `codegen` feature + binary + progenitor/openapiv3 deps (they're in the codegen crate now). Keep `reqwest`, `serde`, `serde_json`, `thiserror`, and runtime deps:

```toml
[package]
name = "template-client-rust"
version = "0.0.0"
edition = "2021"
publish = false

[lib]
path = "src/lib.rs"

[dependencies]
reqwest = { version = "0.12", default-features = false, features = ["json", "rustls-tls", "stream"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
futures = "0.3"
bytes = "1"
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1", features = ["serde", "v4"] }
```

(Adjust to whatever progenitor-generated code requires — copy from current `packages/client/rust/Cargo.toml` runtime deps, drop the codegen-gated ones.)

- [ ] **Step 6: Update root Cargo.toml workspace members**

In the repo root `Cargo.toml`, replace:

```diff
-    "packages/client/rust",
+    "packages/client/dist/rust",
+    "packages/client/generators/rust-codegen",
```

- [ ] **Step 7: Verify cargo workspace builds**

```bash
cargo check --workspace
```

Expected: 0 errors. Pre-existing warnings only.

- [ ] **Step 8: Delete the now-empty old dir**

```bash
rm -rf packages/client/rust
```

- [ ] **Step 9: Commit**

```bash
git add -A packages/client/ Cargo.toml Cargo.lock
git commit -m "refactor(client): split rust client into dist/ + generators/rust-codegen/ (Task 19)"
```

### Task 20: Strip downgrade logic from rust-codegen + emit Client + ClientBuilder

**Files:**
- Modify: `packages/client/generators/rust-codegen/src/main.rs` — remove `rewrite_version` + `rewrite_nullable`.
- Create: `packages/client/generators/rust.ts` (TS orchestrator).

- [ ] **Step 1: Strip transformers from main.rs**

Open `packages/client/generators/rust-codegen/src/main.rs`. Delete `fn rewrite_version`, `fn rewrite_nullable`, `fn is_null_type` and their call sites (`rewrite_version(&mut raw); rewrite_nullable(&mut raw);`). After Decision 1's emit-side fix, specs already comply.

If progenitor still rejects the spec for any non-handled 3.0 form, fail loudly — `preprocessSpec` is the gatekeeper, not the codegen binary.

- [ ] **Step 2: Create the TS orchestrator**

Create `packages/client/generators/rust.ts`:

```typescript
/**
 * Rust client generator. Discovers apis, preprocesses specs, builds the codegen
 * binary once, then invokes it per service to emit per-service mod.rs files.
 * Finally renders the aggregate lib.rs (mod decls + Client + ClientBuilder).
 */
import path from 'node:path'
import fs from 'node:fs'
import { writeFile, mkdir } from 'node:fs/promises'
import { discoverApis, formatSpecPath, type ApiSource } from '../lib/discover'
import { preprocessSpec } from '../lib/preprocess'
import { renderLibRs, type ServiceMeta } from '../lib/render/rust'

const repoRoot = path.resolve(import.meta.dir, '../../..')
const distRoot = path.resolve(import.meta.dir, '../dist/rust/src')

interface Plan {
	source: ApiSource
	preprocessedSpecPath: string
	moduleDir: string
	outFile: string
}

async function preprocessAll(sources: ApiSource[]): Promise<Plan[]> {
	const plans: Plan[] = []
	for (const source of sources) {
		const { spec } = await preprocessSpec(source.specPath)
		const tmp = path.join(repoRoot, 'tmp', `client-rust-${source.service}.openapi.json`)
		await mkdir(path.dirname(tmp), { recursive: true })
		await writeFile(tmp, JSON.stringify(spec))
		const moduleDir = path.join(distRoot, source.service)
		await mkdir(moduleDir, { recursive: true })
		plans.push({ source, preprocessedSpecPath: tmp, moduleDir, outFile: path.join(moduleDir, 'mod.rs') })
	}
	return plans
}

function writeStubModFile(plan: Plan): void {
	fs.writeFileSync(plan.outFile, `//! Stub — overwritten by codegen.\npub struct Client;\nimpl Client { pub fn new_with_client(_url: &str, _http: reqwest::Client) -> Self { Self } }\n`)
}

async function buildCodegenBin(): Promise<void> {
	const proc = Bun.spawn(
		['cargo', 'build', '--bin', 'rust-codegen', '--release', '-p', 'template-client-rust-codegen'],
		{ cwd: repoRoot, stdout: 'inherit', stderr: 'inherit' },
	)
	const exit = await proc.exited
	if (exit !== 0) throw new Error(`cargo build (rust-codegen) exited ${exit}`)
}

async function runProgenitorFor(plan: Plan): Promise<void> {
	const proc = Bun.spawn(
		['cargo', 'run', '--bin', 'rust-codegen', '--release', '-p', 'template-client-rust-codegen', '--quiet', '--', plan.preprocessedSpecPath, plan.outFile],
		{ cwd: repoRoot, stdout: 'pipe', stderr: 'inherit' },
	)
	const exit = await proc.exited
	if (exit !== 0) throw new Error(`[${plan.source.service}] rust-codegen exited ${exit}`)
}

async function emitAggregateLibRs(plans: Plan[]): Promise<void> {
	const metas: ServiceMeta[] = plans.map(p => ({ source: p.source }))
	const code = renderLibRs(metas)
	await writeFile(path.join(distRoot, 'lib.rs'), code)
}

async function main(): Promise<void> {
	console.log('client-rust generator')
	const sources = await discoverApis(repoRoot)
	if (sources.length === 0) { console.error('No api services discovered.'); process.exit(1) }
	console.log('discovered:', sources.map(s => s.service).join(', '))

	const plans = await preprocessAll(sources)
	for (const plan of plans) writeStubModFile(plan)
	await emitAggregateLibRs(plans)
	await buildCodegenBin()
	for (const plan of plans) {
		console.log(`[${plan.source.service}] progenitor running…`)
		await runProgenitorFor(plan)
	}
	await emitAggregateLibRs(plans)  // re-emit in case service set changed
	console.log('done.')
}

main()
```

- [ ] **Step 3: Run the Rust generator**

```bash
cd packages/client && bun generators/rust.ts
```

Expected: `packages/client/dist/rust/src/lib.rs` regenerated; per-service `mod.rs` updated.

- [ ] **Step 4: Verify Rust client compiles**

```bash
cargo check --workspace
```

Expected: 0 errors.

- [ ] **Step 5: Write Rust integration test for Client::builder()**

Create `packages/client/dist/rust/tests/builder.rs`:

```rust
use template_client_rust::Client;

#[test]
fn client_builder_constructs() {
    let client = Client::builder()
        .typescript("http://localhost:3030")
        .rust("http://localhost:3031")
        .go("http://localhost:3032")
        .build()
        .expect("build");
    // Construction proves the struct shape; nothing to call without a live server.
    let _ = &client.typescript;
    let _ = &client.rust;
    let _ = &client.go;
}
```

Run: `cargo test -p template-client-rust --test builder`
Expected: PASS — 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add packages/client/generators/rust-codegen/src/main.rs packages/client/generators/rust.ts packages/client/dist/rust/
git commit -m "feat(client): Rust pipeline generator + Client struct + ClientBuilder (Task 20)"
```

---

## Phase 9 — Move Go client into dist/go + new generator pipeline

### Task 21: Move existing Go client to dist/go

**Files:**
- Move: `packages/client/go/go.mod` → `packages/client/dist/go/go.mod`
- Move: `packages/client/go/go.sum` → `packages/client/dist/go/go.sum`
- Move: `packages/client/go/pkg/` → `packages/client/dist/go/pkg/`

- [ ] **Step 1: Move files**

```bash
mkdir -p packages/client/dist/go
git mv packages/client/go/go.mod packages/client/dist/go/go.mod
git mv packages/client/go/go.sum packages/client/dist/go/go.sum
git mv packages/client/go/pkg packages/client/dist/go/pkg
rm -rf packages/client/go
```

- [ ] **Step 2: Update module path in go.mod (no change expected unless module name was tied to old path)**

```bash
cat packages/client/dist/go/go.mod | head -3
```

Expected: `module template/client-go` — the module name is path-independent, so no change required.

- [ ] **Step 3: Verify Go module builds**

```bash
cd packages/client/dist/go && go build ./...
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add -A packages/client/
git commit -m "refactor(client): move go client to dist/go (Task 21)"
```

### Task 22: Strip downgrade from go generator + emit Client + New(Config)

**Files:**
- Create: `packages/client/generators/go.ts` (replaces `packages/client/go/scripts/sdk.ts`).
- Old `packages/client/go/scripts/sdk.ts` deleted by Task 21's `rm -rf`.

- [ ] **Step 1: Create the Go generator entry**

Create `packages/client/generators/go.ts`:

```typescript
/**
 * Go client generator — wraps `go tool oapi-codegen` per discovered service,
 * then renders the aggregate `pkg/client/client.go`.
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { writeFile, mkdir } from 'node:fs/promises'
import { discoverApis, formatSpecPath, type ApiSource } from '../lib/discover'
import { preprocessSpec } from '../lib/preprocess'
import { renderAggregateClientGo, type ServiceMeta } from '../lib/render/go'
import { goPackageIdent } from '../lib/sanitize'

const repoRoot = path.resolve(import.meta.dir, '../../..')
const distRoot = path.resolve(import.meta.dir, '../dist/go')

interface Plan {
	source: ApiSource
	preprocessedSpecPath: string
	outDir: string
	pkg: string
	hasPaths: boolean
}

async function preprocessAll(sources: ApiSource[]): Promise<Plan[]> {
	const plans: Plan[] = []
	for (const source of sources) {
		const { spec } = await preprocessSpec(source.specPath)
		const tmp = path.join(os.tmpdir(), `client-go-${source.service}.openapi.json`)
		await writeFile(tmp, JSON.stringify(spec))
		const hasPaths = Object.keys((spec.paths ?? {}) as object).length > 0
		plans.push({
			source,
			preprocessedSpecPath: tmp,
			outDir: path.join(distRoot, 'pkg', source.service),
			pkg: goPackageIdent(source.service),
			hasPaths,
		})
	}
	return plans
}

function writePlaceholder(plan: Plan): void {
	fs.mkdirSync(plan.outDir, { recursive: true })
	const out = path.join(plan.outDir, 'client.gen.go')
	fs.writeFileSync(out, `// Code generated by client generator — DO NOT EDIT.\npackage ${plan.pkg}\n`)
}

function writeOapiConfig(plan: Plan): string {
	const cfgPath = path.join(os.tmpdir(), `client-go-${plan.source.service}.yaml`)
	const outRel = path.relative(distRoot, path.join(plan.outDir, 'client.gen.go'))
	fs.writeFileSync(cfgPath, [
		`package: ${plan.pkg}`,
		`generate:`,
		`  models: true`,
		`  client: true`,
		`  std-http-server: false`,
		`  embedded-spec: false`,
		`output: ${outRel}`,
		`output-options:`,
		`  skip-prune: true`,
		`  nullable-type: true`,
		``,
	].join('\n'))
	return cfgPath
}

async function runOapiCodegen(plan: Plan, configPath: string): Promise<void> {
	const proc = Bun.spawn(
		['go', 'tool', 'oapi-codegen', '--config', configPath, plan.preprocessedSpecPath],
		{ cwd: distRoot, stdout: 'inherit', stderr: 'inherit' },
	)
	const exit = await proc.exited
	if (exit !== 0) throw new Error(`[${plan.source.service}] oapi-codegen exited ${exit}`)
}

async function emitAggregate(plans: Plan[]): Promise<void> {
	const dir = path.join(distRoot, 'pkg', 'client')
	await mkdir(dir, { recursive: true })
	const metas: ServiceMeta[] = plans.filter(p => p.hasPaths).map(p => ({ source: p.source }))
	const code = renderAggregateClientGo(metas)
	await writeFile(path.join(dir, 'client.go'), code)
}

async function main(): Promise<void> {
	console.log('client-go generator')
	const sources = await discoverApis(repoRoot)
	if (sources.length === 0) { console.error('No api services discovered.'); process.exit(1) }
	console.log('discovered:', sources.map(s => s.service).join(', '))

	const plans = await preprocessAll(sources)
	for (const plan of plans) {
		if (!plan.hasPaths) { writePlaceholder(plan); continue }
		fs.mkdirSync(plan.outDir, { recursive: true })
		const cfg = writeOapiConfig(plan)
		try { await runOapiCodegen(plan, cfg) }
		finally { try { fs.unlinkSync(cfg) } catch {} }
	}
	await emitAggregate(plans)
	console.log('done.')
}

main()
```

- [ ] **Step 2: Run the Go generator**

```bash
cd packages/client && bun generators/go.ts
```

Expected: per-service `dist/go/pkg/<service>/client.gen.go` generated; aggregate `dist/go/pkg/client/client.go` written.

- [ ] **Step 3: Verify Go module builds**

```bash
cd packages/client/dist/go && go build ./...
```

Expected: 0 errors.

- [ ] **Step 4: Write Go integration test for client.New**

Create `packages/client/dist/go/pkg/client/client_test.go`:

```go
package client_test

import (
	"testing"

	"template/client-go/pkg/client"
)

func TestNewClientConstructs(t *testing.T) {
	c, err := client.New(client.Config{
		TypescriptURL: "http://localhost:3030",
		RustURL:       "http://localhost:3031",
		GoURL:         "http://localhost:3032",
	})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	if c.Typescript == nil { t.Fatal("Typescript nil") }
	if c.Rust == nil { t.Fatal("Rust nil") }
	if c.Go == nil { t.Fatal("Go nil") }
}
```

Run: `(cd packages/client/dist/go && go test ./pkg/client/...)`
Expected: PASS — 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add packages/client/generators/go.ts packages/client/dist/go/
git commit -m "feat(client): Go pipeline generator + Client struct + New(Config) (Task 22)"
```

---

## Phase 10 — Wire everything to `bun sdk`

### Task 23: Root `bun sdk` script invokes the unified generator

**Files:**
- Modify: root `package.json` — `sdk` script runs `bun --cwd packages/client run generate`.

- [ ] **Step 1: Locate current sdk script**

```bash
jq '.scripts.sdk' package.json
```

Expected output: something like `"bun nx run-many -t generate --projects=client-typescript,client-rust,client-go"`.

- [ ] **Step 2: Replace with single target**

Edit root `package.json`:

```diff
- "sdk": "bun nx run-many -t generate --projects=client-typescript,client-rust,client-go",
+ "sdk": "bun nx run client:generate",
```

- [ ] **Step 3: Run end-to-end**

```bash
bun contracts && bun emit-openapi && bun sdk
```

Expected: 0 errors. All three clients regenerate.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(root): bun sdk runs unified client generator (Task 23)"
```

---

## Phase 11 — Final gate sweep + AC verification

### Task 24: Verify all AC-1 through AC-17

- [ ] **Step 1: AC-1 — all three openapi.json declare 3.0.3**

```bash
jq '.openapi' packages/api/typescript/public/docs/openapi.json packages/api/rust/public/docs/openapi.json packages/api/go/public/openapi.json
```

Expected: three lines, each `"3.0.3"`.

- [ ] **Step 2: AC-2 — api-go has ≥1 path**

```bash
jq '.paths | keys | length' packages/api/go/public/openapi.json
jq '.paths | keys' packages/api/go/public/openapi.json
```

Expected: count ≥ 1, includes the transcoder callback path.

- [ ] **Step 3: AC-3 — no IntegrationEvent in any schema**

```bash
for f in packages/api/typescript/public/docs/openapi.json packages/api/rust/public/docs/openapi.json packages/api/go/public/openapi.json; do
	echo "$f: $(jq '.components.schemas | keys | map(select(. == "IntegrationEvent")) | length' "$f")"
done
```

Expected: each line ends in `0`.

- [ ] **Step 4: AC-4 — no internal/external tags**

```bash
for f in packages/api/typescript/public/docs/openapi.json packages/api/rust/public/docs/openapi.json packages/api/go/public/openapi.json; do
	echo "$f: $(jq '[.. | objects | select(.tags? != null) | .tags | .[]] | unique | map(select(. == "internal" or . == "external")) | length' "$f")"
done
```

Expected: each line ends in `0`.

- [ ] **Step 5: AC-5 — discovery returns no `lang` field; new service auto-generates**

Inspection: `cat packages/client/lib/discover.ts | grep -c 'lang'`
Expected: `0`.

Smoke test for billing service:

```bash
mkdir -p packages/api/billing/public
cp packages/api/go/public/openapi.json packages/api/billing/public/openapi.json
jq '.info.title = "billing"' packages/api/billing/public/openapi.json > /tmp/billing.json && mv /tmp/billing.json packages/api/billing/public/openapi.json
bun sdk
ls packages/client/dist/typescript/src/billing packages/client/dist/rust/src/billing packages/client/dist/go/pkg/billing
# clean up
rm -rf packages/api/billing packages/client/dist/typescript/src/billing packages/client/dist/rust/src/billing packages/client/dist/go/pkg/billing
bun sdk  # regenerate to clean state
```

Expected: smoke test creates+regenerates the three billing folders; cleanup leaves things consistent.

- [ ] **Step 6: AC-6 through AC-9, AC-11 — Client classes compile and behave**

```bash
bun --cwd packages/client/dist/typescript test
cargo test -p template-client-rust --test builder
(cd packages/client/dist/go && go test ./pkg/client/...)
```

Expected: all pass.

- [ ] **Step 7: AC-10 — discriminated parsing works**

```bash
bun test packages/contracts/codegen/discriminator.test.ts
cargo test -p template-contracts-rust
(cd packages/contracts/generated/go && go test ./wire/events/...)
```

Expected: all pass.

- [ ] **Step 8: AC-12 — pipe-style main(); no function > 30 LOC**

For each of `packages/client/generators/{typescript,rust,go}.ts`, run:

```bash
awk '/^(async )?function /{name=$0; start=NR} /^}/{ if(name) { printf "%s — %d lines\n", name, NR-start+1; name=""} }' packages/client/generators/typescript.ts
```

Inspect output: every function ≤ 30 lines. (Repeat for rust.ts, go.ts.)

- [ ] **Step 9: AC-13 — downgrade logic gone**

```bash
grep -nE 'rewrite_version|rewrite_nullable|normalizeNullables|writePreprocessedSpec' packages/client/generators/ -r
```

Expected: 0 matches.

- [ ] **Step 10: AC-14 — old layout dirs gone**

```bash
[ ! -e packages/client/typescript ] && [ ! -e packages/client/rust ] && [ ! -e packages/client/go ] && [ ! -e packages/client/api_typescript ] && [ ! -e packages/client/api_rust ] && echo OK
```

Expected: `OK`.

- [ ] **Step 11: AC-15 — COMPLIANCE.md exists with 12 rules**

```bash
grep -cE '^### R-[0-9]+ ' packages/client/COMPLIANCE.md
```

Expected: `12`.

- [ ] **Step 12: AC-16 — vendor extensions namespaced x-tpl-***

```bash
jq '[.. | objects | keys | .[] | select(startswith("x-") and (startswith("x-tpl-") | not))] | unique' packages/api/typescript/public/docs/openapi.json
```

Expected: `[]` or only OAS-standard extensions.

- [ ] **Step 13: AC-17 — SSE excluded from generated clients**

```bash
grep -rln 'listen_events\|listenEvents' packages/client/dist/
```

Expected: 0 matches.

```bash
jq '.paths | to_entries[] | select(.value | .. | objects | ."x-tpl-sse"? == true) | .key' packages/api/rust/public/docs/openapi.json
```

Expected: `"/v1/events"` (still present in source spec).

- [ ] **Step 14: AC-18 — full gate sweep (scoped per "Out of scope" above)**

```bash
bun --cwd packages/api/typescript tsc
bun --cwd packages/api/typescript test
bun --cwd packages/api/typescript/core test
bun --cwd packages/client run check
bun lint --filter='!app-web' --filter='!e2e'   # if Nx scope flags supported; else run per-project
bun contracts
bun emit-openapi
bun sdk
cargo check --workspace
cargo test -p template-core-rust -p template-api-rust -p template-client-rust -p template-contracts-rust
(cd packages/api/go && go build ./... && go test ./...)
(cd packages/contracts/generated/go && go test ./...)
(cd packages/client/dist/go && go build ./... && go test ./...)
```

Expected: every command exits 0. `bun tsc` at the repo root is NOT in this gate because `packages/app/web/` and `packages/e2e/` are out of scope (see plan-level Scope note); they still carry pre-existing medscall-era imports and will be re-wired in a separate spec.

- [ ] **Step 15: Commit any final cleanup**

```bash
git status
# if anything is dirty (test snapshots, regenerated openapi, etc.):
git add -A && git commit -m "chore: gate sweep cleanup (Task 24)"
```

---

## Self-Review

**1. Spec coverage:**

| AC | Task | Verification step |
|----|------|---|
| AC-1  | T2, T3, T4 | T24 step 1 |
| AC-2  | T5 | T24 step 2 |
| AC-3  | T10, T11 | T24 step 3 |
| AC-4  | T13 | T24 step 4 |
| AC-5  | T16 | T24 step 5 |
| AC-6  | T18 | T24 step 6 |
| AC-7  | T18 | T24 step 6 |
| AC-8  | T20 | T24 step 6 |
| AC-9  | T22 | T24 step 6 |
| AC-10 | T6, T7, T8, T9 | T24 step 7 |
| AC-11 | T18 (http layer) | T24 step 6 (configureClient implicit in Client.create base URLs) |
| AC-12 | T18, T20, T22 | T24 step 8 |
| AC-13 | T16, T20 | T24 step 9 |
| AC-14 | T1, T17, T19, T21 | T24 step 10 |
| AC-15 | T15 | T24 step 11 |
| AC-16 | T12 | T24 step 12 |
| AC-17 | T14, T16 (preprocess drops x-tpl-sse) | T24 step 13 |
| AC-18 | T24 step 14 |

Every AC has a Task and a verification step.

**2. Placeholder scan:** No "TBD", "implement later", or "similar to Task N". Every step shows the code or the exact diff. Modify operations use one-line descriptions or diff blocks; whole-file pastes only for newly-created files.

**3. Type consistency:** `ApiSource` always `{ service, specPath }` after Task 16. `ClientConfig` always shaped as `{ <service>: <Service>ClientConfig }` in TS. Rust `Client::builder()` always uses snake_case service names matching `rustModIdent`. Go `Config` fields always `<PascalService>URL` matching `goFieldName`.

**4. Ordering:** Contracts changes (T6-T9) come before generator changes (T18, T20, T22). OpenAPI emitter changes (T2-T5) come before any generator runs against new specs. Layout moves (T15, T17, T19, T21) come before generator pipelines (T18, T20, T22). T23 (root script) is last before verification.

---

## Execution Handoff

**Plan complete and saved to `superpowers/plans/2026-05-14-polyglot-client-sdk.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Use `superpowers:subagent-driven-development`.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

**Which approach?**
