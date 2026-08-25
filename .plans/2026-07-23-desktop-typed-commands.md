# Plan — Desktop typed commands: kill the stringly `invoke`, de-leak the contract

**Branch:** `desktop-typed-commands` (worktree off `main@66298cb9`)
**Origin:** founder — *"os valores do service deveriam ser declarados como commands no próprio @tauri, tipados; o invoke importaria o tipo do package do tauri, pois são infras iguais, podem se importar."*
**Goal:** make the desktop console's native calls typed end-to-end, with the Tauri command + permission vocabulary owned by the `@codedm/app-tauri` package, and the abstract `REPO.desktop` contract holding only platform-agnostic capability keys. Upstream-ready standard for the desktop-shell pattern.

---

## The leak, concretely (@ 66298cb9)
1. **Stringly `invoke`** — `packages/app/react/src/services/utils/tauri/invoke.ts` is `invoke<T>(command: string)` over `window.__TAURI__.core.invoke`. Every `Tauri*Service` re-types by hand:
   - `TauriSecretsService`: `invoke<string|null>('secret_get',{key})` — **custom `#[tauri::command]`** in `src-tauri/src/lib.rs`, re-typed by hand in TS.
   - `TauriFilePickerService`: `invoke('plugin:dialog|open', …)` — plugin-dialog.
   - `TauriNotificationService`: `invoke('plugin:notification|…')` — plugin-notification.
   - `TauriAutostartService`: `invoke('plugin:autostart|…')` — plugin-autostart.
   - `TauriBadgeService`: `invoke('plugin:window|set_badge_count', …)` — core window.
2. **Contract holds Tauri permission strings** — `template.config.ts` `REPO.desktop.services` is `Record<string, readonly string[]>` of raw permissions (`filePicker: ['dialog:allow-open']`, `badge: ['core:window:allow-set-badge-count']`, …). `scripts/desktop/generate.ts:136` `renderCapabilities()` does `Object.values(REPO.desktop.services).flat()` straight into `capabilities/default.json`. The abstract contract knows Tauri's permission grammar — that's the leak.

## Target shape
- **Custom commands → tauri-specta.** Annotate `secret_get/set/delete` `#[specta::specta]`, collect in a `tauri_specta::Builder`, export typed TS bindings to `packages/app/tauri/bindings.ts` (committed + drift-checked). `TauriSecretsService` imports `commands.secretGet(key)` from `@codedm/app-tauri/commands` — name+args+return from the Rust. One source of truth.
- **Plugin/core → typed npm APIs.** Each `Tauri*Service` imports the typed `@tauri-apps/plugin-*` / `@tauri-apps/api/window` API directly (already lint-allowed in `Tauri*Service.ts`). No re-wrapping façade.
- **Contract de-leaked.** `REPO.desktop.services: Record<string,string[]>` → `REPO.desktop.capabilities: readonly CapabilityKey[]` (abstract keys). The `capability → Tauri permissions[]` map moves to **`@codedm/app-tauri/capabilities`** (`CAPABILITY_PERMISSIONS`, lifted verbatim from the old `services` map). `scripts/desktop/generate.ts` **imports that map** to render `default.json`, fail-loud on a capability with no mapping.
- **`invoke.ts` retired** once nothing imports it. `isTauri.ts` (env probe) stays.

## Hard invariants (gates)
1. `capabilities/default.json` **byte-identical to HEAD** — permissions unchanged, only re-sourced (proves behavior-preserving).
2. No `@tauri-apps/*` resolves into the react **main/browser** chunk — only the code-split tauri chunk (the seam already guarantees this; must still hold).
3. eslint `no-restricted-imports` still bites outside the `Tauri*Service.ts` / `services/utils/tauri/` / `services/registry/tauri.ts` allowlist.

## Deliverables
- **D1 Rust/specta.** Cargo deps (`specta` v2, `specta-typescript`, `tauri-specta` v2 derive+typescript); `#[specta::specta]` on `secret_*`; `tauri_specta::Builder` + `builder.invoke_handler()` in `lib.rs`; export test (runs on `cargo test`) writes `packages/app/tauri/bindings.ts`. Gate: `cargo build` + `cargo test` green, `bindings.ts` emitted.
- **D2 `@codedm/app-tauri` TS surface.** `package.json` exports `./commands`→`bindings.ts`, `./capabilities`→`capabilities.ts`; runtime deps (`@tauri-apps/api`, plugin packages). `capabilities.ts` = `CAPABILITY_PERMISSIONS` (verbatim from old `REPO.desktop.services`).
- **D3 React services.** Secrets → `@codedm/app-tauri/commands`; FilePicker/Notification/Autostart → typed `@tauri-apps/plugin-*`; Badge → `@tauri-apps/api/window` `getCurrentWindow().setBadgeCount()`; HostInfo → typed `@tauri-apps/api`. Delete `services/utils/tauri/invoke.ts`.
- **D4 Contract.** `REPO.desktop.services` → `capabilities: [...] as const`; `DesktopConfig.services` → `capabilities: readonly string[]`.
- **D5 generate.ts.** `renderCapabilities()` imports `CAPABILITY_PERMISSIONS` from `@codedm/app-tauri/capabilities`, maps `REPO.desktop.capabilities` through it, fail-loud on missing key. Update `generate.test.ts` + header comment (fix stale `src/lib/native` → `src/services`).
- **D6 Regen + gates.** `bun desktop:generate` → `capabilities/default.json` byte-identical (drift check). Battery: cargo build/test · react tsc + build-spa + code-split gate (no `@tauri-apps/*` in main chunk) · lint · tooling (drift) · tsc repo-wide (template.config ripples).
- **D7 Docs.** `.claude/skills/desktop-shell/SKILL.md` — the typed-commands pattern (custom→specta; plugin/core→typed npm; contract = abstract capabilities; @tauri owns bindings + capability→permission map; generate.ts imports it). Blueprint for the template upstream.

## Fallback (documented)
If `tauri-specta` v2 / `specta` v2 / Tauri v2 version-compat blocks `cargo build` after a bounded number of version attempts, deliver the SAME end shape with a **hand-written typed `commands.ts`** in `@codedm/app-tauri` (react imports `commands.secretGet` identically; types hand-synced). D3/D4/D5 (stringly-invoke retirement + contract de-leak) are independent of specta and ship regardless. Report any fallback taken.

## Tradeoff (honest)
`@tauri-apps/api` moves from *absent* to *present-but-code-split-isolated* (invariant 2 keeps the browser entry clean). specta adds a Rust codegen dep + build step for a small custom-command surface — bought: end-to-end typing, no stringly invoke, no contract leak, next custom command typed by default.

## Out of scope
Full template-fullstack upstream of the desktop pattern (that repo has no `packages/app/tauri`) — D7's skill doc is its blueprint. The channel rich-model/sqlc refactor (separate branch/worktree).
