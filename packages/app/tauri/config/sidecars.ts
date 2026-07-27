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
 */
import type { WorkspaceId } from '../../../../template.config'

export interface SidecarManifestEntry {
	/** Binary role suffix — the bundled binary is `<brand>-<role>` (see `./build-sidecars.ts` / `externalBin`). */
	role: string
	/** REPO.env key holding the port this sidecar listens on (the generator reads its `example`
	 *  for the CSP connect-src; the Rust supervisor reads the same env var at runtime). */
	portEnvKey: string
	/** Readiness probe path — documented here; the Rust supervisor owns the runtime probe. */
	healthPath: string
	/** How `./build-sidecars.ts` compiles the binary: the toolchain kind, the entry, and the source workspace. */
	build: { kind: 'bun-compile' | 'go-build'; entry: string; workspace: WorkspaceId }
}

export const SIDECARS = [
	{
		role: 'daemon',
		portEnvKey: 'API_PORT',
		healthPath: '/v1/session',
		build: { kind: 'bun-compile', entry: './src/index.ts', workspace: 'apiTs' },
	},
	{
		role: 'gateway',
		portEnvKey: 'CHANNEL_PORT',
		healthPath: '/api/openapi.json',
		build: { kind: 'go-build', entry: './cmd/api', workspace: 'apiGo' },
	},
] as const satisfies readonly SidecarManifestEntry[]
