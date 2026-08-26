# @codm/app-tauri — desktop shell

Tauri v2 host for the CODM desktop app. The shell does three things and nothing else:

1. **Serves the react console** — dev: `devUrl` → the vite dev server at
   `http://localhost:5173/app/`; prod: `frontendDist` → the static SPA emitted by
   `nx run app-react:build-spa` (`packages/app/react/dist/client`, `CODM_DESKTOP=true`
   flips vite to base `/`, SPA shell prerender, no nitro server).
2. **Supervises the sidecars** — `bundle.externalBin` ships `codm-daemon`
   (TS daemon, `bun build --compile`) and `codm-gateway` (Go). `src/lib.rs` spawns both
   at boot and health-checks them: daemon `GET :3030/v1/session`, gateway
   `GET :3032/api/openapi.json` (60s budget; emits `sidecar:ready` / `sidecar:error` to
   the webview). Build the binaries with `bun x nx run app-tauri:sidecars`.
3. **Backs the tauri platform services of the native contract** — the react console
   consumes OS capabilities as ports (`packages/app/react/src/lib/native/contract/`:
   dialog/notification/badge/secrets/autostart/hostInfo), implemented for the desktop
   under `lib/native/platforms/tauri/services/` and injected by the NativeProvider.
   Secrets are keychain-backed custom commands (`secret_get/set/delete`); the tauri
   permissions each service needs are declared in
   `config/capabilities.ts` (`CAPABILITIES` + `CAPABILITY_PERMISSIONS`; capabilities JSON is generated).

Direction rules (enforced; see `.claude/skills/desktop-shell/`):
- tauri → react only through build config (`devUrl`/`frontendDist` + nx `dependsOn` on
  `app-react:build-spa`). The shell never imports console code.
- react → tauri only through `lib/native/platforms/tauri/` (`@tauri-apps/*` is
  eslint-forbidden elsewhere).

Transport is the **interim local-HTTP** one (console → daemon :3030 → gateway :3032) —
smallest delta from the web topology and fully reversible: swapping to a
SQLite-WAL/IPC transport (go-domain branch subject) only moves the readiness URLs and
the platform service bindings, not the console.

## Commands

```bash
bun x nx run app-tauri:dev        # tauri dev (starts app-react:dev via beforeDevCommand)
bun x nx run app-tauri:sidecars   # compile sidecar binaries into src-tauri/binaries/
bun x nx run app-tauri:bundle     # production shell build (build-spa + sidecars first)
```

`bundle` is intentionally NOT named `build` so `nx run-many -t build` stays green on
machines without a Rust toolchain — the shell build is opt-in.

## Toolchain prerequisites

- **Icons** — `src-tauri/icons/` is committed; regenerate with
  `bun x tauri icon <path-to-1024.png>` when the mark changes.
- **DMG install window** — `src-tauri/dmg/background.png` (the "drag to Applications"
  picture) is committed too. Layout lives in `config/dmg.ts` (window size + icon positions,
  rendered into `bundle.macOS.dmg`); the picture is drawn from the SAME coordinates by
  `bun desktop:dmg-background` (`scripts/og/dmg-background.ts`, Playwright, 2× @ 144 DPI).
  Move an icon in `config/dmg.ts` → `bun desktop:generate` + `bun desktop:dmg-background`.

`bun desktop:dev` / `bun desktop:bundle` need, on every OS: **bun**, **go** (the gateway sidecar),
**Rust via rustup** (`cargo`), and the SDK generated once (`bun sdk`). Per OS, on top of that:

| OS | Extra |
|---|---|
| macOS | Xcode Command Line Tools (`xcode-select --install`). Signing is NOT required locally — the conf ships `signingIdentity: '-'` (rail DSK-10); the Developer ID only reaches release builds through env. |
| Linux (Ubuntu 22.04+) | `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev patchelf` — webkit/gtk/tray for Tauri, `libdbus-1-dev` for the keyring `sync-secret-service` feature, `patchelf` for the AppImage bundler. A running Secret Service (gnome-keyring/KWallet) is needed at RUNTIME for the session to persist. |
| Windows 10/11 | `rustup` with the **MSVC** toolchain (`x86_64-pc-windows-msvc`, needs Visual Studio Build Tools "Desktop development with C++"), bun, go. WebView2 is already on Win10/11; the NSIS installer bootstraps it otherwise. Use git-bash or PowerShell — the scripts are cross-platform, the sidecars get `.exe` automatically. |

Release targets today: `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`,
`x86_64-pc-windows-msvc`. `HOST_TRIPLES` in `config/build-sidecars.ts` also resolves
`x86_64-apple-darwin` and `aarch64-unknown-linux-gnu` hosts for local dev, but no release ships
them yet. Sidecars are always built on the host — no cross-compile — because the daemon loads the
host's libsql native prebuild at runtime; `scripts/release/smoke-sidecars.ts` boots the freshly
built binaries exactly as the shell does and is the fastest way to know a toolchain is complete:

```bash
cp -n .env.example .env && bun emit-openapi && bun desktop:sidecars && bun scripts/release/smoke-sidecars.ts
```

- **Icons** — `src-tauri/icons/` is committed (all three OS formats); regenerate with
  `bun x tauri icon <path-to-1024.png>` only when the artwork changes.
