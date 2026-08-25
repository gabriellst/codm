# Plan — Desktop de-parametrization: code over config/codegen

**Branch:** `desktop-deparametrize` (worktree off `main@90c4e46a`)
**Origin:** founder critique — the desktop `generate.ts` is too configuration-ish; things that should be code (the sidecar list, the Rust supervisor, the env resolution) were turned into contract fields + a Rust code-generator. "Parametrization" was taken too far for a shell that lives in ONE package.

**Principle (the classifier):** config/codegen earns its cost ONLY when a value (a) crosses a language/process boundary, (b) varies per product, AND (c) isn't trivially derivable. Fail any → it's code, colocated where it's used. The desktop shell over-applied contract-first (right for the cross-language DOMAIN: enums/events/DB; wrong for a single-package shell).

## Target — move code back to code, shrink the generator to the minimal cross-boundary JSON.

Behavior-preserving: the shell must boot IDENTICALLY (same sidecar bootEnv, same tauri.conf modulo the removed generated.rs). The CURRENT `src/sidecars/generated.rs` is the reference for the exact env each sidecar boots with.

### Deliverables
1. **Rust `src/sidecars/mod.rs`** — hand-write `sidecars(data_dir, resource_dir) -> Vec<Sidecar>`: list daemon + gateway, read ports from `std::env::var` at runtime, compute data_dir/resource_dir paths, set each bootEnv **inline in Rust** (matching the current generated.rs env exactly: daemon = API_PORT/CODEDM_DATA_DIR/CODEDM_MIGRATIONS_DIR(=resource_dir/migrations)/API_GO_URL/NODE_ENV; gateway = CHANNEL_PORT/CODEDM_DATA_DIR/CHANNEL_ALLOWED_ORIGINS). Use **`app.config().identifier`** (Tauri exposes the bundle id at runtime) for the keyring service name — KILLS the generated IDENTIFIER const. Delete `generated.rs` + the `include!`.
2. **Package sidecar manifest** (`packages/app/tauri/sidecars/manifest.ts`) — the LEAN cross-boundary list the JS side needs: `{ role, portEnvKey, healthPath, build: { kind, entry, workspace } }` per sidecar. Lives in the tauri PACKAGE (not the abstract product contract, NOT a BootEnvSource DSL). Both the generator and build.ts read it. No env DSL — the Rust owns env.
3. **`scripts/desktop/generate.ts`** — DELETE `renderGeneratedRs`, `resolveBootEnv`, `resourceDirSubpaths`, `BootEnvSource` handling. `renderTauriConf` reads the package manifest for `externalBin` + CSP connect-src + `bundle.resources` (the migrations staging: `binaries/migrations`→`migrations`). OUTPUTS drops `generated.rs` (→ tauri.conf.json + capabilities/default.json only). Update `generate.test.ts`.
4. **`template.config.ts` `REPO.desktop`** — REMOVE `sidecars[]`, `SidecarDecl`, `BootEnvSource`. Keep: brand, identifier/displayName (brand-derived), window (size/label), capabilities, console. `console.connectsTo` → CSP now derives from the manifest, so drop it or keep only if still referenced.
5. **`sidecars/build.ts`** — read the package manifest (host-triple + build.kind→toolchain stays; the sidecar LIST comes from the manifest, not `REPO.desktop.sidecars`).
6. **Migrations staging (the one intricate coordinated bit)** — keep it working but as EXPLICIT code: Rust sets `CODEDM_MIGRATIONS_DIR = resource_dir/migrations` inline; `generate.ts` emits `bundle.resources: { "binaries/migrations": "migrations" }`; `build.ts` stages the drizzle migrations under `binaries/migrations`. No DSL — three explicit lines.

### Hard invariant
The generated `tauri.conf.json` keeps the SAME `externalBin`, `bundle.resources`, CSP connect-src, identity, and window it has today (only sourced from the manifest/WINDOW instead of the contract). `capabilities/default.json` byte-identical. A `bun desktop:dev` boots the two sidecars healthy exactly as before.

### Gates (hermetic)
cargo build (crate compiles with the hand-written sidecars() + app.config().identifier) · `bun desktop:generate --check` (now 2 outputs, coherent) · repo-wide tsc (template.config without sidecars — catches every consumer of the removed types) · tooling drift test updated · `git diff` on tauri.conf.json shows ONLY the generated.rs-related removal, not externalBin/resources/csp changes.

### Boot smoke (post-merge, manual)
`bun desktop:dev` → daemon (/v1/session) + gateway (/api/openapi.json) both health-200, window opens. Proves the hand-written Rust env matches.

## Out of scope
The sidecar SET (daemon+gateway) doesn't change. The console/capabilities parametrization stays (genuinely cross-boundary react wiring). This is the desktop-shell blueprint correction — fold into the template upstream so the over-parametrization isn't recreated.
