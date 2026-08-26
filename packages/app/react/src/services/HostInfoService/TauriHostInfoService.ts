import { commands } from '@codm/app-tauri/commands'
import type { HostInfoService, NativePlatform } from './HostInfoService'

export class TauriHostInfoService implements HostInfoService {
	async platform(): Promise<NativePlatform> {
		return 'tauri'
	}

	/**
	 * The host, typed end-to-end by tauri-specta (packages/app/tauri/commands/bindings.ts — name and
	 * return shape come from `host_ports` in src-tauri/src/commands/host_info.rs). No `invoke`
	 * stringly, and no port literal here: the shell resolved `apiPort` at boot from its own candidate
	 * list (`config/ports.ts`) — this is the ONE place the console asks which candidate won.
	 */
	async apiBaseUrl(): Promise<string | null> {
		const { apiPort } = await commands.hostPorts()
		return `http://127.0.0.1:${apiPort}`
	}
}
