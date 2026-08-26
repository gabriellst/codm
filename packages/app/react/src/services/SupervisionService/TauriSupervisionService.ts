import { commands, events } from '@codm/app-tauri/commands'
import type { SupervisionService, SupervisionState } from './SupervisionService'

/**
 * The desktop host's supervisor, typed end-to-end by tauri-specta
 * (packages/app/tauri/commands/bindings.ts — command name, event name and payload shape all come
 * from the Rust in src-tauri/src/sidecars/supervision.rs). No stringly `invoke`, no stringly
 * `listen('supervision:changed')`: rename the Rust type and this file stops compiling.
 *
 * `restart()` is `retry_boot` — the same command the boot-error splash's button calls. There is one
 * recovery path in this app and this is it (the shell never respawns a sidecar behind the
 * operator's back).
 */
export class TauriSupervisionService implements SupervisionService {
	async current(): Promise<SupervisionState> {
		return await commands.supervisionState()
	}

	async subscribe(listener: (state: SupervisionState) => void): Promise<() => void> {
		return await events.supervisionChanged.listen(event => listener(event.payload.state))
	}

	async restart(): Promise<void> {
		await commands.retryBoot()
	}
}
