# @codedm/app-tauri — desktop shell

Tauri v2 host for the CodeDM desktop app. The shell does three things and nothing else:

1. **Serves the react console** — dev: `devUrl` → the vite dev server at
   `http://localhost:5173/app/`; prod: `frontendDist` → the static SPA emitted by
   `nx run app-react:build-spa` (`packages/app/react/dist/client`, `CODEDM_DESKTOP=true`
   flips vite to base `/`, SPA shell prerender, no nitro server).
2. **Supervises the sidecars** — `bundle.externalBin` ships `codedm-daemon`
   (TS daemon, `bun build --compile`) and `codedm-gateway` (Go). `src/lib.rs` spawns both
   at boot and health-checks them: daemon `GET :3030/v1/session`, gateway
   `GET :3032/api/openapi.json` (60s budget; emits `sidecar:ready` / `sidecar:error` to
   the webview). Build the binaries with `bun x nx run app-tauri:sidecars`.
3. **Backs the `lib/native` seam** — the react console reaches OS capabilities only via
   `packages/app/react/src/lib/native/` (pickFolder/notify/badge/secrets/autostart).
   Secrets are keychain-backed custom commands (`secret_get/set/delete`).

Direction rules (enforced; see `.claude/skills/desktop-shell/`):
- tauri → react only through build config (`devUrl`/`frontendDist` + nx `dependsOn` on
  `app-react:build-spa`). The shell never imports console code.
- react → tauri only through `lib/native` (`@tauri-apps/*` is eslint-forbidden elsewhere).

Transport is the **interim local-HTTP** one (console → daemon :3030 → gateway :3032) —
smallest delta from the web topology and fully reversible: swapping to a
SQLite-WAL/IPC transport (go-domain branch subject) only moves the readiness URLs and
the seam bindings, not the console.

## Commands

```bash
bun x nx run app-tauri:dev        # tauri dev (starts app-react:dev via beforeDevCommand)
bun x nx run app-tauri:sidecars   # compile sidecar binaries into src-tauri/binaries/
bun x nx run app-tauri:bundle     # production shell build (build-spa + sidecars first)
```

`bundle` is intentionally NOT named `build` so `nx run-many -t build` stays green on
machines without a Rust toolchain — the shell build is opt-in.

## Toolchain prerequisites

- **Rust** (`cargo`, via rustup) — required for `dev`/`bundle`. Not present on the
  authoring machine: the Rust sources are marked UNVERIFIED-COMPILE and the
  `tauri dev` acceptance is parked in `.specs/codedm/OVERNIGHT-BLOCKED.md`.
- **Icons** — `src-tauri/icons/` is not committed yet; run
  `bun x tauri icon <path-to-1024.png>` once before the first `bundle`.
