import { commands, events } from '@codm/app-tauri/commands'
import type { UpdateService } from './UpdateService'

/**
 * The desktop shell's background updater, typed end-to-end by tauri-specta
 * (packages/app/tauri/commands/bindings.ts — command names, event name and payload shape all come
 * from the Rust in src-tauri/src/updater.rs + src-tauri/src/commands/update.rs). No stringly
 * `invoke`, no stringly `listen('update-ready')`: rename the Rust type and this file stops
 * compiling.
 *
 * `restart()` is `restart_for_update` — the same `handle.restart()` primitive `retry_boot` uses,
 * fired by a different trigger. The shell never calls it on its own; only this class does, and only
 * in reaction to the operator clicking the pill.
 */
export class TauriUpdateService implements UpdateService {
	async pending(): Promise<string | null> {
		return await commands.pendingUpdate()
	}

	async subscribe(listener: (version: string) => void): Promise<() => void> {
		return await events.updateReady.listen(event => listener(event.payload.version))
	}

	async restart(): Promise<void> {
		await commands.restartForUpdate()
	}
}
