/**
 * Public entry for the desktop shell's sidecar build surface.
 *
 * Re-exports the sidecar declaration types (defined in the contract, re-exported here for
 * discovery) and the build entry (`buildSidecars`). The build entry also runs as a standalone
 * script via `bun sidecars/build.ts` (guarded by `import.meta.main`), so importing this module
 * for its types never triggers a build.
 */
export * from './types'
export { buildSidecars } from './build'
