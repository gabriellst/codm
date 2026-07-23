---
name: desktop-shell
description: Work on the CodeDM desktop shell — the Tauri v2 host (packages/app/tauri), the react native contract (packages/app/react/src/lib/native — ports + platform services + NativeProvider DI), sidecar supervision, or any OS-integration capability (folder picker, notifications, badge, secrets, autostart). Use whenever a task mentions Tauri, the desktop app, sidecars, or an OS capability the react console needs.
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

## The native contract (react → host) — contract + services + DI

The react console NEVER knows the tauri surface. `packages/app/react/src/lib/native/`
is organized as **ports → platform services → composition-root injection**:

```
lib/native/
├── contract/            # PURE TYPES — one port (interface) per capability:
│   │                    # DialogService, NotificationService, BadgeService,
│   │                    # SecretsService, AutostartService, HostInfoService (+ NativeServices)
├── platforms/
│   ├── tauri/           # the ONLY path allowed to touch the tauri runtime
│   │   ├── invoke.ts    # the ONE runtime touchpoint (window.__TAURI__, withGlobalTauri)
│   │   └── services/    # Tauri<Port>Service classes, one per port
│   └── browser/
│       └── services/    # Browser<Port>Service classes — HONEST degradation
├── NativeProvider.tsx   # context + binding decided ONCE at bootstrap (dynamic import —
│                        # the browser bundle never fetches the tauri chunk); lazy facade
│                        # is legal because every port method is Promise-based
├── useFolderPicker.ts   # flow hooks composing ports (capability-gated UI affordances)
└── index.ts             # public surface: NativeProvider, useNative(), useDialogService(), types
```

- **Contract**: `contract/` holds pure types only — no platform SDK imports, no react.
  It is the future `@codedm/native-contract` package (extraction path documented in
  `contract/index.ts`): an **expo app implements the same ports** under
  `platforms/expo/services/*` against identical types; extraction is a verbatim folder
  move once a second consumer exists.
- **Services**: one concrete class per port per platform. Tauri services go through
  `platforms/tauri/invoke.ts`; the permissions each service needs are DECLARED in
  `REPO.desktop.services` (capabilities JSON is generated — never hand-edit it).
- **DI**: `NativeProvider` mounts at the composition root (`routes/__root.tsx`) and picks
  the platform module once per page load via dynamic import. Components consume ports via
  `useNative()` / `useDialogService()` — never a platform module. Tests/storybook inject
  fakes through the `services` prop (see `NativeProvider.test.tsx` — the DI proof runs
  with zero tauri present).

## Direction rules (non-negotiable)

- **tauri → react**: build config only (`devUrl`/`frontendDist` + nx `dependsOn`
  `app-react:build-spa`). The shell never imports console source.
- **react → tauri**: only through `lib/native/platforms/tauri/`. `@tauri-apps/*` anywhere
  else — including `lib/native/contract/` and the browser platform — is an eslint error
  (`no-restricted-imports` block in the root `eslint.config.ts`).
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

1. Declare the port in `contract/<capability>.ts` (typed, minimal, promise-based) and add
   it to `NativeServices` in `contract/index.ts`.
2. Implement `Tauri<Port>Service` in `platforms/tauri/services/` — plugin invoke
   (`plugin:<name>|<command>` via `invoke.ts`) or a new Rust `#[tauri::command]` in
   `src-tauri/src/lib.rs`. Declare the permissions in `REPO.desktop.services` +
   `bun desktop:generate` (+ plugin in `Cargo.toml`/`lib.rs` if new).
3. Implement `Browser<Port>Service` in `platforms/browser/services/` — never fake success.
4. Wire both `create<Platform>Services()` factories + the lazy facade in
   `NativeProvider.tsx`; expose a `use<Port>Service()` hook if the port is consumed widely.
5. Consume the port in the component that owns the interaction (via the hook, or a flow
   hook like `useFolderPicker`), branching only on reported capability.
6. Prove the flow with a fake service injected through `NativeProvider services={...}`.

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
