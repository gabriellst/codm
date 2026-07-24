/**
 * Sidecar declaration types — RE-EXPORTED from the abstract contract.
 *
 * `SidecarDecl` / `BootEnvSource` stay DEFINED in `template.config.ts` (the platform-agnostic
 * contract that declares REPO.desktop.sidecars). The desktop shell package re-exports them so
 * consumers can discover the sidecar vocabulary through `@codedm/app-tauri/sidecars` without
 * reaching into the contract — and, critically, without the contract ever importing the shell
 * package (the dependency direction stays contract → shell only).
 */
export type { SidecarDecl, BootEnvSource } from '../../../../template.config'
