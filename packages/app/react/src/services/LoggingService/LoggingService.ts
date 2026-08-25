/**
 * Forwards the webview's own `console.*` calls to the host's persisted log backend, once per
 * boot. PORT only — impls colocated.
 *
 * Exists because of a measured blind spot (2026-08-07): a login failure ("Não foi possível
 * concluir o login") left no trace anywhere — `console.error` in a packaged build only ever
 * reached devtools, which do not exist for an installed app, and the shell had no log backend of
 * its own either (see src-tauri/src/lib.rs). Without this, "which step failed" is a question
 * nobody can answer after the fact.
 */
export interface LoggingService {
	/** Idempotent — safe to call more than once (React StrictMode double-invoke, HMR): only the
	 *  first call installs the forward, later calls are no-ops. */
	attachConsole(): Promise<void>
}
