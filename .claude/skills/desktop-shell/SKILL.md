---
name: desktop-shell
description: Work on the CODM desktop shell — the Tauri v2 host (packages/app/tauri), the react client-side services DI (packages/app/react/src/services — ports + platform services + Container/Token + ServicesProvider), sidecar supervision, or any OS-integration capability (folder picker, notifications, badge, secrets, autostart). Use whenever a task mentions Tauri, the desktop app, sidecars, or an OS capability the react console needs.
---

# Desktop Shell (Tauri v2)

Flat skill — no per-lang variants. Two artifacts, one contract, two direction rules.

## Config is GENERATED, and it lives INSIDE the shell package

The shell's identity/wiring lives in **`packages/app/tauri/config/`** — a flat, INTERNAL config
folder: `app.ts` (displayName, identifier = keychain service, console wiring — dev port key,
devPath, distSubpath, buildTarget, connectsTo), `window.ts` (`WINDOW` presentation + `WINDOW_FRAME`
size/label), `capabilities.ts` (the abstract **`CAPABILITIES`** keys —
`['filePicker','notification','badge','secrets','autostart','hostInfo']`, never a Tauri permission
string — plus the `CAPABILITY_PERMISSIONS` map), and `sidecars.ts` (the lean manifest). The ONLY
things read from the abstract contract (`template.config.ts`) are `REPO.brand` (identity),
`REPO.workspaces` (roots), and `REPO.env` (ports/paths) — a literal port/name/path in a config file
that exists in `REPO.env` is a bug, same rule as the env registry.

Both the abstract keys AND the `capability → Tauri permissions[]` map live together in
**`config/capabilities.ts`** (`CAPABILITIES` + `CAPABILITY_PERMISSIONS`) — the config knows *what*
capabilities exist and *how* each maps to Tauri's permission grammar. `config/generate.ts` renders
`default.json` by mapping `CAPABILITIES` through `CAPABILITY_PERMISSIONS` — **fail-loud** on a
capability key with no mapping.

`bun desktop:generate` (packages/app/tauri/config/generate.ts) renders two **committed** outputs:

| Output | Content |
|---|---|
| `src-tauri/tauri.conf.json` | identity, window, devUrl, frontendDist, externalBin, CSP, bundle.resources |
| `src-tauri/capabilities/default.json` | permissions from `config/capabilities.ts` `CAPABILITIES` mapped through `CAPABILITY_PERMISSIONS` |

Drift is a red build: `bun desktop:generate --check` runs inside `test:tooling`
(packages/app/tauri/config/generate.test.ts, DSK-01..06 rails — includes a Cargo.toml brand-name
check). `config/build-sidecars.ts` reads the SAME `config/sidecars.ts` manifest (binary names, cwds,
entries, build kinds); only host-triple knowledge stays local. Genuine shell decisions (window size
defaults, health-check timing, `sidecar:ready/error` vocabulary, icons, the `data` subdir under
`app_data_dir()`) stay as parameters in the shell — they have no repo-fact source.

**Adding a sidecar** = add an entry to `config/sidecars.ts` (`SIDECARS`) + `bun desktop:generate` —
never edit tauri.conf.json/mod.rs literals. **Adding a native capability** = add the abstract key to
`CAPABILITIES` AND its permission list to `CAPABILITY_PERMISSIONS` — both in `config/capabilities.ts`
— then regenerate. The two must agree — a key with no entry in the map fails the render loudly.

## Mental model

The **product is the react console**; the shell is plumbing. `packages/app/tauri` may
only ever do three jobs:

1. **Serve the console** — dev via `build.devUrl` (`http://localhost:5173/app/`), prod via
   `build.frontendDist` (`packages/app/react/dist/client`, produced by
   `nx run app-react:build-spa`; `CODM_DESKTOP=true` flips vite to base `/` + SPA shell +
   no nitro).
2. **Supervise sidecars** — `bundle.externalBin` = `codm-daemon` (TS, `bun build
   --compile`) + `codm-gateway` (Go). `src-tauri/src/lib.rs` spawns both on boot and
   health-checks: daemon `GET :3030/v1/session`, gateway `GET :3032/api/openapi.json`;
   emits `sidecar:ready` / `sidecar:error` to the webview. Binaries:
   `bun x nx run app-tauri:sidecars` (suffix = host target triple).
3. **Back the tauri platform services** — keychain `secret_get/set/delete` commands and
   any future OS capability the contract grows. Custom commands are **typed end-to-end**
   (see "Typed commands" below) — no stringly `invoke`.

## Typed commands (native calls are typed end-to-end)

There is **no stringly `invoke<T>(command: string)`** — that touchpoint is retired. The react
console reaches the host through two typed channels, both owned by `@codm/app-tauri`:

1. **Custom Rust commands → tauri-specta.** The shell's own `#[tauri::command]`s
   (`secret_get/set/delete`) are annotated `#[specta::specta]`, collected in a
   `tauri_specta::Builder` in `src-tauri/src/lib.rs`, and exported as typed TS bindings to
   `packages/app/tauri/bindings.ts` by an export test that runs on `cargo test` (committed +
   drift-checked). The name, args, and return type all flow from the Rust — one source of
   truth. `TauriSecretsService` imports `{ commands } from '@codm/app-tauri/commands'` and
   calls `commands.secretGet(key)` — no hand-typed `invoke<string|null>('secret_get',…)`.
   *Fallback (if specta v2 / tauri-specta v2 version-compat blocks the Rust build): a
   hand-written typed `commands.ts` in `@codm/app-tauri` with the same shape — react imports
   `commands.secretGet` identically, types hand-synced. This build did NOT need the fallback.*
2. **Plugin / core capabilities → typed npm APIs directly.** Each `Tauri<Cap>Service` imports
   the typed `@tauri-apps/plugin-*` / `@tauri-apps/api/*` API — no re-wrapping façade:
   - `TauriFilePickerService` → `import { open } from '@tauri-apps/plugin-dialog'`
   - `TauriNotificationService` → `@tauri-apps/plugin-notification`
   - `TauriAutostartService` → `@tauri-apps/plugin-autostart`
   - `TauriBadgeService` → `getCurrentWindow().setBadgeCount()` from `@tauri-apps/api/window`
   - `TauriSecretsService` → `@codm/app-tauri/commands` (channel 1)

   `@tauri-apps/*` imports are lint-allowed ONLY inside `Tauri*Service.ts` (the
   `no-restricted-imports` allowlist). Invariant: `@tauri-apps/*` must never resolve into the
   react **main/browser** chunk — only the code-split tauri chunk (the registry seam guarantees
   this; the build gate re-checks it).

> Upstream-ready blueprint: this is the standard for the desktop-shell pattern. `template-fullstack`
> has no `packages/app/tauri` yet — when it grows a desktop shell, mirror this shape (specta for
> custom commands, typed npm APIs for plugins, abstract capability keys in the contract, the
> capability→permission map + bindings owned by the shell package, generate.ts importing the map).

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
├── utils/tauri/         # isTauri.ts (env probe) — the stringly invoke.ts is RETIRED;
│   │                    #   typed calls go through @codm/app-tauri/commands + @tauri-apps/*
├── providers/
│   └── ServicesProvider.tsx  # owns the Container; detect → dynamic-import env record → container.load → context (splash while loading)
├── hooks/index.ts       # useService(Token) + typed hooks (useFilePicker, useNotification, …)
└── index.ts             # public surface: ServicesProvider, hooks, tokens, port types, Bindings/Ctor
```

- **Ports**: each `<Cap>Service/<Cap>Service.ts` holds pure types only — no platform SDK, no
  react. The ports are the future `@codm/native-contract` package: an **expo app implements
  the same ports** (colocated `Expo<Cap>Service` + a `registry/expo.ts`) against identical
  types; extraction is a verbatim move once a second consumer exists.
- **Services**: one concrete class per port per platform, constructed ONLY by the Container.
  A service with a dependency declares `static deps = [OtherToken] as const` and the Container
  resolves + injects it recursively — no factory closures, no `new` in the registry. Tauri
  services call the host through **typed** channels — `@codm/app-tauri/commands` (specta
  bindings) for custom commands, `@tauri-apps/plugin-*`/`@tauri-apps/api/*` for plugin/core (see
  "Typed commands" above); the capability each needs is listed in `CAPABILITIES` and mapped to
  permissions in `CAPABILITY_PERMISSIONS` — both in `packages/app/tauri/config/capabilities.ts`
  (capabilities JSON is generated — never hand-edit it).
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
  `services/registry/tauri.ts`, `services/utils/tauri/`. `@tauri-apps/*`,
  `@codm/app-tauri/commands` (or `window.__TAURI__`) anywhere else — including the ports and
  the browser services — is an eslint error (`no-restricted-imports` block in the root
  `eslint.config.ts`).
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
2. Implement `Tauri<Cap>Service` colocated in `services/<Cap>Service/` — import the typed
   `@tauri-apps/plugin-*` / `@tauri-apps/api/*` API directly, or (for a NEW custom command)
   add `#[tauri::command] #[specta::specta]` in `src-tauri/src/lib.rs`, register it in the
   `tauri_specta::Builder` (regen `bindings.ts` via `cargo test`), and import
   `{ commands } from '@codm/app-tauri/commands'`. Add the abstract key to `CAPABILITIES` AND
   its permission list to `CAPABILITY_PERMISSIONS` — both in
   `packages/app/tauri/config/capabilities.ts` — then `bun desktop:generate` (+ plugin in
   `Cargo.toml`/`lib.rs` if new).
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

## macOS signing — the shell's TCC identity (non-negotiable)

**Never ship an ad-hoc build.** Everything the daemon spawns (`claude`, and every `zsh`/`git`/`gh`
under it) is attributed by macOS to the app as *responsible process* — the TCC log says it
verbatim: `responsible={identifier=app.codm.desktop}`. So the shell's signature IS the agents'
filesystem permission, and workspaces live under `~/Desktop`, a TCC-protected folder.

An ad-hoc signature (`"signingIdentity": "-"`) pins the TCC grant to the binary's *cdhash*, so
**every update invalidates the disk permission**. When the grant lapses, macOS is asked from a
background sidecar, where it cannot show a dialog — it then *records* a denial
(`Service kTCCServiceSystemPolicyAllFiles does not allow prompting; recording denied`) and the
whole spawned tree loses the workspace. Measured on v0.2.0 (2026-08-07): ~640 kernel denials
`System Policy: … deny(1) file-read-data /Users/work/Desktop/…`, agents crashing with
`provider exited with code 1 (EPERM)` — Bun dies at startup when it cannot read its own cwd.

Therefore `bundle.macOS.signingIdentity` carries the real Developer ID
(`Developer ID Application: BK COMPANY LTDA (V4F6T68S5B)`), and both release workflows pass
`APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD` / `APPLE_ID` / `APPLE_PASSWORD` /
`APPLE_TEAM_ID`. A missing secret now fails the build loudly instead of silently shipping ad-hoc.
`TAURI_SIGNING_PRIVATE_KEY` is a different thing entirely — minisign, for the updater manifest.

Entitlements stay as they are: a Bun single-file executable was measured running fine under
hardened runtime with only `com.apple.security.cs.disable-library-validation`. No JIT entitlement
needed.

After the *first* Developer-ID build the cdhash changes once more, so Full Disk Access must be
granted one last time — clear the recorded denial first, or the stored "no" sticks:

```bash
tccutil reset SystemPolicyAllFiles app.codm.desktop
tccutil reset SystemPolicyDesktopFolder app.codm.desktop
# then: System Settings → Privacy & Security → Full Disk Access → add CODM.app → restart it
```

Diagnosing a suspected recurrence (`log` is a zsh builtin — the absolute path is required, or the
query silently returns nothing):

```bash
/usr/bin/log show --last 30m --predicate 'eventMessage CONTAINS "deny"' --info --debug \
  | grep "System Policy"
```
