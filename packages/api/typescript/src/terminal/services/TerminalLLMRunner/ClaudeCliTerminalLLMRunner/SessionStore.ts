/**
 * Persists `issueId → claudeSessionId` so the engine can associate a fresh spawn with the
 * previous CLI session after an idle eviction (Fork B rekey of whatscode's Redis-backed
 * `(channelId, remoteId)` store).
 *
 * ADAPTATION: whatscode backed this with Redis; the codedm daemon is a single embedded process
 * with no Redis on the TS side, and the DURABLE resume identity already lives in
 * `TerminalLLMSessionRepository` (the `terminal_llm_sessions` row). This in-process store covers
 * the intra-process eviction ↔ respawn window; the interface stays async so a durable
 * implementation can swap in without touching the engine.
 */
export interface SessionStore {
	get(issueId: string): Promise<string | null>
	set(issueId: string, sessionId: string): Promise<void>
	delete(issueId: string): Promise<void>
}

export function createInMemorySessionStore(): SessionStore {
	const map = new Map<string, string>()
	return {
		async get(issueId) {
			return map.get(issueId) ?? null
		},
		async set(issueId, sessionId) {
			map.set(issueId, sessionId)
		},
		async delete(issueId) {
			map.delete(issueId)
		},
	}
}
