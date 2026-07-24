# CodeDM → Template — Fundamentals & Upstream Elicitation

**Scope:** what this session settled *fundamentally* — Tauri, the desktop shell, the event architecture, the Go port to the canonical template form, unions/enums, and the "don't over-parametrize" principle — and the concrete backlog to upstream into `template-fullstack`.

**Date:** 2026-07-24 · **Source repo:** `codedm` · **Target:** `template-fullstack` (has *no* desktop shell, and the schema-ownership/event patterns below are not yet realized there).

---

## Handoff — current state & how to resume (2026-07-24)

*Read this first if you're picking the work up. The rest of the document is the timeless "why"; this section is the mutable "where".*

**Landed on `main` (`188e2fc3`), all gates green + verified:**

- **Channel Phase 1** — rich `gateway.channels` model (migration `0009`) + enum reconcile (ts/go/wire).
- **Channel Phase 2** — Go conforms to the contract: `sqlc`-pull from a committed `schema.sql`, golang-migrate set deleted, test harness reschemed. **Resolve works end-to-end** (verified `200`, `ChannelCreated` persisted).
- **Outbox dispatcher uuid-cast fix** (`20f0c8bb`) — was silently dispatching *nothing*; now drains + advances the projection.
- **Desktop typed-commands + package reorg + integrated title bar** (`AppChrome`) — merged.
- The enum-ripple fix (`ConnectChannelDialog`) + this spec.

**Branches / worktrees:**

| Worktree / branch | State | Action |
|---|---|---|
| `channel-rich-sqlc`, `desktop-typed-commands` | **merged into main** | worktrees removable |
| `desktop-deparametrize` (`71b723ae`) | de-param **committed** (code-over-config; `REPO.desktop.sidecars`/`BootEnvSource`/`generated.rs` gone). **NOT merged.** A subagent is finishing the `config/` consolidation there (all of `REPO.desktop` + the generator → the package; ~13 files uncommitted, **in flight — don't touch that tree**). | review + merge to main once it lands green |
| `go-domain` (`fec1e623`) | preserved from a prior session (foundations/design) | the next big task — **E1** |

**Running (dev setup):** `bun dev:api` (daemon `:3030` = PGlite · gateway `:3032` = Postgres) + vite `:5173` + the desktop shell window. The single-binary sidecars were swapped for dev servers to get logs. Clean restart: kill codedm procs → `bun desktop:dev`, or `bun dev:api` + a browser at `:5173`.

**Open threads (non-blocking):**

- **e2e tsc** — `thread.ts` still references the old `CONTACT` enum value (Phase-1 renamed `ContactKind` CONTACT→USER); a one-line enum-ref update, same class as the `ConnectChannelDialog` fix.
- **The channels *list* still shows `DISCONNECTED`** — the daemon's PGlite read-model isn't synced from the gateway's Postgres (§2, the split-DB). Not a bug to patch — **this is exactly what go-domain (E1) removes.**
- **Sidecar observability + zombie cleanup** (D6) — the shell doesn't pipe sidecar logs; kill stale procs on relaunch.

**How this feeds the upstream:** every merged pattern above is codedm's proving-ground for a §6 row — the template has none of it yet. Recommended upstream order: **E1 (go-domain) first** (the structural keystone that unblocks read-model correctness) → desktop rows **D1–D7** (build on de-param + the config-consolidation once merged) → Go-canonical **G1–G4** (already realized here; mostly extraction) → meta guardrails **M1–M3**.

**Immediate next step (founder's plan):** **go-domain** — unify daemon + gateway onto one embedded DB, deleting the split-DB and the cross-service-projection need. Merge the `desktop-deparametrize` config-consolidation to main first (or in parallel) so the desktop machinery is clean and independent of the DB unification.

---

## 0. The one principle everything else is a corollary of

> **Config/codegen earns its cost only when a value (a) crosses a language/process boundary, (b) varies per product, AND (c) isn't trivially derivable. Fail any one → it's code, colocated where it's used.**

Contract-first is *right* for the **domain** — cross-language enums, integration events, the DB schema — where two independently-developed sides need a typed agreement. It is *wrong* for a concern that lives inside **one package** (the desktop shell): there's no second party to negotiate with, so the package can simply *have the code*.

"Parametrization" is not free. Every knob you push into config buys you a DSL to learn, a generator to maintain, a drift-check to run, and a layer of indirection — paid whether or not the DRY it buys is real. For two stable sidecars, that cost dwarfs the duplication it removes.

Two derived rules the session converged on:

- **`template.config.ts` is *only* the contract** — brand, workspaces (package declarations), env, language. The *definition* of a package (its window, sidecars, capabilities, its own build script) is **the package's code**, not a `REPO.*` block.
- **The contract owns the vocabulary; the package owns the implementation.** Cross-boundary vocabulary (enums/events/schema) → `packages/contracts`. Platform/impl specifics (tauri commands, permissions, window, sidecars, the generator) → the package, importing *only* the contract references it genuinely needs.

---

## 1. Tauri — the desktop shell

### 1.1 Typed commands (the seam that kills stringly `invoke`)

- **Custom commands → `tauri-specta`.** Annotate `#[tauri::command]` fns with `#[specta::specta]`, collect them in a `tauri_specta::Builder`, and export typed TS bindings (`bindings.ts`, committed + drift-checked). React imports `commands.secretGet(key)` — the name, args, and return type are the Rust signature, verbatim. One source of truth.
- **Plugin/core commands → typed npm APIs directly** (`@tauri-apps/plugin-*`, `@tauri-apps/api/window`) inside each `Tauri*Service.ts` (behind the eslint allowlist). No re-wrapping façade.
- The stringly `invoke(command: string)` wrapper is **retired**. Every native call is typed end-to-end.
- **Code-split invariant:** `@tauri-apps/*` must resolve only into the lazy tauri chunk (the `registry/tauri.ts` dynamic-import boundary), never the browser entry. The typed bindings ride that same async chunk.

### 1.2 The contract de-leak + package ownership

The shell's Tauri vocabulary must **not** live in the abstract contract:

- The **capability → Tauri-permission map** (`CAPABILITY_PERMISSIONS`) lives in the package; the contract holds only abstract capability keys — and, per §0, those keys leave the contract too.
- The **window presentation** (`titleBarStyle: Overlay`, `hiddenTitle`, `trafficLightPosition`) is a **house default owned by the package**, not a per-product knob.
- The **sidecar list** is a lean package manifest (role/port-env/health/build), not a contract `sidecars[]` with a `BootEnvSource` DSL. The Rust supervisor hand-writes `sidecars()` (env inline, ports via `std::env`), and the keychain service name comes from `app.config().identifier` — no generated `IDENTIFIER` const, no generated `generated.rs`.

### 1.3 The consolidation end-state (the package defines itself)

The desktop generate machinery was a config dump. Target shape — `template.config.ts` loses `REPO.desktop` + `DesktopConfig` entirely, `scripts/desktop/` disappears, and the package becomes self-contained:

```
packages/app/tauri/
├── config/                 # ALL desktop config + machinery, flat, INTERNAL
│   ├── window.ts  capabilities.ts  sidecars.ts  app.ts
│   ├── generate.ts         # the compiler → tauri.conf.json + capabilities/default.json
│   ├── generate.test.ts    build-sidecars.ts
├── commands/               # the ONLY external export (react imports @…/commands)
└── src-tauri/              # lib.rs thin · commands/ + sidecars/ modules
```

The generator imports its config **locally** (`import { WINDOW } from './window'`) and from the contract **only** `REPO.brand / workspaces / env`. The package exports **just `./commands`**. Dependency direction is strictly *package → contract*; the contract never knows the desktop exists.

### 1.4 The integrated title bar

`titleBarStyle: Overlay` (macOS) makes the webview own the full window height with the native traffic lights overlaying the app's own header (`AppChrome`, `data-tauri-drag-region`, three zones: nav · command center · actions). The window mechanism is the *same* for a simple bar and a VS-Code-grade one — the richness is 100% app-drawn UI. Win/Linux custom controls (min/max/close) go through a `WindowService` in the services DI so `getCurrentWindow()` stays in the code-split tauri chunk.

### 1.5 Single-binary weak spots (found the hard way)

- **PGlite cold-migration is slow** in a `bun --compile` single binary (WASM Postgres re-running the whole schema on a fresh data dir). The daemon is PGlite-only by design (founder decision 3, file-backed at `CODEDM_DATA_DIR`).
- **Observability gap:** the Tauri shell does **not** pipe sidecar `stdout`/`stderr` into its log → sidecar errors are invisible (both the daemon and the gateway swallow to `INTERNAL_ERROR` with no visible cause). Must be wired.
- **No auto-restart + zombie sidecars:** a crashed sidecar isn't restarted, and a stale process can hold a port across launches — which *looks* like "the new build is slow" when it's really a 5-hour zombie at 100% CPU. Kill-all + clean relaunch; for dev, run sidecars as normal dev servers.
- **Dev DX:** `bun dev:api` runs the daemon + gateway as normal dev servers with full logs (the right dev setup). A desktop "dev-sidecars" mode should let the shell skip its single-binary supervision and point at those.

---

## 2. The event architecture (the fundamental gap: split-DB)

### 2.1 The outbox dispatcher bug (a class, not a one-off)

`shared.outbox.id` is **`uuid`** (contract), but the ported dispatcher compared it as text — `WHERE id = ANY($n::text[])` / `id = $n` → Postgres `operator does not exist: uuid = text`. Every *claim* transaction errored and rolled back, so **nothing was ever dispatched** (rows pending, `attempts` stuck at 0), which silently broke *both* the status projection (channel stuck `CONNECTING`) *and* the SSE to the app. Fix: cast the id params to `uuid`.

> **Lesson:** the sqlc drift-guard covers *SELECT scans*, not *WHERE-clause casts* in dynamic SQL — and the dispatcher's claim path had no test. Type mismatches hide in the queries sqlc doesn't model.

### 2.2 The split-DB (this is the real architecture problem)

- **Daemon (api-ts) = PGlite** (embedded, `~/.codedm/data`), always — even in dev.
- **Gateway (api-go) = Postgres.**
- They are **separate databases by design.** The gateway owns the channel write-model + projection (Postgres); the daemon's BFF read-models (home dashboard, channels list) read the daemon's *own* PGlite.
- **No cross-service projection is wired:** there is no daemon-side channel projector (only a test controller writes `channels`), and the transports don't bridge — the gateway publishes to Redis (publish-only) while the daemon's external mediator is in-process `EventEmitter2`. So the gateway's channel status **never reaches the daemon's read-model.**
- **Symptom:** the connect *dialog* works (it reads the gateway directly via the proxy + gets the gateway's SSE), but the channels *list* shows `DISCONNECTED` and disconnect events don't reflect — because the list reads the daemon's empty projection.

**The fix is `go-domain`:** unify daemon + gateway onto one embedded DB so there is no split, and the local single-operator app needs no cross-service projection at all. This is the single biggest structural upstream item.

---

## 3. Go — porting to the canonical template form

### 3.1 Go conforms to the contract (schema ownership)

Drizzle (contracts) is the **single migration owner**. The Go gateway (a verbatim medscall port) carried its *own* golang-migrate set + hand-written SQL that **diverged** from the contract — the root cause of the channel 500s.

Canonical form:

- Go **pulls** its schema via **sqlc from a committed `schema.sql`** — a `pg_dump --schema-only` of the drizzle-migrated schema (option B: hermetic, deterministic, no live DB at build). sqlc generates the *models* (a compile-time drift-guard on scans); most queries stay hand-written but over the generated structs.
- The golang-migrate set is **deleted**; the Go test harness builds from `schema.sql`, not embedded migrations.
- **Reconcile direction is per-layer, not global:**
  - **Channel model** → the *contract* conformed to Go (the rich model — founder chose the old model over a lean read-model).
  - **Shared event-sourcing** (`shared.events`/`outbox`) → *Go* conformed to the contract (`source`/`occurred_at`, dropping the medscall `time`/`updated_at`). The wire envelope keeps `time`; only the DB column differs.

### 3.2 Unions / enums in Go

- Cross-boundary enums come from **contracts** (TypeSpec → wire ts/go). The Go domain enums should **alias the contract wire enums** — never redeclare a divergent value-set.
- **Value-sets are load-bearing.** `ChannelStatus` needs its full set (`CREATED/CONNECTING/CONNECTED/DISCONNECTED/DELETED` — soft-delete + active filters depend on it); `INTERNAL` is a real `ChannelKind` value the projector emits. A "rename" is often a value-set change in disguise.
- **An enum change ripples to every consumer.** Reshaping `ChannelKind`/`ContactKind` and regenerating the SDK broke a react consumer (`PlatformEnum` → `ChannelKindEnum`) and an e2e one (`CONTACT` → `USER`) — neither caught because the verify gate ran only `api-ts tsc`.

### 3.3 The Go porting checklist (canonical form)

1. Hand-written raw SQL → sqlc models from the contract `schema.sql` (drift-guard).
2. golang-migrate → **gone** (Drizzle owns migrations); test harness builds from `schema.sql`.
3. Domain enums → **alias** the contract wire enums.
4. Column names **and types** → match the contract (`uuid` ids, `occurred_at`/`source`, …) — including WHERE-clause casts, which sqlc doesn't guard.
5. Confirm the reconcile end-to-end with a real write path, not just `go build`.

---

## 4. Astro (from the earlier org this session)

- `pages/[locale]/` **dynamic route** (`prefixDefaultLocale`, `hreflang`), `/` redirect, per-route `_components` / `_islands` / `_content` colocation; the landing as a **vertical slice**. Blog i18n via `translationKey` + per-locale MDX; per-locale routes kept for SEO. Nitro (TanStack Start's dev document server) is required for desktop dev-serve; stripped only for the static SPA build (`CODEDM_DESKTOP_DEV` flag).

---

## 5. Verify-gate discipline (process lessons)

- **SDK regen (enums/DTOs) → the gate must run `react tsc` *and* `e2e tsc`,** not just `api-ts tsc`. Latent breakages ship otherwise (the `PlatformEnum` / `CONTACT` ripples).
- **Dynamic-SQL paths need explicit tests.** sqlc's drift-guard is scan-only; the outbox claim path (and any hand-written WHERE cast) must be covered by a test against the contract schema.
- **Behavior-preserving refactors get a byte-identity gate.** Every desktop refactor proved itself by `tauri.conf.json` + `capabilities/default.json` diffing empty against HEAD.
- **Verify git before trusting "committed".** Pre-commit hooks abort; workflows have claimed a commit that never landed. `--no-verify` for generated/doc commits; always re-check `git log`.

---

## 6. The upstream elicitation

`template-fullstack` has **no** `packages/app/tauri`, no desktop skill, and none of the schema-ownership/event patterns. Backlog to upstream, grouped by area. Size = rough effort (S/M/L).

### Desktop shell (net-new package in the template)

| # | Item | Why | Size |
|---|---|---|---|
| D1 | `@template/app-tauri` package: `config/` (window · capabilities · sidecars · app · generate · build) + `commands/` (specta bindings) + `src-tauri/` (thin `lib.rs`, `commands/` + `sidecars/` modules) | The template can't stamp a desktop app today | L |
| D2 | Typed-commands pattern: tauri-specta + typed plugin APIs, stringly `invoke` retired, code-split invariant | The correct native seam | M |
| D3 | De-parametrized generator: package-owned, code-over-config; contract holds only brand/workspaces/env | Encodes §0 for desktop | M |
| D4 | Integrated title-bar default (`Overlay` + `AppChrome`) + `WindowService` for Win/Linux controls | House default, not a per-app knob | M |
| D5 | Dev-sidecars mode (shell skips single-binary supervision; `bun dev:api` with logs) | Dev DX | S |
| D6 | Sidecar observability: pipe sidecar `stdout`/`stderr` into the shell log | Errors are invisible today | S |
| D7 | `desktop-shell` skill (the blueprint doc) | So the next engineer doesn't rediscover it | S |

### Go — canonical form

| # | Item | Why | Size |
|---|---|---|---|
| G1 | sqlc-pull from a committed `schema.sql` (`pg_dump` snapshot); **no** golang-migrate on the Go side; test harness builds from it | One schema owner (Drizzle); compile-time drift-guard | L |
| G2 | Go domain enums **alias** the contract wire enums (no redeclaration) | Single source; kills value-set drift | M |
| G3 | Go↔contract type discipline: `uuid` ids, contract column names — enforced, incl. a check/test for WHERE-clause casts sqlc misses | The outbox class of bug | M |
| G4 | Correct outbox dispatcher (uuid casts) + a claim-path test | Silent no-dispatch is catastrophic | S |

### Events / architecture

| # | Item | Why | Size |
|---|---|---|---|
| E1 | **go-domain**: unify daemon + gateway onto one embedded DB → no split-DB, no cross-service projection for the local single-operator app | The fundamental fix for #2 | L |
| E2 | If the split is kept anywhere: a documented cross-service projection pattern (transport bridge + projector), not an implicit gap | Otherwise read-models silently lie | M |

### Meta / process

| # | Item | Why | Size |
|---|---|---|---|
| M1 | The over-parametrization guardrail as a review rule / skill: "config only at a real boundary; contract is contract-only; packages define themselves" | Prevents recreating the dump | S |
| M2 | Verify-gate rule: SDK regen ⇒ run react + e2e tsc, not just api-ts | Catches enum ripples | S |
| M3 | Byte-identity gate convention for behavior-preserving generator refactors | Proves "only re-sourced" | S |

---

*This document is the blueprint for the desktop-shell + Go-canonical-form + go-domain upstream. Each row is a discrete, ordered piece of work; E1 (go-domain) is the highest-leverage and unblocks the read-model correctness the whole app depends on.*
