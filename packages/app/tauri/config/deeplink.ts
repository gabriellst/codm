/**
 * Deep link config — the `codm://` URL scheme the desktop shell registers with the OS, owned by
 * the desktop shell package, colocated with the rest of the config surface (this folder).
 *
 * The scheme is a genuine per-product decision (SP2 design spec, decisão 7: `codm://` casa com
 * the `app.codm.desktop` identifier already registered in ./app). `./generate.ts` renders it into
 * `src-tauri/tauri.conf.json` `plugins.deep-link.desktop.schemes`; `src-tauri/src/lib.rs` registers
 * the `tauri-plugin-deep-link` plugin that lets the OS hand a `codm://...` URL back to the shell.
 *
 * SP2's device-token flow (spec Decision 4) redirects the system browser to
 * `codm://auth?code=<one-time>` once the cloud OAuth handshake completes. Listening for the
 * resulting event (`onOpenUrl` from `@tauri-apps/plugin-deep-link`) is the react console's job —
 * this file only declares the scheme the OS registers; it grows no react-facing code.
 */
export const DEEPLINK = {
	scheme: 'codm',
} as const
