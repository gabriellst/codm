import type { SecretsService } from '../../../contract'

/**
 * localStorage DEV fallback — namespaced, documented as dev-only in the contract
 * (contract/secrets.ts). Never treat this as secure storage: the desktop platform
 * is the one backed by the OS keychain.
 */
const SECRET_PREFIX = 'codedm.native.secret.'

export class BrowserSecretsService implements SecretsService {
	async get(key: string): Promise<string | null> {
		return localStorage.getItem(`${SECRET_PREFIX}${key}`)
	}

	async set(key: string, value: string): Promise<void> {
		localStorage.setItem(`${SECRET_PREFIX}${key}`, value)
	}

	async delete(key: string): Promise<void> {
		localStorage.removeItem(`${SECRET_PREFIX}${key}`)
	}
}
