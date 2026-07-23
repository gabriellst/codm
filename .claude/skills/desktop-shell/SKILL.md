---
name: desktop-shell
description: Work on the CodeDM desktop shell — the Tauri v2 host (packages/app/tauri), the react client-side services DI (packages/app/react/src/services — ports + platform services + Container/Token + ServicesProvider), sidecar supervision, or any OS-integration capability (folder picker, notifications, badge, secrets, autostart). Use whenever a task mentions Tauri, the desktop app, sidecars, or an OS capability the react console needs.
---

# Desktop Shell (Tauri v2)

Flat skill — no per-lang variants. Two artifacts, one contract, two direction rules.

## Config is GENERATED from the desktop contract (global convention)

The shell's identity/wiring lives in **`template.config.ts` `REPO.desktop`** — displayName,
identifier (= keychain service), window params, console wiring (dev port key, devPath,
distSubpath, buildTarget, connectsTo), sidecars (workspace + role + portEnvKey + healthPath +
build + bootEnv), and the native `services → tauri permissions` map. Ports and boot-env values
resolve through `REPO.env` — a literal port/name/path in a shell file that exists in the
contract is a bug, same rule as the env registry.

`bun desktop:generate` (scripts/desktop/generate.ts) renders three **committed** outputs:

| Output | Content |
|---|---|
| `src-tauri/tauri.conf.json` | identity, window, devUrl, frontendDist, externalBin, CSP |
| `src-tauri/capabilities/default.json` | permissions DERIVED from `REPO.desktop.services` |
| `src-tauri/src/generated.rs` | `IDENTIFIER` const + `sidecars(data_dir)` (include!-ed by lib.rs) |

Drift is a red build: `bun desktop:generate --check` runs inside `test:tooling`
(scripts/desktop/generate.test.ts, DSK-01..04 rails — includes a Cargo.toml brand-name check).
`build-sidecars.ts` also reads the contract (binary names, cwds, entries, build kinds); only
host-triple knowledge stays local. Genuine shell decisions (window size defaults, health-check
timing, `sidecar:ready/error` vocabulary, icons, the `data` subdir under `app_data_dir()`)
stay as parameters in the shell — they have no repo-fact source.

**Adding a sidecar** = add an entry to `REPO.desktop.sidecars` + `bun desktop:generate` —
never edit tauri.conf.json/lib.rs literals. **Adding a native capability's permission** =
extend `REPO.desktop.services` (the capability map), regenerate.

## Mental model

The **product is the react console**; the shell is plumbing. `packages/app/tauri` may
only ever do three jobs:

1. **Serve the console** — dev via `build.devUrl` (`http://localhost:5173/app/`), prod via
   `build.frontendDist` (`packages/app/react/dist/client`, produced by
   `nx run app-react:build-spa`; `CODEDM_DESKTOP=true` flips vite to base `/` + SPA shell +
   no nitro).
2. **Supervise sidecars** — `bundle.externalBin` = `codedm-daemon` (TS, `bun build
   --compile`) + `codedm-gateway` (Go). `src-tauri/src/lib.rs` spawns both on boot and
   health-checks: daemon `GET :3030/v1/session`, gateway `GET :3032/api/openapi.json`;
   emits `sidecar:ready` / `sidecar:error` to the webview. Binaries:
   `bun x nx run app-tauri:sidecars` (suffix = host target triple).
3. **Back the tauri platform services** — keychain `secret_get/set/delete` commands and
   any future OS capability the contract grows.

## Client-side services (react → host) — ports + services + decorator-free DI

The react console NEVER knows the tauri surface. `packages/app/react/src/services/` is a
small DI container (the frontend analogue of the backend's per-context `registry.ts →
InstanceRegistry → child container`, minus tsyringe/decorators — reflect-metadata is
friction under Vite and a code-split hazard) organized as **ports → platform services →
declarative per-env registry → composition-root injection**:

```
services/
├── core/
│   ├── token.ts         # Token<T> = { key: symbol; _t?: T }; token(desc) mints one
│   └── container.ts     # Container: #bindings + #cache; load(bindings) / resolve — SINGLETON default,
│   │                    #   RECURSIVE static deps, `new` lives ONLY here, throws naming the token (unbound + cycle).
│   │                    #   Exports type Ctor + type Bindings = readonly [Token, Class][]
├── tokens.ts            # one token per port: FilePickerToken, NotificationToken, …
├── <Cap>Service/        # colocated per capability:
│   ├── <Cap>Service.ts  #   the PORT (pure-type interface)
│   ├── Tauri<Cap>Service.ts   # tauri impl — the ONLY concrete-class home (+ browser)
│   └── Browser<Cap>Service.ts # browser impl — HONEST degradation
├── registry/            # DECLARATIVE `[Token, Class]` records, ZERO `new` (code-split lives here):
│   ├── browser.ts       #   default export: Bindings of Browser*Service class references
│   ├── tauri.ts         #   default export: Bindings of Tauri*Service class references
│   ├── test.ts          #   default export: Bindings of Fake*Service + the Fake classes (backend `mock`-env analogue)
│   └── index.ts         #   Environment, ENVIRONMENTS (import('./browser'|'./tauri') → default), detectEnvironment
├── utils/tauri/         # invoke.ts (the ONE window.__TAURI__ touchpoint) + isTauri.ts
├── providers/
│   └── ServicesProvider.tsx  # owns the Container; detect → dynamic-import env record → container.load → context (splash while loading)
├── hooks/index.ts       # useService(Token) + typed hooks (useFilePicker, useNotification, …)
└── index.ts             # public surface: ServicesProvider, hooks, tokens, port types, Bindings/Ctor
```

- **Ports**: each `<Cap>Service/<Cap>Service.ts` holds pure types only — no platform SDK, no
  react. The ports are the future `@codedm/native-contract` package: an **expo app implements
  the same ports** (colocated `Expo<Cap>Service` + a `registry/expo.ts`) against identical
  types; extraction is a verbatim move once a second consumer exists.
- **Services**: one concrete class per port per platform, constructed ONLY by the Container.
  A service with a dependency declares `static deps = [OtherToken] as const` and the Container
  resolves + injects it recursively — no factory closures, no `new` in the registry. Tauri
  services go through `utils/tauri/invoke.ts`; the permissions each needs are DECLARED in
  `REPO.desktop.services` (capabilities JSON is generated — never hand-edit it).
- **DI**: `ServicesProvider` mounts at the composition root (`routes/__root.tsx`), calls
  `detectEnvironment()` once, DYNAMIC-imports that env's DECLARATIVE bindings record (the browser
  entry never fetches the tauri chunk — that async boundary is the code-split), builds a
  `Container`, `load`s the record, and publishes it on context (splash while loading). Components
  consume ports via `useService(Token)` / the typed hooks — never an environment or a `*Service`
  class. Tests/storybook inject a ready Container (`c.load(testBindings)` from `registry/test.ts`
  fakes) through the `container` prop (see `ServicesProvider.test.tsx` — DI proof, zero tauri).

## Direction rules (non-negotiable)

- **tauri → react**: build config only (`devUrl`/`frontendDist` + nx `dependsOn`
  `app-react:build-spa`). The shell never imports console source.
- **react → tauri**: only through the tauri touchpoints — `services/**/Tauri*Service.ts`,
  `services/registry/tauri.ts`, `services/utils/tauri/`. `@tauri-apps/*` (or
  `window.__TAURI__`) anywhere else — including the ports and the browser services — is an
  eslint error (`no-restricted-imports` block in the root `eslint.config.ts`).
- **`new <Something>Service` appears NOWHERE by hand** — the registry is declarative class
  references and the Container's generic `new K(...)` in `resolve` is the single construction
  site. Never `new` a service in a component, hook, the provider, the registry, or a test
  (seed a fake with a tiny `class Seeded extends Fake…` subclass instead).
- **UI never branches on the host.** If a screen needs "desktop-only" behavior, add a
  capability to the relevant port (or a new port) and let the UI branch on what the port
  REPORTS (`supportsFolderPicker()`), degrading honestly in the browser services — never
  `if (isTauri())` inside components. `HostInfoService.platform()` is diagnostics only.

## Transport (interim — reversible)

Console → daemon (`:3030`, HTTP) → gateway (`:3032`, proxied via api-ts). This is the
same topology as the web dev stack — smallest possible delta. If/when the desktop
transport pivots (SQLite-WAL / IPC — go-domain branch subject), the only shell changes
are the two readiness URLs + platform service bindings; the console does not move.

## Adding a capability (worked shape)

1. Declare the port in `services/<Cap>Service/<Cap>Service.ts` (typed, minimal,
   promise-based) and add a token in `services/tokens.ts` (`token<<Cap>Service>('<Cap>Service')`).
2. Implement `Tauri<Cap>Service` colocated in `services/<Cap>Service/` — plugin invoke
   (`plugin:<name>|<command>` via `utils/tauri/invoke.ts`) or a new Rust `#[tauri::command]`
   in `src-tauri/src/lib.rs`. Declare the permissions in `REPO.desktop.services` +
   `bun desktop:generate` (+ plugin in `Cargo.toml`/`lib.rs` if new).
3. Implement `Browser<Cap>Service` colocated in `services/<Cap>Service/` — never fake success.
4. Add the `[<Cap>Token, <Plat><Cap>Service]` pair to the DECLARATIVE record in
   `registry/tauri.ts` and `registry/browser.ts` (class references, ZERO `new`), and a
   `[<Cap>Token, Fake<Cap>Service]` pair + the `Fake<Cap>Service` class in `registry/test.ts`;
   expose a `use<Cap>()` hook in `hooks/`.
5. Consume the port in the component that owns the interaction (via the typed hook),
   branching only on reported capability.
6. Prove the flow with a fake bound through a test `Container`
   (`c.load(testBindings)` + a one-entry `[<Cap>Token, SeededFake]` override) passed to
   `ServicesProvider container={...}`.

## Commands

```bash
bun desktop:dev        # tauri dev (starts app-react:dev via beforeDevCommand)
bun desktop:sidecars   # compile both sidecar binaries into src-tauri/binaries/
bun desktop:bundle     # production shell build (build-spa + sidecars first)
```

`bundle` (not `build`) keeps `nx run-many -t build` green on machines without a Rust
toolchain. Rust is required for dev/bundle; icons must be generated once
(`bun x tauri icon <1024.png>`) before the first bundle. See
`packages/app/tauri/README.md`.
