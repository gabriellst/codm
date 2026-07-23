/**
 * Small secret store for operator credentials (agent API keys, gateway apikey).
 * Desktop: OS keychain (shell `secret_*` commands). Browser: localStorage DEV
 * fallback — never treat a browser implementation as secure storage.
 */
export interface SecretsService {
	get(key: string): Promise<string | null>
	set(key: string, value: string): Promise<void>
	delete(key: string): Promise<void>
}
