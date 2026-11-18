import { injectable } from 'tsyringe-neo'
import {
	PanelIdentityStore,
	type PanelCodeRequestRow,
	type PanelIdentityGroup,
	type PanelMember,
	type PanelOpenStop,
	type PanelSessionRow,
} from './PanelIdentityStore'

/** In-memory twin with the same conditional rules (owner-scoped roster, capped attempts, single use). */
@injectable()
export class MockPanelIdentityStore extends PanelIdentityStore {
	readonly groups = new Map<string, PanelIdentityGroup & { token: string }>()
	private readonly requests = new Map<string, PanelCodeRequestRow>()
	private readonly sessions = new Map<string, PanelSessionRow>()

	async groupByToken(token: string): Promise<PanelIdentityGroup | undefined> {
		return [...this.groups.values()].find(group => group.token === token)
	}

	async replaceRoster(
		ownerId: string,
		threadId: string,
		roster: { members: readonly PanelMember[]; openStops: readonly PanelOpenStop[] },
	): Promise<boolean> {
		const group = this.groups.get(threadId)
		if (!group || group.ownerId !== ownerId) return false
		group.members = [...roster.members]
		group.openStops = [...roster.openStops]
		return true
	}

	async requestTimes(threadId: string, memberId: string | undefined, since: Date): Promise<Date[]> {
		return [...this.requests.values()]
			.filter(row => row.threadId === threadId && (memberId === undefined || row.memberId === memberId) && row.requestedAt >= since)
			.map(row => row.requestedAt)
	}

	async insertRequest(row: PanelCodeRequestRow): Promise<void> {
		this.requests.set(row.id, { ...row })
	}

	async pendingRequests(ownerId: string, since: Date): Promise<PanelCodeRequestRow[]> {
		return [...this.requests.values()]
			.filter(row => row.ownerId === ownerId && row.issuedAt === null && row.requestedAt >= since)
			.sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime())
	}

	async issue(request: PanelCodeRequestRow, codeHash: string, issuedAt: Date, expiresAt: Date): Promise<boolean> {
		const row = this.requests.get(request.id)
		if (!row || row.issuedAt) return false
		Object.assign(row, { codeHash, issuedAt, expiresAt })
		return true
	}

	async latestIssued(threadId: string, memberId: string): Promise<PanelCodeRequestRow | undefined> {
		return [...this.requests.values()]
			.filter(row => row.threadId === threadId && row.memberId === memberId && row.issuedAt)
			.sort((a, b) => (b.issuedAt?.getTime() ?? 0) - (a.issuedAt?.getTime() ?? 0))[0]
	}

	async spendAttempt(requestId: string, max: number): Promise<number | undefined> {
		const row = this.requests.get(requestId)
		if (!row || row.attempts >= max) return undefined
		row.attempts += 1
		return row.attempts
	}

	async consume(requestId: string, at: Date): Promise<boolean> {
		const row = this.requests.get(requestId)
		if (!row || row.usedAt) return false
		row.usedAt = at
		return true
	}

	async insertSession(row: PanelSessionRow): Promise<void> {
		this.sessions.set(row.tokenHash, { ...row })
	}

	async findSession(tokenHash: string): Promise<PanelSessionRow | undefined> {
		return this.sessions.get(tokenHash)
	}

	async deleteSession(tokenHash: string): Promise<void> {
		this.sessions.delete(tokenHash)
	}

	async revokeGroup(threadId: string): Promise<void> {
		for (const [key, row] of this.sessions) if (row.threadId === threadId) this.sessions.delete(key)
		for (const [key, row] of this.requests) if (row.threadId === threadId) this.requests.delete(key)
	}

	async purge(ownerId: string, requestsBefore: Date, now: Date): Promise<void> {
		for (const [key, row] of this.requests) if (row.ownerId === ownerId && row.requestedAt < requestsBefore) this.requests.delete(key)
		for (const [key, row] of this.sessions) if (row.ownerId === ownerId && row.expiresAt < now) this.sessions.delete(key)
	}
}
