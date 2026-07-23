---
name: desktop-shell
description: Work on the CodeDM desktop shell — the Tauri v2 host (packages/app/tauri), the react NativeShell seam (packages/app/react/src/lib/native), sidecar supervision, or any OS-integration capability (folder picker, notifications, badge, secrets, autostart). Use whenever a task mentions Tauri, the desktop app, sidecars, or an OS capability the react console needs.
---

# Desktop Shell (Tauri v2)

Flat skill — no per-lang variants. Two artifacts, one seam, two direction rules.

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
3. **Back the NativeShell seam** — keychain `secret_get/set/delete` commands and any
   future OS capability the seam grows.

## The seam (react → shell)

`packages/app/react/src/lib/native/` is the ONLY react↔tauri touchpoint:

- `types.ts` — `NativeShell` interface: `pickFolder` / `notify` / `badge` / `secrets` /
  `autostart`. One capability = one interface member, typed and host-agnostic.
- `tauri.ts` — desktop impl (invokes via the injected `window.__TAURI__` global,
  `withGlobalTauri: true`).
- `browser.ts` — web impl with HONEST degradation (pickFolder resolves `null`; the
  localStorage secret store is dev-only by contract).
- `index.ts` — selection: `export const native = isTauri() ? tauriShell : browserShell`.

Consumers import `{ native }` from `@/lib/native`. Full stop.

## Direction rules (non-negotiable)

- **tauri → react**: build config only (`devUrl`/`frontendDist` + nx `dependsOn`
  `app-react:build-spa`). The shell never imports console source.
- **react → tauri**: only through `lib/native`. `@tauri-apps/*` anywhere else is an
  eslint error (`no-restricted-imports` block in the root `eslint.config.ts`).
- **UI never branches on the host.** If a screen needs "desktop-only" behavior, add a
  capability to `NativeShell` and degrade honestly in `browser.ts` — never
  `if (isTauri())` inside components (diagnostics/telemetry excepted).

## Transport (interim — reversible)

Console → daemon (`:3030`, HTTP) → gateway (`:3032`, proxied via api-ts). This is the
same topology as the web dev stack — smallest possible delta. If/when the desktop
transport pivots (SQLite-WAL / IPC — go-domain branch subject), the only shell changes
are the two readiness URLs + seam bindings; the console does not move.

## Adding a capability (worked shape)

1. Extend `NativeShell` in `types.ts` (typed, minimal, promise-based).
2. Implement in `tauri.ts` — plugin invoke (`plugin:<name>|<command>`) or a new Rust
   `#[tauri::command]` in `src-tauri/src/lib.rs` (+ permission in
   `src-tauri/capabilities/default.json`, + plugin in `Cargo.toml` if new).
3. Implement honest fallback in `browser.ts` — never fake success.
4. Consume via `native.<capability>()` in the component that owns the interaction.

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
