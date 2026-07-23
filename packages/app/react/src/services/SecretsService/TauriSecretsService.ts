import { invoke } from '../utils/tauri/invoke'
import type { SecretsService } from './SecretsService'

/** OS keychain via the shell's custom `secret_*` commands
 *  (packages/app/tauri/src-tauri/src/lib.rs — keyed by the generated IDENTIFIER). */
export class TauriSecretsService implements SecretsService {
	get(key: string): Promise<string | null> {
		return invoke<string | null>('secret_get', { key })
	}

	async set(key: string, value: string): Promise<void> {
		await invoke('secret_set', { key, value })
	}

	async delete(key: string): Promise<void> {
		await invoke('secret_delete', { key })
	}
}
