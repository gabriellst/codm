# Polyglot Template Rebuild — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax for tracking. Each Task wraps one observable behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).
>
> **Branch references.** Every artifact in this plan is recipe-traceable to a source branch. Read the cited file with `git show <branch>:<path>` before writing the new file. Do not invent shapes; mirror the recipe.
> - **TS recipes:** `dev` branch — `packages/api/src/{shared,<context>}/`
> - **RS recipes:** `feat/polyglot` branch — `packages/api-rs/src/{shared,<context>}/` and `packages/api-rs/macros/`
> - **GO recipes:** `dev` branch — `packages/channel/internal/{shared,<context>}/` and `packages/channel/pkg/`
>
> **Graph CLI is broken on this branch** (it indexes `packages/channel/internal/` which we deleted). Skip `bun scripts/graph/cli/index.ts validate-plan` and `bun scripts/review-plan.ts`. Manual self-review still applies.

**Goal:** Rebuild `feat/clean-polyglot` from contracts outward — tombstone old plans, reset broken api trees, co-locate per-language frameworks under `packages/api/<lang>/framework/` mirroring `dev:shared` shape (TS+GO) and `feat/polyglot:shared` shape (RS), and implement the video streaming showcase domain end-to-end across api-ts (auth + reads + projections + notifications), api-rs (video/channel/engagement writes + webhooks + SSE), and api-go (transcoding + search + analytics workers + nightly cron).

**Architecture:** Each api owns a co-located `framework/` subpackage (Bun workspace, Cargo workspace member, Go module) consumed as an external dependency by api code. Contracts (TypeSpec wire + Drizzle schema + 3-language codegen) stays as-is. Bounded contexts split per `polyglot.md §5.2` ownership matrix; cross-service flow is outbox → integration event → external handler (no direct service calls except SDK queries). The §5.4 vertical-slice walkthrough is the acceptance test.

**Tech Stack:**
- TypeScript: Bun, Drizzle 0.45, tsyringe-neo, Fastify 5, Zod 4, better-auth 1.4
- Rust: axum, sqlx, utoipa, tokio, serde, strum, chrono, opentelemetry, proc-macro2
- Go: uber/fx, pgx/v5, validator/v10, golang-migrate, redis, OTel
- Cross: Postgres 16, Redis, OpenTelemetry → LGTM

**Spec:** `superpowers/specs/2026-05-13-polyglot-template.md`
**Tasks:** 31
**Estimated minutes:** 1800 (~30 hours sequential; aggressive parallelism inside teams cuts that)

**Branch protocol.** Every commit cites the source-branch reference in its body:
```
ref: dev:packages/api/src/shared/services/Mediator/InternalMediator.ts
ref: feat/polyglot:packages/api-rs/src/shared/services/internal_mediator/channel.rs
```
Reviewers reject commits without `ref:` when the task explicitly cites a recipe.

---

## Task 1: P0 — Tombstone old plans + reset api src trees

**Files:**
- Modify: `superpowers/plans/2026-05-13-framework-refactor-master.md` — prepend SUPERSEDED banner
- Modify: `superpowers/plans/2026-05-13-p1-contracts.md` — prepend SUPERSEDED banner
- Modify: `superpowers/plans/2026-05-13-p1.5-framework-ts.md` — same
- Modify: `superpowers/plans/2026-05-13-p1.6-framework-rs.md` — same
- Modify: `superpowers/plans/2026-05-13-p1.7-framework-go.md` — same
- Modify: `superpowers/plans/2026-05-13-p1.8-contracts-refactor.md` — same
- Modify: `superpowers/plans/2026-05-13-p1.9-contracts-finish.md` — same
- Delete: `packages/api/ts/src/video/` (3 files)
- Delete: `packages/api/rs/src/video/` (game-domain content)
- Delete: `packages/api/go/video/` (whatsmeow content)
- Modify: `packages/api/ts/src/index.ts` — strip video re-exports if any
- Modify: `packages/api/rs/src/lib.rs` + `main.rs` — drop `mod video;` and any video references
- Modify: `packages/api/go/cmd/api/main.go` — drop video imports

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** (none — mechanical reset)
**Depends on:** (none)

- [ ] **Step 1: Prepend SUPERSEDED banner to each old plan**

For each file listed under Modify (the 7 old plans), prepend the following block at line 1 (preserve the rest of the file untouched):

```markdown
> ⚠️ **SUPERSEDED** — see `superpowers/specs/2026-05-13-polyglot-template.md` and the rebuild plan `superpowers/plans/2026-05-13-polyglot-template-rebuild.md`. This document is preserved for history only; do not execute its tasks.

```

- [ ] **Step 2: Delete the wrong-domain src trees**

```bash
rm -rf packages/api/ts/src/video
rm -rf packages/api/rs/src/video
rm -rf packages/api/go/video
```

- [ ] **Step 3: Strip video references from api entrypoints**

For `packages/api/ts/src/index.ts`, replace its body with a placeholder root barrel (the BoundedContext bootstrap is rebuilt in Task 14):

```typescript
// Bootstrapped by Task 14. Intentionally minimal during foundation rebuild.
export {}
```

For `packages/api/rs/src/lib.rs`, drop any `pub mod video;` line. For `packages/api/rs/src/main.rs`, drop any video references; leave only the minimal axum bootstrap or replace its body with:

```rust
fn main() {
    println!("api-rs — to be wired in Task 25");
}
```

For `packages/api/go/cmd/api/main.go`, drop video-related imports and `fx.Module` references. If the file is unrecoverably tied to whatsmeow imports, replace its body with:

```go
package main

import "fmt"

func main() {
    fmt.Println("api-go — to be wired in Task 31")
}
```

- [ ] **Step 4: Verify nothing else references deleted paths**

```bash
rg -n 'packages/api/(ts|rs|go)/(src/)?video' --type-not md || echo "clean"
rg -n 'whatsmeow|whatsapp' packages/api/go --type go || echo "clean"
```

Expected: `clean` lines, or only paths inside the deleted-by-this-task tombstone files.

- [ ] **Step 5: Run language builds to confirm tombstoned state compiles**

```bash
bun --cwd packages/api/ts tsc
cargo check -p template-api-rs 2>&1 | tail -20
cd packages/api/go && go build ./...
```

Expected: 0 errors in each. (If api-rs/api-go are wired to delete-target paths, fix imports until they compile.)

- [ ] **Step 6: Commit**

```bash
git add superpowers/plans/ packages/api/ts/src/index.ts packages/api/rs/src/ packages/api/go/cmd/
git commit -m "$(cat <<'EOF'
chore: P0 reset — tombstone old plans + delete wrong-domain video trees

Old plan docs flagged SUPERSEDED. src/video stubs/game-content/whatsmeow
content deleted. api entrypoints reduced to minimal placeholders pending
rebuild.

ref: superpowers/specs/2026-05-13-polyglot-template.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: P1a — TS framework consumable from `packages/api/ts/framework/` with dev:shared shape

**Files:**
- Move: `packages/framework/ts/` → `packages/api/ts/framework/` (git mv)
- Modify: `package.json` (root) — workspaces array: remove `packages/framework/ts`, add `packages/api/ts/framework`
- Modify: `packages/api/ts/framework/package.json` — flatten exports map to single `.`, keep name `@template/framework-ts`
- Restructure inside `packages/api/ts/framework/src/`:
  - Move flat dirs to nested-by-service shape: `mediators/* → services/Mediator/*`, `outbox/* → services/OutboxDispatcher/*`, `unitofwork/* → services/UnitOfWork/*`, `jobs/* → services/CommandQueue/*`, `logging/* → services/Logging/*`, `http/* → services/HttpRouter/* + types/{Controller,Handler,Middleware,Router,MainRouter,Http}.ts`, `tracing/Tracing.ts → utils/Tracing.ts`, `openapi/OpenAPI.ts → utils/OpenAPI.ts`, `registry/* → types/{Registry,BoundedContext}.ts`, `schema/* → utils/schema/*`, `events/* → types/{BaseEvent,BaseDomainEvent,BaseIntegrationEvent}.ts`, `errors/BaseError.ts → types/BaseError.ts`
- Delete: `packages/api/ts/framework/src/enums/` (Currency/NotificationLevel/Language/Country/RoleType — medscall vocab)
- Modify: `packages/api/ts/framework/src/index.ts` — replace namespace re-exports with the named-exports style from `dev:packages/api/src/shared/index.ts`
- Test: `packages/api/ts/framework/src/__tests__/structure.test.ts` — asserts no `src/{mediators,outbox,unitofwork,jobs,logging,enums,http}/` directory exists; asserts `services/{Mediator,OutboxDispatcher,UnitOfWork,CommandQueue,Logging,HttpRouter}/index.ts` resolves; asserts `import { InternalMediator } from '@template/framework-ts'` resolves.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context (philosophy)
**Depends on:** 1

- [ ] **Step 1: Read the canonical shape**

Run and read each output:

```bash
git show dev:packages/api/src/shared/index.ts | head -80
git ls-tree -r dev:packages/api/src/shared/services
git ls-tree dev:packages/api/src/shared/types
git ls-tree dev:packages/api/src/shared/utils
git show dev:packages/api/src/shared/services/Mediator/index.ts
git show dev:packages/api/src/shared/services/OutboxDispatcher/index.ts
git show dev:packages/api/src/shared/services/UnitOfWork/index.ts
```

This is the target shape — every later step in this task aligns to it.

- [ ] **Step 2: Write the failing structure test**

Create `packages/api/ts/framework/src/__tests__/structure.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')

describe('framework structure mirrors dev:shared', () => {
	it.each([
		'services/Mediator/index.ts',
		'services/OutboxDispatcher/index.ts',
		'services/UnitOfWork/index.ts',
		'services/CommandQueue/index.ts',
		'services/Logging/index.ts',
		'services/HttpRouter/index.ts',
		'types/BaseEvent.ts',
		'types/BaseDomainEvent.ts',
		'types/BaseIntegrationEvent.ts',
		'types/BaseError.ts',
		'types/BoundedContext.ts',
		'types/Controller.ts',
		'types/Handler.ts',
		'types/Middleware.ts',
		'types/Router.ts',
		'types/MainRouter.ts',
		'types/Registry.ts',
		'utils/schema/index.ts',
		'utils/Tracing.ts',
		'utils/OpenAPI.ts',
		'utils/GlobalErrorMapper.ts',
		'utils/Config.ts',
	])('expects %s to exist', (path) => {
		expect(existsSync(join(ROOT, path))).toBe(true)
	})

	it.each(['mediators', 'outbox', 'unitofwork', 'jobs', 'logging', 'http', 'tracing', 'openapi', 'registry', 'schema', 'events', 'enums'])(
		'expects flattened directory %s to NOT exist at src root',
		(dir) => {
			expect(existsSync(join(ROOT, dir))).toBe(false)
		},
	)

	it('exports InternalMediator as a named export from the package root', async () => {
		const mod = await import('@template/framework-ts')
		expect(mod).toHaveProperty('InternalMediator')
		expect(mod).toHaveProperty('OutboxDispatcher')
		expect(mod).toHaveProperty('BaseEntity')
		expect(mod).toHaveProperty('BaseIntegrationEvent')
	})
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
bun --cwd packages/api/ts/framework test src/__tests__/structure.test.ts
```

Expected: most `expects ... to exist` fail (target paths missing); the namespace-style export test fails because current index uses `export * as X`.

- [ ] **Step 4: Move the package to its new home**

```bash
git mv packages/framework/ts packages/api/ts/framework
```

- [ ] **Step 5: Update root workspaces array**

Modify `package.json` (root):

```diff
 "workspaces": [
   "packages/contracts",
   "packages/contracts/generated/ts",
-  "packages/framework/ts",
   "packages/api/ts",
+  "packages/api/ts/framework",
   "packages/app/web",
   "packages/app/expo",
   "packages/client/ts",
   "packages/e2e"
 ],
```

- [ ] **Step 6: Flatten framework package.json exports map**

Modify `packages/api/ts/framework/package.json` — replace the `exports` object with a single root export and drop `main`:

```diff
-  "main": "./src/index.ts",
-  "exports": {
-    ".": "./src/index.ts",
-    "./schema": "./src/schema/index.ts",
-    "./events": "./src/events/index.ts",
-    "./entities": "./src/entities/index.ts",
-    "./objects": "./src/objects/index.ts",
-    "./mediators": "./src/mediators/index.ts",
-    "./unitofwork": "./src/unitofwork/index.ts",
-    "./outbox": "./src/outbox/index.ts",
-    "./repositories": "./src/events/index.ts",
-    "./http": "./src/http/index.ts",
-    "./openapi": "./src/openapi/index.ts",
-    "./tracing": "./src/tracing/index.ts",
-    "./errors": "./src/errors/index.ts",
-    "./db": "./src/db/index.ts",
-    "./registry": "./src/registry/index.ts",
-    "./enums": "./src/enums/index.ts",
-    "./utils": "./src/utils/index.ts"
-  },
+  "exports": {
+    ".": "./src/index.ts"
+  },
```

- [ ] **Step 7: Restructure src/ to nested services + types + utils**

Inside `packages/api/ts/framework/src/`:

```bash
cd packages/api/ts/framework/src

mkdir -p services/Mediator services/OutboxDispatcher services/UnitOfWork services/CommandQueue services/Logging services/HttpRouter

git mv mediators/Mediator.ts                   services/Mediator/Mediator.ts
git mv mediators/EventEmitter2Mediator.ts      services/Mediator/EventEmitter2Mediator.ts
git mv mediators/RedisExternalMediator.ts      services/Mediator/RedisExternalMediator.ts
git mv mediators/MockExternalMediator.ts       services/Mediator/MockExternalMediator.ts
git mv mediators/SpyMediator.ts                services/Mediator/SpyMediator.ts
git mv mediators/index.ts                      services/Mediator/index.ts
rmdir mediators

git mv outbox/OutboxDispatcher.ts              services/OutboxDispatcher/OutboxDispatcher.ts
git mv outbox/DrizzleOutboxDispatcher.ts       services/OutboxDispatcher/DrizzleOutboxDispatcher.ts
git mv outbox/MockOutboxDispatcher.ts          services/OutboxDispatcher/MockOutboxDispatcher.ts
git mv outbox/index.ts                         services/OutboxDispatcher/index.ts
rmdir outbox

git mv unitofwork/UnitOfWork.ts                services/UnitOfWork/UnitOfWork.ts
git mv unitofwork/DrizzleUnitOfWork.ts         services/UnitOfWork/DrizzleUnitOfWork.ts
git mv unitofwork/MockUnitOfWork.ts            services/UnitOfWork/MockUnitOfWork.ts
git mv unitofwork/index.ts                     services/UnitOfWork/index.ts
rmdir unitofwork

git mv jobs/CommandQueue.ts                    services/CommandQueue/CommandQueue.ts
git mv jobs/BullMQ.ts                          services/CommandQueue/BullMQCommandQueue.ts
git mv jobs/MockCommandQueue.ts                services/CommandQueue/MockCommandQueue.ts
git mv jobs/index.ts                           services/CommandQueue/index.ts
rmdir jobs

# Logging: lift dev:shared/services/Logging/* if current logging/ has only stubs
git ls-tree -r dev:packages/api/src/shared/services/Logging | awk '{print $NF}'
# For each file, fetch and write it. Example (run for each):
#   git show dev:packages/api/src/shared/services/Logging/LoggingService.ts > services/Logging/LoggingService.ts
# Delete the current logging/ once services/Logging/ is populated.
rm -rf logging

mkdir -p utils types

git mv http/Router.ts                          types/Router.ts
git mv http/MainRouter.ts                      types/MainRouter.ts
git mv http/Controller.ts                      types/Controller.ts
git mv http/Handler.ts                         types/Handler.ts
git mv http/Middleware.ts                      types/Middleware.ts
git mv http/EventHandler.ts                    types/EventHandler.ts
git mv http/Http.ts                            types/Http.ts
git mv http/adapters/FastifyHttpRouter.ts      services/HttpRouter/FastifyHttpRouter.ts || true
# If adapters/ holds more, move each to services/HttpRouter/
git mv http/index.ts                           services/HttpRouter/index.ts || true
rm -rf http

git mv tracing/Tracing.ts                      utils/Tracing.ts
rm -rf tracing

git mv openapi/OpenAPI.ts                      utils/OpenAPI.ts
git mv openapi/OpenAPI.test.ts                 utils/OpenAPI.test.ts || true
rm -rf openapi

git mv registry/Registry.ts                    types/Registry.ts
git mv registry/BoundedContext.ts              types/BoundedContext.ts
rm -rf registry

git mv schema utils/schema

git mv events/BaseEvent.ts                     types/BaseEvent.ts
git mv events/BaseDomainEvent.ts               types/BaseDomainEvent.ts
# BaseIntegrationEvent: confirm it exists in framework/events/; if not, fetch from dev
git mv events/BaseIntegrationEvent.ts          types/BaseIntegrationEvent.ts || \
  git show dev:packages/api/src/shared/types/BaseIntegrationEvent.ts > types/BaseIntegrationEvent.ts
git mv events/repository/* repositories/ || true
rm -rf events

git mv errors/BaseError.ts                     types/BaseError.ts
# Keep errors/codes.ts and errors/index.ts (base codes catalog)

rm -rf enums   # medscall vocabulary (Currency/Country/Language/NotificationLevel/RoleType)
```

If any `git mv` errors because the source doesn't exist in the current tree (the current framework was already partial), fetch from dev:

```bash
git show dev:packages/api/src/shared/<rest-of-path> > packages/api/ts/framework/src/<target>
```

For each file lifted from dev that isn't yet present in framework, also fetch its tests if they exist on dev (`dev:packages/api/src/shared/.../X.test.ts`).

- [ ] **Step 8: Rewrite `src/index.ts` to use named exports**

Replace the body of `packages/api/ts/framework/src/index.ts` with:

```typescript
// @template/framework-ts — context-agnostic primitives for api-ts.
// Recipe: dev:packages/api/src/shared/index.ts (named exports, no namespace re-export).

// Types — base classes + interfaces
export * from './types/BaseEvent'
export * from './types/BaseDomainEvent'
export * from './types/BaseIntegrationEvent'
export * from './types/BaseError'
export * from './types/BoundedContext'
export * from './types/Controller'
export * from './types/EventHandler'
export * from './types/Handler'
export * from './types/Http'
export * from './types/MainRouter'
export * from './types/Middleware'
export * from './types/Registry'
export * from './types/Router'

// Entities
export * from './entities'

// Value objects (generic only — no domain VOs)
export * from './objects'

// Errors — BaseError + base catalog
export * from './errors'

// Services
export * from './services/Mediator'
export * from './services/OutboxDispatcher'
export * from './services/UnitOfWork'
export * from './services/CommandQueue'
export * from './services/Logging'
export * from './services/HttpRouter'

// Repositories
export * from './repositories'

// DB infrastructure (no schema definitions — those live in @template/contracts)
export * from './db'

// Utils
export * from './utils/Config'
export * from './utils/GlobalErrorMapper'
export * from './utils/OpenAPI'
export * from './utils/Tracing'
export * from './utils/TryCatch'
export * from './utils/schema'
```

- [ ] **Step 9: Fix downstream imports inside framework**

Files inside framework that imported from old flat paths now need updates. Run:

```bash
cd packages/api/ts/framework
rg -l "from '\.\./(mediators|outbox|unitofwork|jobs|logging|http|tracing|openapi|registry|schema|events|enums)" src/ | while read f; do
  echo "Fix imports in $f"
done
```

For each file listed, update relative paths to the new nested locations. The structure test will verify resolution at the package boundary; intra-package paths just need to compile.

- [ ] **Step 10: Run structure test + tsc**

```bash
bun --cwd packages/api/ts/framework test src/__tests__/structure.test.ts
bun --cwd packages/api/ts/framework tsc
bun --cwd packages/api/ts/framework test
```

Expected: structure test passes (all 22+ paths exist, 12 flat dirs gone, named exports resolve). `tsc` passes. All other framework tests (Email, paths, OpenAPI, InputSchema) pass.

- [ ] **Step 11: Verify api/ts still type-checks**

```bash
bun --cwd packages/api/ts tsc
```

Expected: 0 errors. (api/ts only imports `@template/framework-ts` — package name resolves through the workspace, so the framework relocation is transparent.)

- [ ] **Step 12: Commit**

```bash
git add packages/api/ts/framework packages/framework package.json
git commit -m "$(cat <<'EOF'
feat(framework-ts): P1a — relocate to packages/api/ts/framework with dev:shared shape

- packages/framework/ts → packages/api/ts/framework (co-located in api).
- Restructured to mirror dev:packages/api/src/shared: services/{Mediator,
  OutboxDispatcher,UnitOfWork,CommandQueue,Logging,HttpRouter}/,
  types/, utils/schema, utils/{Config,Tracing,OpenAPI,...}.
- Flattened package.json exports map to single root export.
- src/index.ts rewritten to named exports per dev:shared/index.ts.
- Dropped medscall enums (Currency/Country/Language/NotificationLevel/
  RoleType) — framework holds infrastructure only.

ref: dev:packages/api/src/shared/index.ts
ref: dev:packages/api/src/shared/services/Mediator/index.ts
ref: dev:packages/api/src/shared/services/OutboxDispatcher/index.ts
ref: dev:packages/api/src/shared/services/UnitOfWork/index.ts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: P1b — RS framework relocates to `packages/api/rs/framework/`

**Files:**
- Move: `packages/framework/rs/` → `packages/api/rs/framework/`
- Move: `packages/framework/rs/macros/` → `packages/api/rs/framework/macros/` (carried with parent)
- Modify: `Cargo.toml` (root) — workspace members paths
- Modify: `packages/api/rs/Cargo.toml` — `template-framework-rs` path becomes `framework`
- Modify: `packages/contracts/generated/rs/Cargo.toml` — if it path-references framework, update; otherwise no change

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** (none — mechanical move)
**Depends on:** 1

- [ ] **Step 1: Read the canonical shape**

```bash
git ls-tree feat/polyglot:packages/api-rs/src/shared
git ls-tree -r feat/polyglot:packages/api-rs/src/shared/services
git ls-tree -r feat/polyglot:packages/api-rs/macros
git show feat/polyglot:packages/api-rs/macros/Cargo.toml | head -30
```

Confirm the current `packages/framework/rs/src/` layout already matches (types/, errors/, db/, services/{internal_mediator,external_mediator,outbox,scheduler}, jobs/, middleware/, utils/, repositories/) — if drift exists, note it and add a sub-step to align before moving.

- [ ] **Step 2: Move the crate**

```bash
git mv packages/framework/rs packages/api/rs/framework
```

This carries the `macros/` sub-crate along with it.

- [ ] **Step 3: Update root Cargo workspace members**

Modify `Cargo.toml` (root):

```diff
 [workspace]
 resolver = "2"
 members = [
-    "packages/framework/rs",
-    "packages/framework/rs/macros",
+    "packages/api/rs/framework",
+    "packages/api/rs/framework/macros",
     "packages/api/rs",
     "packages/client/rs",
     "packages/contracts/generated/rs",
 ]
```

- [ ] **Step 4: Update api-rs path dependency**

Modify `packages/api/rs/Cargo.toml`:

```diff
- template-framework-rs = { path = "../../framework/rs" }
+ template-framework-rs = { path = "framework" }
```

(If the dependency was instead declared at workspace level, update the workspace `[workspace.dependencies]` entry to `path = "packages/api/rs/framework"`.)

- [ ] **Step 5: Update contracts/generated/rs path dep (if any)**

```bash
grep -n "template-framework-rs" packages/contracts/generated/rs/Cargo.toml
```

If the entry uses a path, update to `path = "../../../api/rs/framework"`. If it uses workspace inheritance (`workspace = true`), no change.

- [ ] **Step 6: Verify the workspace compiles**

```bash
cargo check -p template-framework-rs 2>&1 | tail -20
cargo check -p template-framework-rs-macros 2>&1 | tail -20
cargo check -p template-api-rs 2>&1 | tail -20
cargo check -p template-contracts-rs 2>&1 | tail -20
cargo check -p template-client-rs 2>&1 | tail -20
```

Expected: all 5 commands return `Finished` with 0 errors.

- [ ] **Step 7: Run framework's own tests**

```bash
cargo test -p template-framework-rs 2>&1 | tail -30
```

Expected: 0 failures.

- [ ] **Step 8: Commit**

```bash
git add Cargo.toml packages/api/rs/framework packages/api/rs/Cargo.toml packages/contracts/generated/rs/Cargo.toml
git rm -r packages/framework/rs 2>/dev/null || true  # ensures git index reflects the move
git commit -m "$(cat <<'EOF'
feat(framework-rs): P1b — relocate to packages/api/rs/framework

- packages/framework/rs → packages/api/rs/framework (carries macros/
  sub-crate). Cargo workspace members + path deps updated.
- Crate names unchanged: template-framework-rs, template-framework-rs-macros.
- Workspace compiles end-to-end (framework, macros, api, contracts, client).

ref: feat/polyglot:packages/api-rs/src/shared
ref: feat/polyglot:packages/api-rs/macros

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: P1c — GO framework relocates to `packages/api/go/framework/` and is de-medscalled

**Files:**
- Move: `packages/framework/go/` → `packages/api/go/framework/`
- Modify: `packages/api/go/go.mod` — `replace` directive points at `./framework`
- Modify: `packages/api/go/framework/go.mod` — strip `whatsmeow`, `swag` deps; keep redis/pgx/fx/validator/uuid
- Delete: `packages/api/go/framework/objects/cnpj.go`, `cpf.go`, `phone.go`
- Delete: any medscall-specific enums (`group_role.go` if present; verify by inspection)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** sonnet
**Skills:** (none — mechanical)
**Depends on:** 1

- [ ] **Step 1: Read the canonical shape**

```bash
git ls-tree dev:packages/channel/internal/shared
git ls-tree dev:packages/channel/internal/shared/services
git ls-tree dev:packages/channel/internal/shared/types
git show dev:packages/channel/internal/shared/module.go
```

- [ ] **Step 2: Move the module**

```bash
git mv packages/framework/go packages/api/go/framework
```

- [ ] **Step 3: Update the replace directive in api/go**

Modify `packages/api/go/go.mod`:

```diff
- replace template/framework-go => ../../framework/go
+ replace template/framework-go => ./framework
```

- [ ] **Step 4: Strip domain-specific deps from framework/go.mod**

In `packages/api/go/framework/go.mod` remove the `require` block entries for:

- `go.mau.fi/whatsmeow`
- `go.mau.fi/libsignal` (whatsmeow transitive)
- `go.mau.fi/util` (whatsmeow transitive)
- `github.com/beeper/argo-go` (whatsmeow transitive)
- `github.com/swaggo/swag`
- `github.com/coder/websocket` (verify it's only used by whatsmeow gateway code that we're not bringing over)

Then:

```bash
cd packages/api/go/framework
go mod tidy
```

Expected: `go mod tidy` succeeds; many indirect deps in `go.sum` go away.

- [ ] **Step 5: Delete Brazilian VOs**

```bash
rm packages/api/go/framework/objects/cnpj.go \
   packages/api/go/framework/objects/cpf.go \
   packages/api/go/framework/objects/phone.go
```

Also inspect `packages/api/go/framework/enums/` for medscall-specific files:

```bash
ls packages/api/go/framework/enums/
```

Per the spec D3, generic enums stay (Environment, Country, Currency, Platform, LogLevel, Language). Any medscall-specific (e.g. `group_role.go`, `chat_presence_type.go`, `membership_action.go`) must be deleted. Verify by reading each file's contents and judging whether the vocabulary belongs to the showcase domain (it does not).

- [ ] **Step 6: Verify framework builds and tests**

```bash
cd packages/api/go/framework
go build ./...
go test ./...
```

Expected: 0 errors, 0 test failures.

- [ ] **Step 7: Verify api/go still compiles**

```bash
cd packages/api/go
go mod tidy
go build ./...
```

Expected: 0 errors. (After Task 1's reset, `cmd/api/main.go` is a stub — `go build ./...` should be trivially clean.)

- [ ] **Step 8: Commit**

```bash
git add packages/api/go packages/framework
git commit -m "$(cat <<'EOF'
feat(framework-go): P1c — relocate to packages/api/go/framework + de-medscall

- packages/framework/go → packages/api/go/framework (own go.mod with
  replace directive in api/go/go.mod).
- Stripped whatsmeow + libsignal + swag deps from framework go.mod.
- Deleted Brazilian VOs (cnpj.go, cpf.go, phone.go) and any
  medscall-specific enums from framework/.

ref: dev:packages/channel/internal/shared

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: P1 final — contracts codegen end-to-end clean; top-level `packages/framework/` removed

**Files:**
- Modify (if needed): `packages/contracts/generated/ts/package.json`, `packages/contracts/generated/rs/Cargo.toml`, `packages/contracts/generated/go/go.mod` — adjust path-based references
- Delete: `packages/framework/` (empty after Tasks 2–4)
- Test: full pipeline verification command

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Skills:** /sdk (codegen pipeline)
**Depends on:** 2, 3, 4

- [ ] **Step 1: Inspect generated/* configs for path references**

```bash
grep -n "framework" packages/contracts/generated/ts/package.json || echo "ts clean"
grep -n "framework" packages/contracts/generated/rs/Cargo.toml || echo "rs clean"
grep -n "framework" packages/contracts/generated/go/go.mod 2>/dev/null || echo "go clean"
```

If any path leaks (`../../../framework/<lang>`), update to `../../../api/<lang>/framework`. Generated TS uses package-name resolution (`@template/framework-ts`), so it almost certainly needs no change. Generated Rust uses workspace-dependency declaration — already handled in Task 3.

- [ ] **Step 2: Delete the empty top-level `packages/framework/`**

```bash
test -z "$(ls packages/framework 2>/dev/null)" && rmdir packages/framework || ls packages/framework
```

Expected: `rmdir` succeeds; the directory is empty (children moved to api/<lang>/framework).

- [ ] **Step 3: Run the full contracts pipeline**

```bash
bun contracts 2>&1 | tail -50
```

Expected: TypeSpec compile succeeds, `emit-wire-ts/-rs/-go` succeed, `drizzle-kit generate` succeeds with no SQL drift.

- [ ] **Step 4: Verify all three language builds against new framework paths**

```bash
bun --cwd packages/api/ts tsc
cargo check --workspace 2>&1 | tail -10
cd packages/api/go && go build ./... && cd ../../..
```

Expected: 0 errors across all three.

- [ ] **Step 5: Run framework tests across all three**

```bash
bun --cwd packages/api/ts/framework test 2>&1 | tail
cargo test -p template-framework-rs 2>&1 | tail -10
cd packages/api/go/framework && go test ./... 2>&1 | tail && cd ../../../..
```

Expected: 0 failures across all three.

- [ ] **Step 6: Commit**

```bash
git add packages/contracts packages/framework
git commit -m "$(cat <<'EOF'
feat(contracts+layout): P1 final — codegen green against relocated frameworks

- Verified generated/{ts,rs,go} resolve framework deps via the
  api/<lang>/framework path. Removed empty packages/framework/ root.
- bun contracts end-to-end green; tsc / cargo check workspace /
  go build all clean.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: P2a — Caller can resolve their session via `GET /v1/session`

**Files:**
- Create: `packages/api/ts/src/auth/entities/{User,Account}.ts`
- Create: `packages/api/ts/src/auth/repositories/UserRepository/{UserRepository,DrizzleUserRepository,MockUserRepository,index}.ts`
- Create: `packages/api/ts/src/auth/repositories/AccountRepository/{AccountRepository,DrizzleAccountRepository,MockAccountRepository,index}.ts`
- Create: `packages/api/ts/src/auth/middlewares/{AuthAccountMiddleware,AuthActorMiddleware,index}.ts`
- Create: `packages/api/ts/src/auth/controllers/{GetSession,index}.ts`
- Create: `packages/api/ts/src/auth/{registry,index}.ts`
- Test: `packages/api/ts/src/auth/controllers/GetSession.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context, /entity, /repository, /controller, /middleware, /test
**Depends on:** 5

- [ ] **Step 1: Read the canonical auth recipe**

```bash
git ls-tree -r dev:packages/api/src/auth
git show dev:packages/api/src/auth/entities/User.ts
git show dev:packages/api/src/auth/entities/Account.ts
git show dev:packages/api/src/auth/middlewares/AuthAccountMiddleware.ts
git show dev:packages/api/src/auth/middlewares/AuthActorMiddleware.ts
git show dev:packages/api/src/auth/registry.ts
git show dev:packages/api/src/auth/repositories/UserRepository/DrizzleUserRepository.ts
git show dev:packages/api/src/auth/repositories/AccountRepository/DrizzleAccountRepository.ts
```

The recipe is dev:auth verbatim — entity shape (Zod schema → `.create()` validates → behavior methods → raises domain events on state changes), repo as interface + Drizzle + Mock, middlewares as injectable classes implementing the framework's Middleware interface.

- [ ] **Step 2: Verify contracts.authentication schema matches better-auth columns**

```bash
git show packages/contracts/db/schema/auth.ts | head -80
```

Expected: tables `users`, `accounts`, `sessions`, `verifications` with columns better-auth expects (id, email, name, emailVerified, image; accountId, providerId, userId, accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, scope, password; token, ipAddress, userAgent, expiresAt; identifier, value, expiresAt). If any column is missing for what better-auth needs, **stop and surface as an open question** — schema change is out of scope of this task.

- [ ] **Step 3: Write the failing test**

Create `packages/api/ts/src/auth/controllers/GetSession.test.ts`:

```typescript
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
	beforeEach(async () => { await testBed.reset() })
	afterAll(async () => { await testBed.destroy() })

	it('returns 401 when no session cookie is present', async () => {
		const controller = testBed.resolve(GetSessionController)
		const response = await controller.handle({ headers: {} } as any)
		expect(response.status).toBe(401)
		expect(response.body).toMatchObject({ code: 'UNAUTHORIZED' })
	})

	it('returns 200 with user payload when session cookie resolves to a user', async () => {
		const { user, account } = await testBed.given.userWithAccount({
			email: 'gabriel@example.com',
			name: 'Gabriel',
		})
		const sessionCookie = await testBed.given.activeSession(user.id)
		const controller = testBed.resolve(GetSessionController)
		const response = await controller.handle({
			headers: { cookie: `session=${sessionCookie}` },
		} as any)
		expect(response.status).toBe(200)
		expect(response.body).toMatchObject({
			user: { id: user.id, email: 'gabriel@example.com', name: 'Gabriel' },
			account: { id: account.id },
		})
	})
})
```

- [ ] **Step 4: Run test to verify it fails**

```bash
bun --cwd packages/api/ts test src/auth/controllers/GetSession.test.ts
```

Expected: FAIL — module not found (`./GetSession`), or `TestBed.given.userWithAccount` not found.

- [ ] **Step 5: Implement User entity**

Create `packages/api/ts/src/auth/entities/User.ts` mirroring `dev:packages/api/src/auth/entities/User.ts`:

```bash
git show dev:packages/api/src/auth/entities/User.ts > packages/api/ts/src/auth/entities/User.ts
```

Then audit and fix imports: replace `@shared/*` with `@template/framework-ts`. Remove any medscall-specific value objects (CPF, Phone, BirthDate). The video-streaming User needs only: id, email, name, emailVerified, image, createdAt, updatedAt.

- [ ] **Step 6: Implement Account entity**

```bash
git show dev:packages/api/src/auth/entities/Account.ts > packages/api/ts/src/auth/entities/Account.ts
```

Same import audit. Drop any medscall-specific clinic association.

- [ ] **Step 7: Implement repositories**

For each of `UserRepository`, `AccountRepository`:

```bash
mkdir -p packages/api/ts/src/auth/repositories/{UserRepository,AccountRepository}
# Fetch each file from dev and audit imports
for f in UserRepository.ts DrizzleUserRepository.ts MockUserRepository.ts index.ts; do
  git show dev:packages/api/src/auth/repositories/UserRepository/$f > packages/api/ts/src/auth/repositories/UserRepository/$f
done
for f in AccountRepository.ts DrizzleAccountRepository.ts MockAccountRepository.ts index.ts; do
  git show dev:packages/api/src/auth/repositories/AccountRepository/$f > packages/api/ts/src/auth/repositories/AccountRepository/$f
done
```

Audit: imports from `@shared/*` → `@template/framework-ts`. Drizzle table imports from `@template/contracts/db`. Remove any clinic-association queries.

- [ ] **Step 8: Implement middlewares**

For each of `AuthAccountMiddleware`, `AuthActorMiddleware`:

```bash
mkdir -p packages/api/ts/src/auth/middlewares
git show dev:packages/api/src/auth/middlewares/AuthAccountMiddleware.ts > packages/api/ts/src/auth/middlewares/AuthAccountMiddleware.ts
git show dev:packages/api/src/auth/middlewares/AuthActorMiddleware.ts > packages/api/ts/src/auth/middlewares/AuthActorMiddleware.ts
git show dev:packages/api/src/auth/middlewares/index.ts > packages/api/ts/src/auth/middlewares/index.ts
```

Audit imports. Drop any clinic-switching logic in `AuthActorMiddleware`. The video-streaming actor model is simply "authenticated user" — actor = user.

- [ ] **Step 9: Implement GetSession controller**

Create `packages/api/ts/src/auth/controllers/GetSession.ts`:

```typescript
import { injectable, inject } from 'tsyringe-neo'
import { z } from '@template/framework-ts'
import { Controller } from '@template/framework-ts'
import { UserRepository } from '../repositories/UserRepository'
import { AccountRepository } from '../repositories/AccountRepository'
import { auth as betterAuth } from '../betterAuth'  // factored in Step 10

const OutputSchema = z.object({
	user: z.object({ id: z.string(), email: z.string().email(), name: z.string(), emailVerified: z.boolean() }),
	account: z.object({ id: z.string(), providerId: z.string() }),
})

@injectable()
export class GetSessionController extends Controller {
	method = 'GET' as const
	path = '/v1/session' as const
	output = OutputSchema

	constructor(
		@inject(UserRepository) private userRepo: UserRepository,
		@inject(AccountRepository) private accountRepo: AccountRepository,
	) { super() }

	async handle(req: { headers: Record<string, string | undefined> }) {
		const session = await betterAuth.api.getSession({ headers: req.headers })
		if (!session) return { status: 401, body: { code: 'UNAUTHORIZED' } }
		const user = await this.userRepo.findById(session.user.id)
		if (!user) return { status: 401, body: { code: 'UNAUTHORIZED' } }
		const account = await this.accountRepo.findPrimaryForUser(user.id)
		return { status: 200, body: { user: user.toJSON(), account: account?.toJSON() ?? null } }
	}
}
```

- [ ] **Step 10: Wire better-auth**

Create `packages/api/ts/src/auth/betterAuth.ts`:

```bash
# Read the better-auth setup from dev as recipe
git show dev:packages/api/src/auth/betterAuth.ts 2>/dev/null || \
  git show dev:packages/api/src/auth/auth.ts 2>/dev/null || \
  echo "(no dev recipe found — fall back to better-auth docs and contracts.authentication schema columns)"
```

If dev has a recipe, port it (drop email verification provider integrations if they pull in medscall infra; keep credentials provider). If not, follow the official better-auth `@better-auth/drizzle` adapter setup against `@template/contracts/db` tables.

- [ ] **Step 11: Wire registry + index**

Create `packages/api/ts/src/auth/registry.ts` — bindings for `mock` / `integration` / `real`. Mirror dev:auth/registry.ts; strip clinic context references.

Create `packages/api/ts/src/auth/index.ts` exporting the BoundedContext.

- [ ] **Step 12: Add `given` helpers**

Extend `packages/api/ts/tests/support/given/` (creating the support harness if it doesn't exist; mirror `dev:packages/api/tests/support/`):

```bash
git show dev:packages/api/tests/support/TestBed.ts | head -80
git show dev:packages/api/tests/support/given/index.ts
git show dev:packages/api/tests/support/given/users.ts
```

Port `TestBed`, `givenUser`, `givenAccount`, `givenUserWithAccount`, `givenActiveSession`. Drop clinic / medical staff helpers — out of scope.

- [ ] **Step 13: Run test to verify it passes**

```bash
bun --cwd packages/api/ts test src/auth/controllers/GetSession.test.ts
```

Expected: PASS — both `it` blocks pass.

- [ ] **Step 14: Run wider checks**

```bash
bun --cwd packages/api/ts tsc
bun --cwd packages/api/ts test
```

Expected: 0 tsc errors; all auth tests pass.

- [ ] **Step 15: Commit**

```bash
git add packages/api/ts/src/auth packages/api/ts/tests
git commit -m "$(cat <<'EOF'
feat(api-ts/auth): P2a — GET /v1/session backed by better-auth + Drizzle

User + Account entities, repos, middlewares, GetSession controller,
better-auth setup against contracts.authentication schema. Registry +
TestBed given helpers (givenUser, givenAccount, givenActiveSession).

ref: dev:packages/api/src/auth/

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: P2b — `integration.video.published` triggers push delivery to subscribers

**Files:**
- Create: `packages/api/ts/src/notifications/services/PushDeliveryService.ts` (interface)
- Create: `packages/api/ts/src/notifications/services/LogPushDeliveryService.ts` (stub writes to `push_log` table)
- Create: `packages/api/ts/src/notifications/services/MockPushDeliveryService.ts`
- Create: `packages/api/ts/src/notifications/handlers/external.ts` (subscribes to `integration.video.published`)
- Create: `packages/api/ts/src/notifications/handlers/NotifySubscribersHandler.ts`
- Create: `packages/api/ts/src/notifications/{registry,index}.ts`
- Test: `packages/api/ts/src/notifications/handlers/NotifySubscribersHandler.test.ts`
- Modify: `packages/contracts/db/schema/notifications.ts` — ensure `push_log` table exists

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler, /service, /test
**Depends on:** 6

- [ ] **Step 1: Read recipes**

```bash
# Handler recipe: dev's external handler shape
git show dev:packages/api/src/<any-context>/handlers/external.ts 2>/dev/null | head -80
# Pick a context whose external handler is similar — e.g., dev:packages/api/src/clinic/handlers/external.ts
git show dev:packages/api/src/clinic/handlers/external.ts
# Service interface pattern
git show dev:packages/api/src/shared/services/MailSender/MailSender.ts
git show dev:packages/api/src/shared/services/MailSender/ConsoleMailSender.ts
```

- [ ] **Step 2: Verify push_log table exists in contracts**

```bash
grep -n 'push_log\|pushLog' packages/contracts/db/schema/notifications.ts
```

If missing, this becomes a sub-step: add a `push_log` table to `notifications.ts` (columns: id, userId, videoId, kind, payload jsonb, sentAt, status). Generate migration. (Reader: schema bumps are out-of-scope of P2b proper; if missing, flag and pause for spec amendment, or add the table in-line with a brief justification in the commit.)

- [ ] **Step 3: Write the failing test**

Create `packages/api/ts/src/notifications/handlers/NotifySubscribersHandler.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { VideoPublishedIntegrationEvent } from '@template/contracts-ts/wire'
import { NotifySubscribersHandler } from './NotifySubscribersHandler'
import { PushDeliveryService } from '../services/PushDeliveryService'

describe('NotifySubscribersHandler', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
	})
	beforeEach(async () => { await testBed.reset() })
	afterAll(async () => { await testBed.destroy() })

	it('delivers a push notification to every subscriber when a video is published', async () => {
		const { channel } = await testBed.given.channelWithSubscribers({ subscriberCount: 3 })
		const event = new VideoPublishedIntegrationEvent({
			videoId: 'video-1', channelId: channel.id, title: 'Hello', publishedAt: new Date().toISOString(),
		})

		const handler = testBed.resolve(NotifySubscribersHandler)
		await handler.handle(event)

		const pushLog = await testBed.given.pushLog.findAllByVideo('video-1')
		expect(pushLog).toHaveLength(3)
		expect(pushLog.every(r => r.kind === 'VIDEO_PUBLISHED')).toBe(true)
	})

	it('is idempotent — re-handling the same event does not duplicate push logs', async () => {
		const { channel } = await testBed.given.channelWithSubscribers({ subscriberCount: 2 })
		const event = new VideoPublishedIntegrationEvent({ videoId: 'video-2', channelId: channel.id, title: 'Hi', publishedAt: new Date().toISOString() })
		const handler = testBed.resolve(NotifySubscribersHandler)
		await handler.handle(event)
		await handler.handle(event)
		const pushLog = await testBed.given.pushLog.findAllByVideo('video-2')
		expect(pushLog).toHaveLength(2)
	})
})
```

- [ ] **Step 3: Run test → FAIL**

```bash
bun --cwd packages/api/ts test src/notifications/handlers/NotifySubscribersHandler.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 4: Define `PushDeliveryService` interface**

`packages/api/ts/src/notifications/services/PushDeliveryService.ts`:

```typescript
import { z } from '@template/framework-ts'

export const PushNotificationSchema = z.object({
	userId: z.uuid(),
	kind: z.enum(['VIDEO_PUBLISHED', 'COMMENT_REPLY', 'NEW_SUBSCRIBER']),
	videoId: z.string().optional(),
	channelId: z.string().optional(),
	payload: z.record(z.string(), z.unknown()),
})
export type PushNotification = z.infer<typeof PushNotificationSchema>

export abstract class PushDeliveryService {
	abstract deliver(notification: PushNotification): Promise<void>
}
```

- [ ] **Step 5: Implement `LogPushDeliveryService`**

Writes to `push_log` table. Uses `INSERT ... ON CONFLICT (user_id, video_id, kind) DO NOTHING` for idempotency.

- [ ] **Step 6: Implement `MockPushDeliveryService` (in-memory queue, exposes inspect())**

- [ ] **Step 7: Implement `NotifySubscribersHandler`**

```typescript
import { injectable, inject } from 'tsyringe-neo'
import { EventHandler } from '@template/framework-ts'
import { VideoPublishedIntegrationEvent } from '@template/contracts-ts/wire'
import { PushDeliveryService } from '../services/PushDeliveryService'
import { SubscriptionReadRepository } from '../repositories/SubscriptionReadRepository'

@injectable()
export class NotifySubscribersHandler extends EventHandler<VideoPublishedIntegrationEvent> {
	event = VideoPublishedIntegrationEvent

	constructor(
		@inject(PushDeliveryService) private pushService: PushDeliveryService,
		@inject(SubscriptionReadRepository) private subscriptions: SubscriptionReadRepository,
	) { super() }

	async handle(event: VideoPublishedIntegrationEvent) {
		const subscribers = await this.subscriptions.findActiveSubscribersOfChannel(event.payload.channelId)
		for (const userId of subscribers) {
			await this.pushService.deliver({
				userId, kind: 'VIDEO_PUBLISHED',
				videoId: event.payload.videoId, channelId: event.payload.channelId,
				payload: { title: event.payload.title },
			})
		}
	}
}
```

- [ ] **Step 8: Implement `SubscriptionReadRepository`**

Drizzle query against `channel.subscriptions` returning userIds where `unsubscribed_at IS NULL` for a channelId.

- [ ] **Step 9: Wire `handlers/external.ts` + `registry.ts` + `index.ts`**

`external.ts` exports `[NotifySubscribersHandler]`. `registry.ts` binds `PushDeliveryService` per-env (mock/integration/real → Mock/Log/Log). `index.ts` exports the BoundedContext.

- [ ] **Step 10: Add `given.channelWithSubscribers` and `given.pushLog` to TestBed**

Insert directly into `channel.channels`, `channel.subscriptions`, `auth.users` via repos. `given.pushLog.findAllByVideo` reads `notifications.push_log`.

- [ ] **Step 11: Run test → PASS**

```bash
bun --cwd packages/api/ts test src/notifications/handlers/NotifySubscribersHandler.test.ts
```

Expected: PASS — both tests green.

- [ ] **Step 12: tsc + lint + commit**

```bash
bun --cwd packages/api/ts tsc
git add packages/api/ts/src/notifications packages/api/ts/tests
git commit -m "$(cat <<'EOF'
feat(api-ts/notifications): P2b — NotifySubscribersHandler fans out push on video.published

External handler subscribes to integration.video.published, reads
active subscribers of the originating channel, delivers via
PushDeliveryService (Log stub writes to notifications.push_log,
idempotent on (user_id, video_id, kind)).

ref: dev:packages/api/src/clinic/handlers/external.ts (handler shape)
ref: dev:packages/api/src/shared/services/MailSender/MailSender.ts (service interface shape)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: P2c — `VideoFeedProjection` materializes from integration events

**Files:**
- Create: `packages/api/ts/src/ui/projections/VideoFeedProjection.ts`
- Create: `packages/api/ts/src/ui/projections/projectors/VideoFeedProjector.ts`
- Create: `packages/api/ts/src/ui/repositories/VideoFeedProjectionRepository/{interface,Drizzle,Mock,index}.ts`
- Create: `packages/api/ts/src/ui/{registry,index}.ts`
- Test: `packages/api/ts/src/ui/projections/projectors/VideoFeedProjector.test.ts`
- Note: `video_feed_projection` table already exists in `contracts/db/schema/video.ts` per the spec.

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /projection, /projector, /repository, /test
**Depends on:** 6

- [ ] **Step 1: Read recipes**

```bash
# Projection + Projector recipes from dev
git show dev:packages/api/src/ui/projections/<sample>.ts 2>/dev/null
# If ui doesn't have one, channel does
git show dev:packages/channel/internal/channel/projections/channel.go
git show dev:packages/channel/internal/channel/projections/projectors/<sample>.go 2>/dev/null
# Also read this branch's CLAUDE.md First-Class Citizens → Projection / Projector sections
sed -n '/^\*\*Projection\*\*/,/^\*\*Projector\*\*/p' CLAUDE.md
```

Recall the canonical mutation flow: `find → applyEvent → save`. Atomic ops are an edge case — VideoFeed uses find/apply/save (no hot row contention; one row per video).

- [ ] **Step 2: Verify schema column shape**

```bash
git show packages/contracts/db/schema/video.ts | head -100
```

Expect a `video_feed_projection` table with: `id` (PK = videoId), `channelId`, `title`, `description`, `thumbnailUrl`, `duration`, `publishedAt`, `viewCount`, `likeCount`, `dislikeCount`, `commentCount`, `archivedAt nullable`, `version` (optimistic lock).

- [ ] **Step 3: Write the failing projector test**

```typescript
// packages/api/ts/src/ui/projections/projectors/VideoFeedProjector.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import {
	VideoPublishedIntegrationEvent, VideoArchivedIntegrationEvent,
	ReactionAddedIntegrationEvent, CommentPostedIntegrationEvent,
	ViewRecordedIntegrationEvent,
} from '@template/contracts-ts/wire'
import { VideoFeedProjector } from './VideoFeedProjector'
import { VideoFeedProjectionRepository } from '../../repositories/VideoFeedProjectionRepository'

describe('VideoFeedProjector', () => {
	let testBed: TestBed; let testContainer: DependencyContainer
	beforeAll(async () => { testContainer = container.createChildContainer(); testBed = await TestBed.create('integration', { testContainer }) })
	beforeEach(async () => { await testBed.reset() })
	afterAll(async () => { await testBed.destroy() })

	it('inserts a feed row on VideoPublished', async () => {
		const projector = testBed.resolve(VideoFeedProjector)
		await projector.handle(new VideoPublishedIntegrationEvent({
			videoId: 'v1', channelId: 'c1', title: 'Hello', description: 'd', thumbnailUrl: 'http://t', duration: 120, publishedAt: new Date().toISOString(),
		}))
		const repo = testBed.resolve(VideoFeedProjectionRepository)
		const row = await repo.findByVideoId('v1')
		expect(row).toMatchObject({ videoId: 'v1', title: 'Hello', viewCount: 0, likeCount: 0 })
	})

	it('increments likeCount on ReactionAdded(LIKE), dislikeCount on DISLIKE', async () => {
		const projector = testBed.resolve(VideoFeedProjector)
		await projector.handle(new VideoPublishedIntegrationEvent({ videoId: 'v2', channelId: 'c1', title: 't', description: '', thumbnailUrl: 'h', duration: 60, publishedAt: new Date().toISOString() }))
		await projector.handle(new ReactionAddedIntegrationEvent({ videoId: 'v2', userId: 'u1', reactionType: 'LIKE', addedAt: new Date().toISOString() }))
		await projector.handle(new ReactionAddedIntegrationEvent({ videoId: 'v2', userId: 'u2', reactionType: 'DISLIKE', addedAt: new Date().toISOString() }))
		const repo = testBed.resolve(VideoFeedProjectionRepository)
		const row = await repo.findByVideoId('v2')
		expect(row).toMatchObject({ likeCount: 1, dislikeCount: 1 })
	})

	it('increments commentCount on CommentPosted', async () => { /* similar */ })
	it('increments viewCount on ViewRecorded', async () => { /* similar */ })

	it('soft-hides the row on VideoArchived (archivedAt set; feed queries skip it)', async () => {
		const projector = testBed.resolve(VideoFeedProjector)
		await projector.handle(new VideoPublishedIntegrationEvent({ videoId: 'v3', channelId: 'c1', title: 't', description: '', thumbnailUrl: 'h', duration: 60, publishedAt: new Date().toISOString() }))
		await projector.handle(new VideoArchivedIntegrationEvent({ videoId: 'v3', archivedAt: new Date().toISOString() }))
		const repo = testBed.resolve(VideoFeedProjectionRepository)
		const row = await repo.findByVideoId('v3')
		expect(row?.archivedAt).not.toBeNull()
	})
})
```

- [ ] **Step 4: Run → FAIL**

```bash
bun --cwd packages/api/ts test src/ui/projections/projectors/VideoFeedProjector.test.ts
```

- [ ] **Step 5: Implement `VideoFeedProjection`**

```typescript
// packages/api/ts/src/ui/projections/VideoFeedProjection.ts
import { z } from '@template/framework-ts'
import {
	VideoPublishedIntegrationEvent, VideoArchivedIntegrationEvent,
	ReactionAddedIntegrationEvent, CommentPostedIntegrationEvent, ViewRecordedIntegrationEvent,
} from '@template/contracts-ts/wire'

export const VideoFeedProjectionSchema = z.object({
	videoId: z.string(), channelId: z.string(), title: z.string(), description: z.string(),
	thumbnailUrl: z.string(), duration: z.number().int().nonnegative(), publishedAt: z.date(),
	viewCount: z.number().int().nonnegative().default(0),
	likeCount: z.number().int().nonnegative().default(0),
	dislikeCount: z.number().int().nonnegative().default(0),
	commentCount: z.number().int().nonnegative().default(0),
	archivedAt: z.date().nullable().default(null),
	version: z.number().int().nonnegative().default(0),
})
export type VideoFeedProjectionProps = z.infer<typeof VideoFeedProjectionSchema>

export type VideoFeedProjectionEvent =
	| VideoPublishedIntegrationEvent
	| VideoArchivedIntegrationEvent
	| ReactionAddedIntegrationEvent
	| CommentPostedIntegrationEvent
	| ViewRecordedIntegrationEvent

export class VideoFeedProjection {
	constructor(public props: VideoFeedProjectionProps) {}

	static create(event: VideoPublishedIntegrationEvent): VideoFeedProjection {
		const p = event.payload
		return new VideoFeedProjection(VideoFeedProjectionSchema.parse({
			videoId: p.videoId, channelId: p.channelId, title: p.title, description: p.description,
			thumbnailUrl: p.thumbnailUrl, duration: p.duration, publishedAt: new Date(p.publishedAt),
		}))
	}

	applyEvent(event: VideoFeedProjectionEvent): void {
		switch (event.name) {
			case 'integration.video.archived':
				this.props.archivedAt = new Date(event.payload.archivedAt); break
			case 'integration.reaction.added':
				if (event.payload.reactionType === 'LIKE') this.props.likeCount += 1
				else this.props.dislikeCount += 1; break
			case 'integration.comment.posted':
				this.props.commentCount += 1; break
			case 'integration.view.recorded':
				this.props.viewCount += 1; break
			default: { const _x: never = event; void _x }
		}
		this.props.version += 1
	}
}
```

- [ ] **Step 6: Implement `VideoFeedProjectionRepository`**

Interface (`findByVideoId`, `save`, `insertIfNew`) + Drizzle impl writing to `video.video_feed_projection` with optimistic lock on `version`. Mock impl is an in-memory `Map`.

- [ ] **Step 7: Implement `VideoFeedProjector`**

```typescript
// packages/api/ts/src/ui/projections/projectors/VideoFeedProjector.ts
import { injectable, inject } from 'tsyringe-neo'
import { Projector } from '@template/framework-ts'
import { VideoFeedProjection, type VideoFeedProjectionEvent } from '../VideoFeedProjection'
import { VideoFeedProjectionRepository } from '../../repositories/VideoFeedProjectionRepository'

@injectable()
export class VideoFeedProjector extends Projector<VideoFeedProjectionEvent> {
	events = [
		'integration.video.published', 'integration.video.archived',
		'integration.reaction.added', 'integration.comment.posted', 'integration.view.recorded',
	] as const

	constructor(@inject(VideoFeedProjectionRepository) private repo: VideoFeedProjectionRepository) { super() }

	async handle(event: VideoFeedProjectionEvent, tx?: unknown) {
		switch (event.name) {
			case 'integration.video.published':
				await this.repo.insertIfNew(VideoFeedProjection.create(event), tx)
				return
			default: {
				const existing = await this.repo.findByVideoId(event.payload.videoId, tx)
				if (!existing) return  // event for a video the projection doesn't know — drop
				existing.applyEvent(event)
				await this.repo.save(existing, tx)
			}
		}
	}
}
```

- [ ] **Step 8: Run test → PASS**

```bash
bun --cwd packages/api/ts test src/ui/projections/projectors/VideoFeedProjector.test.ts
```

- [ ] **Step 9: tsc + commit**

```bash
bun --cwd packages/api/ts tsc
git add packages/api/ts/src/ui
git commit -m "$(cat <<'EOF'
feat(api-ts/ui): P2c — VideoFeedProjector materializes video_feed_projection

Projection class (find→applyEvent→save canon, no atomic ops needed);
projector subscribes to integration.video.{published,archived},
.reaction.added, .comment.posted, .view.recorded.

ref: dev:packages/channel/internal/channel/projections (projection shape)
ref: CLAUDE.md First-Class Citizens — Projection / Projector

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: P2d — `GET /v1/feed` returns paginated published videos

**Files:**
- Create: `packages/api/ts/src/ui/controllers/feed/GetVideoFeed.ts`
- Create: `packages/api/ts/src/ui/controllers/feed/index.ts`
- Test: `packages/api/ts/src/ui/controllers/feed/GetVideoFeed.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /controller, /schema, /test
**Depends on:** 8

- [ ] **Step 1: Read query recipe**

```bash
git show dev:packages/api/src/ui/controllers/patients/ListPatients.ts
git show dev:packages/api/src/ui/controllers/dashboard/GetDashboard.ts
```

Query use cases in dev's ui live in `controllers/<section>/<Verb>.ts` — controller and use case fused (no separate `usecases/`). They use direct Drizzle, not repository.

- [ ] **Step 2: Write failing test**

```typescript
// GetVideoFeed.test.ts
describe('GET /v1/feed', () => {
	it('returns published videos paginated, newest first, archived excluded', async () => {
		await testBed.given.videoFeedRow({ videoId: 'v1', publishedAt: '2026-05-01' })
		await testBed.given.videoFeedRow({ videoId: 'v2', publishedAt: '2026-05-02' })
		await testBed.given.videoFeedRow({ videoId: 'v3', publishedAt: '2026-05-03', archivedAt: '2026-05-04' })
		const ctrl = testBed.resolve(GetVideoFeedController)
		const res = await ctrl.handle({ query: { limit: 10 } } as any)
		expect(res.status).toBe(200)
		expect(res.body.items.map(i => i.videoId)).toEqual(['v2', 'v1'])
		expect(res.body.nextCursor).toBeNull()
	})

	it('supports cursor pagination', async () => {
		for (let i = 0; i < 15; i++) await testBed.given.videoFeedRow({ videoId: `v${i}`, publishedAt: `2026-05-${String(i+1).padStart(2,'0')}` })
		const ctrl = testBed.resolve(GetVideoFeedController)
		const first = await ctrl.handle({ query: { limit: 10 } } as any)
		expect(first.body.items).toHaveLength(10); expect(first.body.nextCursor).toBeTruthy()
		const second = await ctrl.handle({ query: { limit: 10, cursor: first.body.nextCursor } } as any)
		expect(second.body.items).toHaveLength(5)
	})
})
```

- [ ] **Step 3: Implement controller**

```typescript
// GetVideoFeed.ts
import { injectable, inject } from 'tsyringe-neo'
import { z, Controller, type Drizzle } from '@template/framework-ts'
import { video as videoSchema } from '@template/contracts/db'
import { and, desc, isNull, lt, sql } from 'drizzle-orm'

const InputSchema = z.object({
	query: z.object({
		limit: z.coerce.number().int().min(1).max(50).default(20),
		cursor: z.string().optional(),
	}),
})
const OutputSchema = z.object({
	items: z.array(z.object({
		videoId: z.string(), channelId: z.string(), title: z.string(),
		thumbnailUrl: z.string(), publishedAt: z.string(),
		viewCount: z.number(), likeCount: z.number(),
	})),
	nextCursor: z.string().nullable(),
})

@injectable()
export class GetVideoFeedController extends Controller {
	method = 'GET' as const; path = '/v1/feed' as const
	input = InputSchema; output = OutputSchema
	constructor(@inject('Drizzle') private db: Drizzle) { super() }

	async handle(req: z.infer<typeof InputSchema>) {
		const { limit, cursor } = req.query
		const cursorDate = cursor ? new Date(Buffer.from(cursor, 'base64').toString()) : null
		const rows = await this.db.select().from(videoSchema.videoFeedProjection)
			.where(and(
				isNull(videoSchema.videoFeedProjection.archivedAt),
				cursorDate ? lt(videoSchema.videoFeedProjection.publishedAt, cursorDate) : undefined,
			))
			.orderBy(desc(videoSchema.videoFeedProjection.publishedAt))
			.limit(limit + 1)

		const items = rows.slice(0, limit).map(r => OutputSchema.shape.items.element.parse(r))
		const nextCursor = rows.length > limit
			? Buffer.from(rows[limit - 1].publishedAt.toISOString()).toString('base64')
			: null
		return { status: 200, body: { items, nextCursor } }
	}
}
```

- [ ] **Step 4: Wire to controllers index + run tests → PASS**

```bash
bun --cwd packages/api/ts test src/ui/controllers/feed/
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(api-ts/ui): P2d — GET /v1/feed cursor-paginated read of video_feed_projection (ref: dev:packages/api/src/ui/controllers/dashboard/GetDashboard.ts)"
```

---

## Task 10: P2d — `GET /v1/channels/:handle` returns channel page (channel + recent videos)

**Files:**
- Create: `packages/api/ts/src/ui/controllers/channels/GetChannelPage.ts`
- Test: same path with `.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /query, /controller, /test
**Depends on:** 8

- [ ] **Step 1: Recipe** — `git show dev:packages/api/src/ui/controllers/patients/GetPatientDetails.ts` (composite get pattern).
- [ ] **Step 2: Failing test** — handle returns 404 on unknown handle; returns channel + last 10 videos when handle resolves.
- [ ] **Step 3: Implement** — Drizzle join `channel.channels` (by handle) + top-10 from `video.video_feed_projection` where `channelId = channels.id and archivedAt IS NULL`.
- [ ] **Step 4: Run test → PASS, commit** with ref.

---

## Task 11: P2d — `GET /v1/videos/:videoId` returns video detail

**Files:** `packages/api/ts/src/ui/controllers/videos/GetVideoDetail.ts` + test.
**Skills:** /query /controller /test. **Depends on:** 8.

- [ ] **Step 1**: Recipe — `git show dev:packages/api/src/ui/controllers/services/GetServiceDetails.ts`.
- [ ] **Step 2**: Failing test — 404 unknown video; returns title, description, hls url, chapters[], captions[] when present.
- [ ] **Step 3**: Implement — Drizzle join feed projection + chapters + captions.
- [ ] **Step 4**: PASS, commit.

---

## Task 12: P2d — `GET /v1/me/watch-history` returns user's watch history

**Files:** `packages/api/ts/src/ui/controllers/me/GetMyWatchHistory.ts` + test.
**Skills:** /query /controller /test. **Depends on:** 8.

- [ ] **Step 1**: Recipe — `git show dev:packages/api/src/ui/controllers/user/GetUserInfo.ts`.
- [ ] **Step 2**: Failing test — requires session (returns 401 anonymous); returns ordered list of viewed videos newest first.
- [ ] **Step 3**: Implement — Drizzle query against `engagement.views` joined with `video.video_feed_projection`, filtered by `userId = session.userId`.
- [ ] **Step 4**: PASS, commit.

---

## Task 13: P2d — `GET /v1/search?q=...` returns FTS-ranked videos

**Files:** `packages/api/ts/src/ui/controllers/search/SearchVideos.ts` + test.
**Skills:** /query /controller /test. **Depends on:** 8.

- [ ] **Step 1**: Recipe — `git show dev:packages/api/src/ui/controllers/patients/ListPatients.ts` (search query shape).
- [ ] **Step 2**: Failing test — empty `q` returns 400; populated `q` returns videos ranked by `ts_rank` against `search.video_search_index` (table populated by api-go in Task 28).
- [ ] **Step 3**: Implement — `to_tsquery(plainto_tsquery(q))` against the GIN-indexed `tsvector` column.
- [ ] **Step 4**: PASS, commit.

---

## Task 14: P2 wire-up — api-ts boots, openapi.json emits, dev server smokes

**Files:**
- Modify: `packages/api/ts/src/index.ts` — bootstrap all contexts via `BoundedContext.create({ children: [auth, notifications, ui], registry: ALL_REGISTRIES, setup: starts outbox dispatcher })`
- Create: `packages/api/ts/src/shared/registry.ts` — `ALL_REGISTRIES` composing per-context registries
- Modify: `packages/api/ts/scripts/emit-openapi.ts` — already exists per `bun emit-openapi` script; verify it produces `dist/openapi.json`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /bounded-context, /sdk
**Depends on:** 6, 7, 8, 9, 10, 11, 12, 13

- [ ] **Step 1**: Recipe — `git show dev:packages/api/src/index.ts` for the BoundedContext bootstrap pattern.
- [ ] **Step 2**: Implement `src/index.ts` mirroring dev's root BoundedContext.create call.
- [ ] **Step 3**: `bun --cwd packages/api/ts run dev` (kill after 5 seconds) — expect server listens on the configured port, logs "ready". Use `curl http://localhost:3030/v1/session` → 401 expected.
- [ ] **Step 4**: `bun emit-openapi` — verify `packages/api/ts/dist/openapi.json` contains GET /v1/session, GET /v1/feed, GET /v1/channels/{handle}, GET /v1/videos/{videoId}, GET /v1/me/watch-history, GET /v1/search.
- [ ] **Step 5**: Contract Lock — `bun sdk` regenerates client-ts; `bun tsc --noEmit` across workspaces; commit `feat(api-ts): P2 wire-up — full context bootstrap + openapi emit (Task 14)`.

---

## Task 15: P3a — Creator drafts a video; `POST /v1/videos` returns videoId + upload URL

**Files (api-rs):**
- Create: `packages/api/rs/src/video/entities/{video,video_chapter,video_caption}.rs`
- Create: `packages/api/rs/src/video/objects/{video_title,video_slug,duration}.rs`
- Create: `packages/api/rs/src/video/enums/video_status.rs` (state machine; `pub fn can_transition_to(...) -> bool`)
- Create: `packages/api/rs/src/video/errors/mod.rs` (`VIDEO_ALREADY_PUBLISHED`, `INVALID_STATUS_TRANSITION`, `CHAPTER_TIMESTAMP_OUT_OF_BOUNDS`)
- Create: `packages/api/rs/src/video/events/video_created.rs` (domain event via macro)
- Create: `packages/api/rs/src/video/repositories/video_repository/{mod,pg,mock}.rs`
- Create: `packages/api/rs/src/video/services/{storage_service.rs, local_fs_storage_service.rs}`
- Create: `packages/api/rs/src/video/usecases/{create_video.rs, create_video.test.rs}`
- Create: `packages/api/rs/src/video/controllers/{create_video.rs, mod.rs}`
- Create: `packages/api/rs/src/video/mod.rs`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /entity, /value-object, /enum, /repository, /usecase, /controller, /errors, /service, /test
**Depends on:** 5

- [ ] **Step 1: Read recipes**

```bash
git show feat/polyglot:packages/api-rs/src/game/entities/game.rs
git show feat/polyglot:packages/api-rs/src/game/objects/game_title.rs
git show feat/polyglot:packages/api-rs/src/game/enums/game_status.rs
git show feat/polyglot:packages/api-rs/src/game/repositories/game_repository/mod.rs
git show feat/polyglot:packages/api-rs/src/game/repositories/game_repository/pg.rs
git show feat/polyglot:packages/api-rs/src/game/usecases/create_game.rs
git show feat/polyglot:packages/api-rs/src/game/usecases/create_game.test.rs
git show feat/polyglot:packages/api-rs/src/game/controllers/create_game.rs
```

The macros DSL is documented in `packages/api/rs/framework/macros/src/dsl.rs` — read it before authoring entities/value objects/events.

- [ ] **Step 2: Write the failing usecase test**

```rust
// packages/api/rs/src/video/usecases/create_video.test.rs
// Mirror feat/polyglot:packages/api-rs/src/game/usecases/create_game.test.rs verbatim,
// substituting game → video, Game → Video, GameTitle → VideoTitle, etc.
// Assert: POST returns Ok((videoId, uploadUrl)); video persisted with status=UPLOADING;
// VideoCreated domain event in outbox.
```

- [ ] **Step 3: Run test → FAIL** with `cargo test -p template-api-rs create_video`.

- [ ] **Step 4: Implement entity** with `entity!` macro per game.rs recipe. Behavior methods: `Video::create(input)`, `Video::mark_uploaded(...)`, `Video::mark_transcoded(...)`, `Video::publish(...)`, `Video::archive(...)`. Each transition validates via `VideoStatus::can_transition_to`.

- [ ] **Step 5: Implement value objects** — `VideoTitle` (3..200 chars), `VideoSlug` (regex `^[a-z0-9-]+$`), `Duration` (>= 0 seconds).

- [ ] **Step 6: Implement enum + state machine** — `VideoStatus` with variants `UPLOADING`, `PROCESSING`, `READY`, `PUBLISHED`, `ARCHIVED`, `FAILED`; `pub fn valid_next_states(&self) -> &'static [VideoStatus]`.

- [ ] **Step 7: Implement error catalog** via `error_codes!` macro per feat/polyglot:game/errors/mod.rs.

- [ ] **Step 8: Implement VideoCreated domain event** via `domain_event!` macro.

- [ ] **Step 9: Implement repository** — interface in `mod.rs`, `pg.rs` uses `SELECT to_jsonb(t) FROM video.videos WHERE id = $1` + `Video::parse(json)?`. Mock in `mock.rs` uses in-memory `HashMap`.

- [ ] **Step 10: Implement `StorageService` trait + `LocalFsStorageService` stub** — `sign(video_id) -> Url`; stub writes to `/tmp/template-storage/` and returns a self-hosted URL the storage webhook will pick up.

- [ ] **Step 11: Implement `CreateVideo` use case** — orchestrates: load nothing → `Video::create(...)` → `repo.save` + `domain_event_repo.save_for_aggregate(video)` inside UoW → return `(videoId, storage.sign(...))`.

- [ ] **Step 12: Implement `create_video` controller** — POST `/v1/videos`, input schema (title, channelId), output schema (videoId, uploadUrl).

- [ ] **Step 13: Run test → PASS**, then `cargo check`, `cargo test -p template-api-rs`.

- [ ] **Step 14: Commit** with multi-line ref block citing each recipe path.

---

## Task 16: P3a — Storage webhook flips video to PROCESSING

**Files (api-rs):**
- Create: `packages/api/rs/src/video/usecases/mark_video_uploaded.rs` (+ test)
- Create: `packages/api/rs/src/video/events/video_uploaded.rs`
- Create: `packages/api/rs/src/video/controllers/storage_webhook.rs` (POST `/v1/webhooks/storage/upload-complete`)
- Modify: `packages/api/rs/framework/src/middleware/` — add `idempotency.rs` + `signature_verify.rs` if not already present (verify via `ls packages/api/rs/framework/src/middleware/`)

**Skills:** /usecase /event /controller /middleware /webhook /test. **Depends on:** 15.

- [ ] **Step 1**: Recipe — `git show feat/polyglot:packages/api-rs/src/game/usecases/update_game.rs` (use case modifying existing aggregate). For webhook middleware, `git show feat/polyglot:packages/api-rs/src/shared/middleware/idempotency.rs` if present.
- [ ] **Step 2**: Failing test — webhook hits controller with valid signature → use case → `Video.mark_uploaded()` → status UPLOADING→PROCESSING; `VideoUploaded` in outbox. Replay (same idempotency-key) → no-op.
- [ ] **Step 3**: Implement entity behavior method `mark_uploaded` (validates state transition; raises `VideoUploaded`).
- [ ] **Step 4**: Implement `MarkVideoUploaded` use case + `VideoUploaded` domain event.
- [ ] **Step 5**: Implement `signature_verify` + `idempotency` middlewares in framework (only if not already present from feat/polyglot lift). Reusable across all webhooks.
- [ ] **Step 6**: Implement controller + wire middlewares.
- [ ] **Step 7**: Run cargo test → PASS, commit.

---

## Task 17: P3a — Transcoder webhook flips video to READY (optionally PUBLISHED if channel.autoPublish)

**Files:** mirrors Task 16 shape — `mark_video_transcoded` usecase + `video_transcoded` event + `transcoder_webhook.rs` controller + `publish_on_transcoded.rs` internal handler that conditionally invokes `PublishVideo` if `channel.auto_publish` is true.

**Skills:** /usecase /event /handler /controller /test. **Depends on:** 16.

- [ ] **Steps 1–7**: Same TDD shape as Task 16, with: failing test asserts duration + hlsUrl + thumbnailUrl persist; status → READY; if `Channel.auto_publish=true`, `VideoPublished` also in outbox (handler invoked synchronously inside UoW); if false, manual publish required (covered by Task 18).

---

## Task 18: P3a — `POST /v1/videos/:id/publish` publishes a READY video

**Files:** `publish_video.rs` (usecase + controller + test).
**Skills:** /usecase /controller /test. **Depends on:** 17.

- [ ] Failing test: publish a READY video → status PUBLISHED; `VideoPublished` integration event published via `PublishOnPublishedHandler` (internal handler reads domain event → publishes integration event via `ExternalMediator`).
- [ ] Implement: usecase orchestrates load → `video.publish(actor)` → save+outbox.
- [ ] Implement: internal handler `publish_on_published.rs` — reads `VideoPublished` domain event, publishes `integration.video.published` (constructed from `template-contracts-rs::wire::VideoPublishedIntegrationEvent`).
- [ ] Run cargo test, commit.

---

## Task 19: P3a — `POST /v1/videos/:id/archive` archives a published video

**Files:** `archive_video.rs` usecase + controller + handler (`publish_on_archived.rs`) + test.
**Skills:** /usecase /controller /handler /test. **Depends on:** 18.

- [ ] Failing test: archive a PUBLISHED video → status ARCHIVED; `integration.video.archived` in outbox.
- [ ] Implement entity method `video.archive()`, usecase, controller, internal handler.
- [ ] Run cargo test, commit.

---

## Task 20: P3b — Subscriber joins/leaves a channel; ChannelStatsProjector atomic-increments

**Files (api-rs):**
- Create: `packages/api/rs/src/channel/{entities/channel.rs, entities/subscription.rs, objects/channel_handle.rs, errors/mod.rs, events/{channel_subscribed,channel_unsubscribed}.rs}`
- Create: `packages/api/rs/src/channel/projections/{channel_stats_projection.rs, projectors/channel_stats_projector.rs}`
- Create: `packages/api/rs/src/channel/repositories/{channel_repository, subscription_repository, channel_stats_projection_repository}/{mod,pg,mock}.rs`
- Create: `packages/api/rs/src/channel/usecases/{create_channel,subscribe_to_channel,unsubscribe_from_channel}.rs` + tests
- Create: `packages/api/rs/src/channel/controllers/{create_channel,subscribe_to_channel,unsubscribe_from_channel}.rs`
- Create: `packages/api/rs/src/channel/handlers/internal.rs` (publishes integration events on subscribe/unsubscribe)
- Create: `packages/api/rs/src/channel/mod.rs`

**Skills:** /entity /value-object /repository /usecase /controller /projection /projector /event /handler /test. **Depends on:** 5.

- [ ] **Step 1**: Recipe — feat/polyglot has no direct channel context recipe. Use `feat/polyglot:packages/api-rs/src/game/` for general shape and `dev:packages/channel/internal/channel/` (Go) for the channel/subscription split.
- [ ] **Step 2**: Failing tests covering:
  - subscribe → `Subscription` row + `ChannelSubscribed` domain event + ChannelStats projector atomically increments `subscriber_count`.
  - unsubscribe → `Subscription.cancelled_at` set; projector atomically decrements.
  - re-subscribe within same actor → no duplicate row, no double increment (idempotency on (channel_id, user_id)).
- [ ] **Step 3**: Implement channel + subscription entities, ChannelHandle VO (regex `^@[a-z0-9_]{3,30}$`).
- [ ] **Step 4**: Implement ChannelStatsProjection (free record, schema-driven, NO base class) + ChannelStatsProjectionRepository with **atomic ops only** (`increment_subscriber_count`, `decrement_subscriber_count`) per CLAUDE.md projection rules.
- [ ] **Step 5**: Implement ChannelStatsProjector — uses atomic ops, not find→apply→save (hot row contention justifies the edge case).
- [ ] **Step 6**: Implement use cases + controllers + internal handler that publishes integration events.
- [ ] **Step 7**: Run cargo test → PASS, commit.

---

## Task 21: P3c — Viewer posts a comment; profanity refinement blocks bad words

**Files (api-rs):**
- Create: `packages/api/rs/src/engagement/entities/comment.rs`
- Create: `packages/api/rs/src/engagement/objects/comment_body.rs` (Zod-equivalent refinement via z.* DSL with `.refine(profanity_check)`)
- Create: `packages/api/rs/src/engagement/services/{profanity_service.rs, wordlist_profanity_service.rs}`
- Create: `packages/api/rs/src/engagement/errors/mod.rs` (`PROFANE_COMMENT`)
- Create: `packages/api/rs/src/engagement/events/comment_posted.rs`
- Create: `packages/api/rs/src/engagement/repositories/comment_repository/{mod,pg,mock}.rs`
- Create: `packages/api/rs/src/engagement/usecases/post_comment.rs` + test
- Create: `packages/api/rs/src/engagement/controllers/post_comment.rs`
- Create: `packages/api/rs/src/engagement/handlers/internal.rs`

**Skills:** /entity /value-object /service /errors /usecase /controller /event /handler /test. **Depends on:** 18.

- [ ] **Step 1**: Recipe — `git show feat/polyglot:packages/api-rs/src/game/objects/game_title.rs` (VO with regex refinement); the wordlist profanity service is novel — design: `WordlistProfanityService` loads a `static WORDLIST: &[&str]` and exposes `pub fn check(body: &str) -> Result<(), ProfanityError>`.
- [ ] **Step 2**: Failing tests:
  - clean comment → persists; `CommentPosted` event raised.
  - profane comment → `PROFANE_COMMENT` error; no persistence; no event.
  - rate limit (10 comments/min/actor) — defer to a separate middleware task or fold here via the framework's RateLimit middleware. **YAGNI:** if RateLimit isn't already in framework, skip; cover in a P3-future task.
- [ ] **Step 3–7**: Implement entities/objects/service/usecase/controller/handler. Commit.

---

## Task 22: P3c — Viewer reacts to a video (atomic upsert + ReactionAdded)

**Files (api-rs):**
- Create: `packages/api/rs/src/engagement/repositories/reaction_repository/{mod,pg,mock}.rs` (atomic ops: `upsert_reaction(video_id, user_id, reaction_type)`, `delete_reaction(video_id, user_id)`)
- Create: `packages/api/rs/src/engagement/events/reaction_added.rs`
- Create: `packages/api/rs/src/engagement/usecases/react_to_video.rs` + test
- Create: `packages/api/rs/src/engagement/controllers/react_to_video.rs`

**Skills:** /repository /usecase /event /controller /test. **Depends on:** 18.

- [ ] Failing test: `POST /v1/videos/:id/reactions { type: LIKE }` → upserts (idempotent on (video_id, user_id)); subsequent DELETE removes; emits `integration.reaction.added`.
- [ ] Implement repository with atomic `INSERT … ON CONFLICT (video_id, user_id) DO UPDATE SET reaction_type = EXCLUDED.reaction_type`.
- [ ] Implement usecase + controller. Reactions don't go through Comment-like entity; the atomic op + integration event is the whole flow.
- [ ] Run test, commit.

---

## Task 23: P3c — Viewer records a view (atomic upsert + ViewRecorded)

**Files:** mirror Task 22 shape for views — `view_repository`, `view_recorded.rs`, `record_view.rs` usecase + controller.
**Skills:** /repository /usecase /event /controller /test. **Depends on:** 18.

- [ ] Failing test: `POST /v1/videos/:id/views { positionSec, durationSec }` → atomic insert on first call; UPDATE on replay; emits `integration.view.recorded`.
- [ ] Implement + test + commit.

---

## Task 24: P3d — `GET /v1/events` SSE broadcasts integration envelopes to connected clients

**Files (api-rs):**
- Create: `packages/api/rs/src/sse/services/fanout.rs` (OnceLock<Fanout> + per-client mpsc Sender, 15s KeepAlive)
- Create: `packages/api/rs/src/sse/controllers/listen_events.rs` (GET `/v1/events`)
- Create: `packages/api/rs/src/sse/mod.rs`
- Modify: external mediator wiring to also forward to Fanout

**Skills:** /controller /service /test. **Depends on:** 18.

- [ ] **Step 1**: Recipe — `git show feat/polyglot:packages/api-rs/src/shared/services/external_mediator/redis.rs` and any `sse/` or `fanout` paths in feat/polyglot or feat/clean-rust.
- [ ] **Step 2**: Failing integration test — connects to `/v1/events`, publishes a fake `integration.video.published` to the Fanout, asserts the SSE stream emits the envelope JSON.
- [ ] **Step 3**: Implement Fanout (Arc-cloneable, holds Vec<UnboundedSender<IntegrationEventEnvelope>>; broadcasts to all).
- [ ] **Step 4**: Implement controller using axum's `Sse` response + tokio-stream.
- [ ] **Step 5**: Modify external mediator (or add an outbox dispatcher fan-out hook) to push envelopes to Fanout in addition to Redis Streams.
- [ ] **Step 6**: Run cargo test + commit.

---

## Task 25: P3e — api-rs wired end-to-end: axum server + container + outbox dispatcher

**Files (api-rs):**
- Modify: `packages/api/rs/src/main.rs` — axum bootstrap, mount routes (video, channel, engagement, webhooks, sse), tracing init, DB pool, outbox dispatcher start
- Create: `packages/api/rs/src/shared/container.rs` — per-app DI container composing all context registries
- Modify: `packages/api/rs/src/lib.rs` — `pub mod {video,channel,engagement,sse,shared}`
- Create: `packages/api/rs/scripts/emit-openapi.rs` (or equivalent if utoipa is the path) — produces `dist/openapi.json`

**Skills:** /bounded-context /sdk. **Depends on:** 15-24.

- [ ] **Step 1**: Recipe — `git show feat/polyglot:packages/api-rs/src/main.rs`, `git show feat/polyglot:packages/api-rs/src/shared/container.rs`.
- [ ] **Step 2**: Implement main + container.
- [ ] **Step 3**: Boot test — `cargo run -p template-api-rs` (kill after 5 seconds) + curl GET /healthz → 200.
- [ ] **Step 4**: Emit OpenAPI via utoipa, verify endpoints present.
- [ ] **Step 5**: Run `bun sdk` regenerates client-rs (Contract Lock). Commit.

---

## Task 26: P4a — `integration.video.uploaded` triggers transcoder stub which calls back via SDK

**Files (api-go):**
- Create: `packages/api/go/transcoding/services/transcoder_service.go` (interface)
- Create: `packages/api/go/transcoding/services/stub_transcoder_service.go` (sleeps 10s; calls api-rs `POST /v1/webhooks/transcoder/job-done` via client-go SDK)
- Create: `packages/api/go/transcoding/handlers/external.go` (subscribes to `integration.video.uploaded`)
- Create: `packages/api/go/transcoding/handlers/enqueue_transcoding_job_handler.go` + test
- Create: `packages/api/go/transcoding/module.go` (fx.Module)

**Skills:** /handler /service /test. **Depends on:** 5, 16.

- [ ] **Step 1**: Recipe — `git show dev:packages/channel/internal/channel/handlers/external.go` (external handler in Go) and `git show dev:packages/channel/internal/channel/services/gateway/whatsapp/whatsapp.go` (external SDK call pattern).
- [ ] **Step 2**: Failing test — consumes a fake `integration.video.uploaded` envelope, expects `StubTranscoderService.Start` called with the videoId; verifies SDK-callback hits a mocked api-rs endpoint after the configured sleep (use a 100ms sleep in tests).
- [ ] **Step 3**: Implement transcoder service stub + handler + module.
- [ ] **Step 4**: Run `go test ./...`, commit.

---

## Task 27: P4b — `integration.video.published` indexes video into search

**Files (api-go):**
- Create: `packages/api/go/search/projections/{video_search_projection.go, video_search_projection_repository.go}`
- Create: `packages/api/go/search/projections/projectors/video_search_projector.go`
- Create: `packages/api/go/search/handlers/external.go`
- Create: `packages/api/go/search/handlers/index_video_handler.go` + test
- Create: `packages/api/go/search/module.go`
- Note: `search.video_search_index` table (with `tsvector` GIN-indexed column) already exists per contracts/db/schema/search.ts.

**Skills:** /projection /projector /handler /test. **Depends on:** 5, 18.

- [ ] **Step 1**: Recipe — `git show dev:packages/channel/internal/channel/projections/message.go` + `projectors/<sample>.go`.
- [ ] **Step 2**: Failing test — handler receives `integration.video.published` → projection row inserted with `to_tsvector('english', title || ' ' || description)`.
- [ ] **Step 3**: Implement projection + repo + projector + handler.
- [ ] **Step 4**: Add a second failing test — handler receives `integration.video.archived` → row deleted.
- [ ] **Step 5**: `go test ./...`, commit.

---

## Task 28: P4c — `integration.view.recorded` batched 5s + atomic increment on analytics

**Files (api-go):**
- Create: `packages/api/go/analytics/projections/video_watch_analytics.go` + repository (atomic `increment_view_count_batch(videoId, count)`)
- Create: `packages/api/go/analytics/projections/projectors/view_analytics_projector.go`
- Create: `packages/api/go/analytics/services/batch_aggregator.go` (5s window; flushes counts via atomic op)
- Create: `packages/api/go/analytics/handlers/external.go`
- Create: `packages/api/go/analytics/handlers/aggregate_view_handler.go` + test
- Create: `packages/api/go/analytics/module.go`

**Skills:** /projection /projector /handler /service /test. **Depends on:** 5, 23.

- [ ] **Step 1**: Recipe — `git show dev:packages/channel/internal/channel/services/<any>.go` for the long-running aggregator goroutine pattern.
- [ ] **Step 2**: Failing test — emits 50 view events for 3 videos within 5s; expects 3 single atomic UPDATEs (not 50), counts sum correctly.
- [ ] **Step 3**: Implement batch aggregator (in-memory map<videoId, count>, ticker every 5s, drains map and calls atomic increment per videoId).
- [ ] **Step 4**: Implement handler that enqueues into the aggregator.
- [ ] **Step 5**: `go test ./...`, commit.

---

## Task 29: P4c — Nightly `AggregateDailyAnalyticsJob` rolls up daily stats

**Files (api-go):**
- Create: `packages/api/go/analytics/jobs/aggregate_daily_analytics_job.go` + test
- Create: `packages/api/go/analytics/projections/video_daily_stats.go` + repository
- Modify: `packages/api/go/analytics/module.go` to register the cron job

**Skills:** /service /test. **Depends on:** 28.

- [ ] **Step 1**: Recipe — `git show dev:packages/channel/internal/<any cron-scheduled job>` or fx-scheduled service. If dev has no cron pattern, use a simple ticker-driven goroutine started by fx lifecycle (`OnStart`).
- [ ] **Step 2**: Failing test — given today's hourly view counts in `video_watch_analytics`, when job runs at 00:05, `video_daily_stats` has one row per video summing yesterday's hourly buckets.
- [ ] **Step 3**: Implement job (reads `video_watch_analytics` for date range, upserts into `video_daily_stats`).
- [ ] **Step 4**: Wire fx lifecycle. `go test ./...`, commit.

---

## Task 30: P4d — api-go wired end-to-end: fx.New with all modules; main boots

**Files (api-go):**
- Modify: `packages/api/go/cmd/api/main.go` — `fx.New(framework.SharedModule, transcoding.Module, search.Module, analytics.Module).Run()`
- Modify: `packages/api/go/go.mod` if any new deps emerged from Tasks 26–29

**Skills:** /bounded-context. **Depends on:** 26, 27, 28, 29.

- [ ] **Step 1**: Recipe — `git show dev:packages/channel/cmd/api/main.go`.
- [ ] **Step 2**: Implement main; boot test — `go run ./cmd/api` (kill after 5s); verify fx logs all modules registered, outbox dispatcher started, redis stream consumer subscribed.
- [ ] **Step 3**: `go build ./... && go test ./...`. Commit.

---

## Task 31: Contract Lock — full SDK regen + cross-language smoke

**Files:**
- Regen: `packages/api/ts/dist/openapi.json`
- Regen: `packages/api/rs/dist/openapi.json`
- Regen: `packages/api/go/dist/openapi.json`
- Regen: `packages/client/ts/dist/**`
- Regen: `packages/client/rs/src/**`
- Regen: `packages/client/go/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** 14, 25, 30

- [ ] **Step 1**: Run `bun emit-openapi` across all three apis.
- [ ] **Step 2**: Run `bun sdk` (or each language equivalent: `bun sdk:ts`, `cargo run -p client-rs --bin generate`, `go generate ./packages/client/go/...`).
- [ ] **Step 3**: Verify each generated client exposes hooks/functions for every endpoint introduced in Tasks 6, 9–13, 15–24.
- [ ] **Step 4**: `bun tsc --noEmit && cargo check --workspace && (cd packages/api/go && go build ./...)`.
- [ ] **Step 5**: §5.4 smoke — boot all 3 apis (`bun dev`), then:
  ```bash
  curl -X POST http://localhost:3031/v1/videos -H 'Cookie: <session>' \
       -d '{"title":"Hello","channelId":"<ch>"}'
  # Note videoId + uploadUrl
  curl -X POST <uploadUrl> --data-binary @./test-video.mp4
  # Storage stub triggers POST /v1/webhooks/storage/upload-complete on api-rs
  # api-go consumes integration.video.uploaded, sleeps, fires transcoder webhook
  # api-rs flips to READY; if autoPublish, to PUBLISHED
  # api-ts VideoFeedProjector inserts; api-go IndexVideoHandler indexes
  curl http://localhost:3030/v1/feed   # video appears
  curl http://localhost:3030/v1/search?q=Hello   # FTS hits
  ```
- [ ] **Step 6**: Commit:
  ```bash
  git add packages/api/*/dist packages/client
  git commit -m "chore(sdk+smoke): Task 31 — Contract Lock + §5.4 vertical-slice smoke across api-ts/rs/go"
  ```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun test` — all tests pass (TS)
- [ ] `cargo test --workspace` — all tests pass (RS)
- [ ] `(cd packages/api/go && go test ./...)` — all tests pass (GO)
- [ ] `bun contracts` end-to-end clean (re-emit + drizzle generate)
- [ ] `bun dev` boots api-ts:3030 + api-rs:3031 + api-go:3032 + app-web concurrently
- [ ] AC mapping (every spec AC → ≥1 test path):
  - **US-1 (one bounded context = full pattern visibility)** → manual review of `packages/api/{ts,rs,go}/src/<ctx>/` for First-Class-Citizen folders; per-task recipe `ref:` in commit history substantiates.
  - **US-2 (strip a backend cleanly)** → out of scope for this plan; covered in P8 of the spec (future plan).
  - **US-3 (recipe traceability)** → every commit ends with `ref: <branch>:<path>` (or `ref: superpowers/specs/...` for spec-level decisions). Reviewer enforces.
  - **US-4 (§5.4 vertical slice end-to-end on fresh clone)** → Task 31 Step 5 smoke.
  - **US-5 (stub swap without domain change)** → `StorageService`/`TranscoderService`/`PushDeliveryService`/`ProfanityService` interfaces live in their owning contexts (Task 15 Step 10, Task 21 Step 4, Task 7 Step 4, Task 26 Step 3); stubs registered in `registry.{ts,rs,go}` only.
  - **US-6 (frameworks build independently)** → `packages/api/ts/framework/src/__tests__/structure.test.ts` (Task 2); `cargo check -p template-framework-rs` (Task 3 Step 6); `(cd packages/api/go/framework && go build ./... && go test ./...)` (Task 4 Step 6).

## Notes

- **Graph CLI broken.** `bun scripts/graph/cli/index.ts build` errors on `packages/channel/internal/` (no such directory). Skipped during plan validation. After Tasks 26–30 land, re-run `bun scripts/graph/cli/index.ts build` to reindex against the new layout; expect it to succeed once the api-go tree matches the recipe shapes.
- **better-auth schema columns.** Task 6 Step 2 verifies that `contracts/db/schema/auth.ts` matches better-auth's expectations. If drift exists, file a separate `migrate` task (out of scope here) and pause Task 6 until the schema is corrected.
- **`push_log` table.** Task 7 Step 2 verifies presence. If absent in `contracts/db/schema/notifications.ts`, the task adds the table in-line; expect a Drizzle migration to land with that commit.
- **No new framework primitives mid-domain.** Per spec §Anti-invention guardrails. The `signature_verify` + `idempotency` middlewares are introduced in Task 16 as **framework** changes if absent — and that PR touches zero domain code (split commit if a single working tree branch).
- **Rate limit middleware not in scope.** Task 21 Step 2 leaves rate-limit as a P3-future task — the spec's pattern allocation lists `RateLimit` but the user stories don't include it as an AC. YAGNI applies; defer.
- **Frontends + E2E deferred** to Plans #6/#7 per the original scoping conversation.
- **§5.4 vertical-slice smoke** is the single end-to-end acceptance test wired through Task 31. If §5.4 doesn't pass on a fresh clone after this plan completes, treat as a bug and reopen the failing leg.
- **Anti-invention reviewer prompt.** Each task's `Reviewer: spec-compliance-reviewer` instance must verify: (a) every new file has a matching `ref:` in the commit body, (b) no abstractions appear that the spec didn't ask for (no `<X>Service`/`<X>Helper`/`<X>Factory` unless an AC requires it), (c) no test backdoors in production code.
