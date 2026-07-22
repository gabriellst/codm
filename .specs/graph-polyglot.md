# Graph CLI — Polyglot Data Model

> Status: design pinned. Implementation in flight (`scripts/graph/`).

## Purpose

`bun cli graph` builds a queryable code graph spanning every workspace in this monorepo so we can answer:

- *What depends on this entity / enum / contract event?*
- *What breaks if I change this controller?*
- *Which skill registry applies to a file in this workspace + language?*
- *Where does this OpenAPI operation surface in each generated SDK?*

The graph was originally built around a single TS backend (`packages/api/src`) and a single TS frontend (`packages/app/src`). The repo is now polyglot — TS + Rust + Go backends, React + Expo + Astro frontends, contracts as source of truth, generated SDKs as derived layers. This spec is the post-rebuild data model.

## Workspace matrix

Workspaces are records, not an enum. Adapters iterate the matrix and filter by `lang` / `role`.

```ts
interface Workspace {
  id: string                                                 // 'api-typescript'
  role: 'api' | 'app' | 'contracts' | 'client' | 'e2e'
  lang: 'typescript' | 'rust' | 'go'
  root: string                                               // 'packages/api/typescript'
  src: string                                                // 'packages/api/typescript/src'
  tsconfig?: string
  openapi?: string                                           // api workspaces only
  locales?: string                                           // frontend workspaces only
  generated?: true                                           // dist/ + generated/ outputs
}
```

Concrete entries:

| id | role | lang | src | extras |
|---|---|---|---|---|
| `contracts` | contracts | typescript | `packages/contracts` | wire `.tsp` lives under `wire/`, db schema under `db/schema` |
| `api-typescript` | api | typescript | `packages/api/typescript/src` | openapi: `packages/api/typescript/public/docs/openapi.json` |
| `api-rust` | api | rust | `packages/api/rust/src` | openapi: `packages/api/rust/public/docs/openapi.json` |
| `api-go` | api | go | `packages/api/go/internal` | openapi: `packages/api/go/public/openapi.json` |
| `app-react` | app | typescript | `packages/app/react/src` | locales: `src/locales` |
| `app-expo` | app | typescript | `packages/app/expo` | locales: `locales`, routes anchor: `app/` |
| `app-astro` | app | typescript | `packages/app/astro/src` | routes anchor: `pages/`, file ext `.astro` |
| `client-typescript` | client | typescript | `packages/client/dist/typescript/src` | generated |
| `client-rust` | client | rust | `packages/client/dist/rust/src` | generated |
| `client-go` | client | go | `packages/client/dist/go` | generated |
| `contracts-generated-ts` | contracts | typescript | `packages/contracts/generated/typescript/src` | generated |
| `contracts-generated-rs` | contracts | rust | `packages/contracts/generated/rust/src` | generated |
| `contracts-generated-go` | contracts | go | `packages/contracts/generated/go/wire` | generated |
| `e2e` | e2e | typescript | `packages/e2e` | — |

## Node kinds

Existing kinds carry over: `entity`, `value-object`, `enum`, `error-code`, `usecase`, `event`, `handler`, `agent`, `agent-tool`, `job`, `controller`, `middleware`, `schema`, `repository-interface`, `repository-impl`, `service-interface`, `service-impl`, `integration-event`, `frontend-route`, `frontend-section`, `frontend-component`, `frontend-primitive`, `frontend-label-map`, `frontend-error-handler`, `db-table`, `locale-key`, `sdk-hook`, `sdk-operation`.

New kinds for the polyglot rebuild:

- **`contract-enum`** — exported wire enum in `packages/contracts/wire/enums/*.tsp` or its emitted TS equivalent.
- **`contract-event`** — wire integration event in `packages/contracts/wire/events/*.tsp`.
- **`contract-table`** — Drizzle schema export in `packages/contracts/db/schema/*.ts` (Drizzle moved out of `api/src/shared/db`).
- **`generated-typescript` / `generated-rust` / `generated-go`** — single leaf-node kind family for any file under `packages/client/dist/*` or `packages/contracts/generated/*`. The resolver does not crawl into generated files; they exist so we can show `IMPORTS_SDK` / `GENERATED_FROM` edges land somewhere.

Routes for non-React frontends reuse `frontend-route` with an optional `framework: 'tanstack' | 'expo' | 'astro'` field on the node.

## Edge kinds

Existing edges carry over: `USES`, `IMPORTS_SDK`, `RENDERS`, `READS_TABLE`, `WRITES_TABLE`, `PUBLISHES_EVENT`, `HANDLES_EVENT`, `READS_LOCALE`, `IMPLEMENTS`, `CALLS_OPERATION`.

New edges:

- **`IMPLEMENTS_CONTRACT`** — TS/Rust/Go enum or event node → corresponding `contract-*` node. Audit = `INFERRED` (resolved by name match in the resolver, not by direct import).
- **`GENERATED_FROM`** — a `generated-*` node → its source node (OpenAPI operation, contract type, …). Audit = `GENERATED`.

Optional, off by default:

- **`SHARES_CONCEPT`** — cross-language link between same-named user artifacts (e.g., `api-typescript:patient:entity:Patient` and `api-rust:patient:entity:Patient`). High false-positive risk; gated behind `--cross-lang-concepts`.

## Node ID format

```
<workspace>:<context>:<kind>:<name>         # backend, e.g. api-typescript:patient:entity:Patient
<workspace>:<kind>:<name>                   # frontend, e.g. app-react:frontend-section:PatientList
<workspace>:<kind>:<repoPath>               # frontend routes
contracts:<kind>:<name>                     # contracts:contract-enum:VideoStatus
<generated-workspace>:<kind>:<name>         # client-rust:sdk-hook:create_video
docs:error-code:<CODE>                      # docs:error-code:VIDEO_NOT_FOUND
docs:locale:<lang>:<dotted.key>             # docs:locale:pt:errors.VIDEO_NOT_FOUND
```

The pre-rebuild IDs (`api:<context>:<kind>:<name>`) collapsed TS / Rust / Go under one namespace. Polyglot IDs always include the workspace so the same logical concept across languages produces distinct nodes.

## Source-of-truth direction

Edges point from *consumer* to *producer* (read top-to-bottom):

```
app-react (frontend)
   │  IMPORTS_SDK
   ▼
client-typescript (generated SDK)
   │  GENERATED_FROM
   ▼
OpenAPI operation
   │  (resolved to controller by spec path + naming convention)
   ▼
api-typescript:<ctx>:controller:<X>
   │  USES
   ▼
api-typescript:<ctx>:usecase:<X>
   │  USES
   ▼
api-typescript:<ctx>:entity:<X>
   │  IMPLEMENTS_CONTRACT
   ▼
contracts:contract-enum:<X>
```

A Rust controller follows the same shape with `api-rust` workspace; the contract node is shared.

## Generated code policy

- Generated workspaces (`client-*`, `contracts-generated-*`) are **discovered** but their files become leaf `generated-*` nodes only. The resolver does not parse Rust/Go internals of generated code.
- `bun cli graph build` skips generated workspaces by default; pass `--include-generated` to include them.
- This keeps the default graph size bounded (`packages/client/dist/` can be thousands of files).

## CLI surface

Existing commands kept: `build`, `why`, `impact`, `path`, `orphans`, `file`, `review`, `render`, `stats`, `plan`, `validate-plan`, `parse-plan`.

New filter flags (apply to any query command):

- `--workspace <id>` — restrict to one workspace
- `--lang typescript|rust|go` — restrict to one language
- `--role api|app|contracts|client` — restrict to one role
- `--include-generated` — opt in to generated workspaces (default off)
- `--cross-lang-concepts` — emit `SHARES_CONCEPT` edges (default off)

`stats` reports per-workspace breakdown.

## Skill dispatch alignment

`bun cli graph file <path>` returns the skill that `/review` would load:

1. Detect file's workspace from path.
2. Look up `(skill, workspace.lang, artifact-kind)` in `.claude/registry.yaml`.
3. Resolve `<skill>/<lang>/registry.yaml` if a per-lang variant exists; otherwise the flat `<skill>/registry.yaml`.

This mirrors `scripts/review.ts`'s `detectLang` + `getCompiledChecklist` shape so the graph and review tooling never disagree about which skill applies to a file.

## Out of scope

- Renaming or moving any code outside `scripts/graph/`.
- Changing how the graph is invoked (`bun cli graph ...` stays).
- Modifying `.claude/registry.yaml` or skill files — the rebuild *consumes* them but doesn't modify them.
- Adding a richer Web UI beyond the existing `render` HTML output.
