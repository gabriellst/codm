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

**Shell-supplied env is DERIVED from the manifest, never hand-listed.** `config/env.ts` types
`ShellEnvKey` as the `REPO.env` keys whose `consumers` include `appTauri` and maps each to its value
(`SHELL_ENV`: port examples from the manifest, cloud origin from `cloud.ts`); `forwardedEnv(workspace)`
is set algebra over the same relation (daemon gets `API_PORT` + `CODM_CLOUD_URL`, gateway gets
`CHANNEL_PORT`). `generate.ts` renders it into **`src-tauri/shell-env.json`** (committed, drift-gated
by `bun desktop:generate --check`); `build.rs` re-emits each pair as
`cargo:rustc-env=CODM_SHELL_ENV_<ROLE>_<KEY>`; **`src/shell_env.rs` is the only Rust module that reads
them back** (`env!()` compile-time constants; `process.env` still overrides at runtime — dev keeps the
root `.env`). Adding `appTauri` to a key's `consumers` without a value in `SHELL_ENV` is a `tsc` error
by construction. RUNTIME facts (`CODM_DATA_DIR`, `CODM_MIGRATIONS_DIR`, `CODM_PARENT_PID`,
`CODM_APP_VERSION`, `NODE_ENV`) stay computed in `sidecars/mod.rs` — only the running process knows
them. Never edit `shell-env.json` by hand; never reintroduce a port/URL literal in `.rs` (the 0.5.1
daemon shipped without `CODM_CLOUD_URL` and answered `503 CLOUD_UNREACHABLE` to every screen because
the supervisor's hand-written env list drifted from the manifest). The release workflows read
`VITE_CODM_CLOUD_URL` from the committed `shell-env.json` — there is no `CODM_CLOUD_URL` repo
variable any more.

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

**DMG install window** (`config/dmg.ts`, rendered into `bundle.macOS.dmg`): window size, screen
position and the CENTER of each icon (app + Applications alias), in Finder content points. The
background picture `src-tauri/dmg/background.png` is committed and drawn from the SAME object by
`bun desktop:dmg-background` (`scripts/og/dmg-background.ts` — Playwright at 2×, then a `pHYs`
chunk declaring 144 DPI, or Finder paints it at double size). Rails: DSK-13 (conf ↔ config, file
exists) + `scripts/og/dmg-background.test.ts` (PNG = 2× `windowSize` @ 144 DPI, arrow between the
icons). Facts measured on a real volume (2026-08-25): the bundler fixes icon size 128 / label 16
(`DMG_FINDER`, not configurable); `windowSize` INCLUDES the title bar, so ~28 pt of the picture's
bottom are hidden — keep nothing important there; and Finder draws icon labels in DARK text over a
light background picture even in dark mode, so one light picture serves both appearances. Moving an
icon = edit `config/dmg.ts` → `bun desktop:generate` + `bun desktop:dmg-background`.
**On CI the layout is applied by an AppleScript driving Finder, and the bundler SKIPS it when
`CI=true` (`--skip-jenkins`, tauri#592)** — the DMG then ships `.background/background.png` but no
`.DS_Store`, i.e. the bare window (that is what v0.5.3 shipped). Both release workflows set
`TAURI_BUNDLER_DMG_IGNORE_CI=true` on the macOS leg; it works because the runner is a LaunchAgent in
the mini's GUI session, and it needs an Automation → Finder grant for the runner's **`node`**
(`externals/nodeXX/bin/node` — the TCC client behind `run:` steps, NOT `Runner.Listener`). The
prompt never shows for a bare binary: the first run hangs 2 min, macOS records a denial, and the
entry is toggled on by hand in System Settings; a runner node upgrade changes the path and repeats
the dance (procedure in `docs/RELEASE.md`). A denied grant is `exit 64` from the bundler = red
release, not a silent fallback.

**Adding a sidecar** = add an entry to `config/sidecars.ts` (`SIDECARS`) + `bun desktop:generate` —
never edit tauri.conf.json/mod.rs literals. **Adding a native capability** = add the abstract key to
`CAPABILITIES` AND its permission list to `CAPABILITY_PERMISSIONS` — both in `config/capabilities.ts`
— then regenerate. The two must agree — a key with no entry in the map fails the render loudly.

## Packaged-app ports — a CANDIDATE list, never a fixed value (2026-08-25/26)

**Incident.** The 0.5.4 installed build's daemon (`API_PORT=3030`, `SHELL_ENV.API_PORT` copied
verbatim from `REPO.env.API_PORT.example` — the SAME family `bun dev` uses) died on boot with
`EADDRINUSE: Failed to start server. Is port 3030 in use?`: port 3030 had been held for 15h by an
unrelated `bun run --watch ./src` dev server from a sibling project on the same machine. Cascading
symptoms: `boot failed for 1 sidecar(s): codm-daemon`, the login loopback answered `NETWORK_ERROR`,
the SSE stream answered `Load failed`, and the operator saw an icon that produced no usable window.
**Decision:** the packaged app gets its OWN port family, far from every dev/service port this
repo's stack (or a founder's other projects) is likely to bind, tries several candidates at boot,
and fails LOUD (never silently rebinds to a wrong address) when every one of them is taken.

**The contract.** `config/ports.ts` declares `PORT_CANDIDATES` — an ORDERED list per sidecar
(`API_PORT`/`CHANNEL_PORT`), in an unusual range, below the OS ephemeral band (see that file's
docblock for the exact numbers and the reasoning behind each constraint). `config/env.ts`'s
`SHELL_ENV` carries a `ShellEnvEntry` per key — `{ kind: 'candidates', candidates: [...] }` for a
port, `{ kind: 'fixed', value }` for a URL/brand name — DECLARED per key, never inferred from
`key.endsWith('_PORT')`. `generate.ts` renders `shell-env.json` with the candidate list as a JSON
ARRAY (not a single string); `build.rs` reads the JSON's own type (`Value::Array` vs `::String`) to
decide whether to join the elements with `,` before emitting one `cargo:rustc-env`, and validates
every element; `shell_env.rs::port_candidates` splits the CSV back into `Vec<u16>` at compile-time
constant read.

**The CSP authorizes EVERY candidate.** Generation time cannot know which one will win at boot, so
`connect-src`/`img-src` list all of them — documented in `generate.ts` next to `sidecarPortCandidates`,
with the `Load failed` symptom named explicitly (same failure mode `./cloud.ts` documents for a
missing cloud origin: the webview blocks the request before it leaves, with no HTTP status to
distinguish it from a genuinely dead server). Forgetting to regenerate after editing
`config/ports.ts` reproduces that exact symptom. `generate.test.ts` DSK-17 gates that every declared
candidate is actually present in the CSP.

**The boot-time choice.** `sidecars::resolve_ports()` (`src-tauri/src/sidecars/mod.rs`), called
ONCE in `lib.rs`'s `setup` before `api::Api` is built or any sidecar env is assembled, resolves
BOTH ports up front: `process.env` (`API_PORT`/`CHANNEL_PORT`) still pins one fixed port outright —
how dev/e2e work — otherwise `sidecars::lifecycle::resolve_port` tries each candidate, in order, via
a real `TcpListener::bind`-then-release (`port_conflict`'s technique) and keeps the first free one.
Resolving in exactly one place, threaded through to both `api::Api::new(api_port, channel_port)`
and `sidecars::sidecars(..., api_port, channel_port)`, is load-bearing: two independent candidate
scans could each land on a DIFFERENT free port and put the typed SDK client and the spawned process
on different addresses. A sidecar whose every candidate is occupied comes back as a
`PortsExhausted { name, candidates }` instead of a port; `lib.rs` pre-counts it into the
`ReadinessGate`'s `total` (it will never call `boot_sidecar`, so it must never make the gate wait
for an arrival that isn't coming) and reports it via `sidecars::report_failure` with a reason naming
every port that was tried — the same boot-error splash a spawn failure routes to, never the generic
"did not open".

**The daemon's own race.** The shell's bind-then-release has an inherent gap before the daemon's
own `listen()` — something else can grab the port in between. `packages/api/typescript/src/bootError.ts`
(`formatBootError`) collapses that race, when it happens, into the SAME one-line, port-naming reason
the shell's own `port_conflict` uses — never Bun's raw multi-frame stack trace, which the persisted
stderr would otherwise hand the boot-error splash verbatim.

**The console asks, never assumes.** A packaged app can no longer bake `VITE_API_URL` at build time
— there is no single port to bake. `HostInfoService.apiBaseUrl()` (`packages/app/react/src/services/HostInfoService`)
is the ONE new non-diagnostic method on that port (`platform()` stays diagnostics-only): the Tauri
impl asks the typed `host_ports` command (`src-tauri/src/commands/host_info.rs`, `tauri::State<ResolvedPorts>`
set once alongside `resolve_ports()`); the browser impl answers `null` (that host never decides —
`router.tsx`'s module-load `configureClient(serviceBaseUrls)`, the `VITE_API_URL` default, stands).
`ServicesProvider` calls it once, BEFORE `setContainer` reveals the app tree (`Outlet` lives inside
the provider, so no route loader can fire before this resolves), and re-`configureClient`s with
`computeServiceBaseUrls(hostApiBaseUrl)` (`packages/app/react/src/lib/config.ts` — the ONE formula
both the default and the runtime override use) when the host supplies one.

## Mental model

The **product is the react console**; the shell is plumbing. `packages/app/tauri` may
only ever do three jobs:

1. **Serve the console** — dev via `build.devUrl` (`http://localhost:5173/app/`), prod via
   `build.frontendDist` (`packages/app/react/dist/client`, produced by
   `nx run app-react:build-spa`; `CODM_DESKTOP=true` flips vite to base `/` + SPA shell +
   no nitro).
2. **Supervise sidecars** — `bundle.externalBin` = `codm-daemon` (TS, `bun build
   --compile`) + `codm-gateway` (Go). `src-tauri/src/lib.rs` spawns both on boot and
   health-checks: daemon `GET :3030/session`, gateway `GET :3032/api/openapi.json`;
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

Procedures — issuing a certificate, recovering on a new machine, and re-granting Full Disk Access
after a cdhash change — live in `docs/RELEASE.md`, section *"A assinatura Apple (Developer ID)"*.
Keep them there, not here: this section is the rule, that one is the runbook.

Diagnosing a suspected recurrence (`log` is a zsh builtin — the absolute path is required, or the
query silently returns nothing):

```bash
/usr/bin/log show --last 30m --predicate 'eventMessage CONTAINS "deny"' --info --debug \
  | grep "System Policy"
```
