/**
 * Public entry for the desktop shell's sidecar build surface.
 *
 * Re-exports the sidecar manifest (the lean cross-boundary list of bundled subprocesses) and the
 * build entry (`buildSidecars`). The build entry also runs as a standalone script via
 * `bun sidecars/build.ts` (guarded by `import.meta.main`), so importing this module for the
 * manifest never triggers a build.
 */
export * from './manifest'
export { buildSidecars } from './build'
