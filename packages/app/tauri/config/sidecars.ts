/**
 * Desktop sidecar manifest — the LEAN cross-boundary list of subprocesses the shell bundles +
 * supervises (TS daemon + Go gateway). This is PACKAGE CODE, colocated with the rest of the config
 * surface (this folder), because two JS-side seams need the SAME list: the sidecar build
 * (`./build-sidecars.ts` — binary names + build recipes) and the config generator (`./generate.ts`
 * — `externalBin`, the CSP connect-src port, `bundle.resources`). It is deliberately NOT in the
 * abstract product contract (template.config.ts): the sidecar set is a fact of THIS package, not a
 * per-product knob.
 *
 * What is NOT here: each sidecar's boot ENV. That lives inline in the Rust supervisor
 * (`src-tauri/src/sidecars/mod.rs`), because boot-env values are runtime paths (`data_dir`,
 * `resource_dir/migrations`) and shell-decision literals the supervisor computes — not a
 * cross-boundary contract, and never worth an env DSL.
 *
 * Also NOT here (since B1/E1): each sidecar's health PATH. It used to be a `healthPath` field on
 * this manifest, hand-kept in sync with the two backends' endpoints. It has had zero readers since
 * the supervisor's `probe()` stopped writing raw HTTP and started calling the typed SDK
 * (`api.client.<service>.health()`, generated from each backend's OpenAPI) — the path now travels
 * inside the client method itself. A path field here would be exactly the kind of manifest drift
 * this file exists to avoid; `config/generate.test.ts` (DSK-03) asserts it never comes back.
 */
import type { WorkspaceId } from '../../../../template.config'

export interface SidecarManifestEntry {
	/** Binary role suffix — the bundled binary is `<brand>-<role>` (see `./build-sidecars.ts` / `externalBin`). */
	role: string
	/** REPO.env key holding the port this sidecar listens on (the generator reads its `example`
	 *  for the CSP connect-src; the Rust supervisor reads the same env var at runtime). */
	portEnvKey: string
	/** How `./build-sidecars.ts` compiles the binary: the toolchain kind, the entry, and the source workspace. */
	build: { kind: 'bun-compile' | 'go-build'; entry: string; workspace: WorkspaceId }
}

export const SIDECARS = [
	{
		role: 'daemon',
		portEnvKey: 'API_PORT',
		build: { kind: 'bun-compile', entry: './src/index.ts', workspace: 'apiTs' },
	},
	{
		role: 'gateway',
		portEnvKey: 'CHANNEL_PORT',
		build: { kind: 'go-build', entry: './cmd/api', workspace: 'apiGo' },
	},
] as const satisfies readonly SidecarManifestEntry[]
