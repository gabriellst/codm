import { describe, it, expect, beforeEach } from 'bun:test'
import { createInMemorySessionStore, type SessionStore } from './SessionStore'

/**
 * Whatscode port, rekeyed (channelId, remoteId) → issueId (Fork B) and re-backed: the codedm
 * daemon has no Redis on the TS side, so the store is in-process (durable resume identity lives
 * in terminal_llm_sessions).
 */
describe('SessionStore', () => {
	let store: SessionStore

	beforeEach(() => {
		store = createInMemorySessionStore()
	})

	it('persists and returns a sessionId by issueId', async () => {
		await store.set('issue-1', 'tsid-1')
		expect(await store.get('issue-1')).toBe('tsid-1')
	})

	it('returns null for an unknown issue', async () => {
		expect(await store.get('issue-x')).toBeNull()
	})

	it('deletes a sessionId', async () => {
		await store.set('issue-1', 's')
		await store.delete('issue-1')
		expect(await store.get('issue-1')).toBeNull()
	})
})
