import { commands } from '@codedm/app-tauri/commands'
import type { SecretsService } from './SecretsService'

/** OS keychain via the shell's custom `secret_*` commands, typed end-to-end by
 *  tauri-specta (packages/app/tauri/bindings.ts — name/args/return come from the Rust
 *  `#[specta::specta]` handlers in src-tauri/src/lib.rs). `commands.*` returns a
 *  `Result<T, string>`; an `error` status is a shell/keychain failure — surface it. */
export class TauriSecretsService implements SecretsService {
	async get(key: string): Promise<string | null> {
		const res = await commands.secretGet(key)
		if (res.status === 'error') throw new Error(res.error)
		return res.data
	}

	async set(key: string, value: string): Promise<void> {
		const res = await commands.secretSet(key, value)
		if (res.status === 'error') throw new Error(res.error)
	}

	async delete(key: string): Promise<void> {
		const res = await commands.secretDelete(key)
		if (res.status === 'error') throw new Error(res.error)
	}
}
