import { debug, error, info, trace, warn } from '@tauri-apps/plugin-log'
import type { LoggingService } from './LoggingService'

type ConsoleMethod = 'log' | 'debug' | 'info' | 'warn' | 'error'

// `console.log` has no matching plugin level — `trace` is the lowest one, same mapping the
// official forwardConsole recipe (Tauri v2 docs, "Logging" plugin page) uses.
const FORWARD: Record<ConsoleMethod, (message: string) => Promise<void>> = { log: trace, debug, info, warn, error }

/** `console.error('failed', err)` must not become "[object Object]" in the file — the whole point
 *  is keeping the detail a bare `String(err)` throws away (stack, nested fields). */
function formatArg(arg: unknown): string {
	if (arg instanceof Error) return arg.stack ? `${arg.name}: ${arg.message}\n${arg.stack}` : `${arg.name}: ${arg.message}`
	if (typeof arg === 'string') return arg
	try {
		return JSON.stringify(arg)
	} catch {
		// circular reference or a value JSON can't represent — fall back rather than throw.
		return String(arg)
	}
}

// Module-level, not instance state: `attachConsole` patches the ONE global `window.console`, so a
// second Container build (HMR, a remount) must not stack a second forwarder on top of the first.
let attached = false

/**
 * `@tauri-apps/plugin-log`'s OWN `attachConsole()` export does the opposite of what its name
 * suggests here: it subscribes the webview to Rust-originated `log://log` events so `log::*` calls
 * show up in devtools — it does not touch `window.console`. What this class implements is the
 * OTHER direction (JS → Rust), the "forwardConsole" recipe from Tauri's own docs: monkey-patch
 * each `console.<method>` to call through to the matching plugin function (`trace/debug/info/
 * warn/error`), which `invoke`s `plugin:log|log` and lands wherever the Rust builder targets —
 * `$data_dir/logs/shell.log` here (src-tauri/src/lib.rs), right next to the sidecar logs.
 *
 * The original `console.<method>` still runs FIRST, unconditionally — `tauri dev`'s terminal and
 * devtools keep working exactly as before; this only ADDS a second destination.
 */
export class TauriLoggingService implements LoggingService {
	async attachConsole(): Promise<void> {
		if (attached) return
		attached = true

		for (const method of Object.keys(FORWARD) as ConsoleMethod[]) {
			const original = console[method].bind(console)
			const forward = FORWARD[method]
			console[method] = (...args: unknown[]) => {
				original(...args)
				// Best-effort: a logging failure must never throw INSIDE a console call — that would
				// turn instrumentation itself into a new production bug (same posture as
				// sidecar_log.rs's best-effort file writes on the Rust side).
				void forward(args.map(formatArg).join(' ')).catch(() => undefined)
			}
		}
	}
}
