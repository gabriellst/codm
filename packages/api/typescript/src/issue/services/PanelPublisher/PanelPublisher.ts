import type { IssueLifeState, IssueStatus } from '@codm/contracts-typescript/wire/enums'
import type { IssueTimelineItem } from '@shared/schemas'

export interface PanelGroupSnapshot {
	threadId: string
	name: string
}

export interface PanelIssueSnapshot {
	issueId: string
	threadId: string
	key: string
	title: string
	status: IssueStatus
	lifeState: IssueLifeState
	waitingForProviderUntil?: string
	archived: boolean
	timeline: IssueTimelineItem[]
	updatedAt: string
}

export interface PanelBatch {
	groups: PanelGroupSnapshot[]
	issues: PanelIssueSnapshot[]
}

/**
 * Pushes the daemon's issues to the CLOUD panel (fase 1, `.specs/2026-11-13-painel-na-nuvem-design.md`),
 * and remembers — for this process — what it already sent and each group's link.
 *
 * The memory is a deliberate cache, not state: a restart forgets it, the next push resends every issue
 * once and the cloud answers with the same group tokens (they are stable there). Nothing here is
 * authoritative; the cloud is, for links, and the local database is, for issues.
 *
 * Registered as a singleton (registry classes are), so the memory outlives each job run.
 */
export abstract class PanelPublisher {
	private readonly tokens = new Map<string, string>()
	private readonly sent = new Map<string, string>()

	/**
	 * Send a batch. `undefined` when it was NOT sent — no cloud credential (not logged in) — so the caller
	 * keeps its fingerprints and tries again later. Network and cloud errors propagate.
	 */
	async publish(batch: PanelBatch): Promise<{ threadId: string; token: string }[] | undefined> {
		const groups = await this.send(batch)
		if (groups === undefined) return undefined
		for (const group of groups) this.tokens.set(group.threadId, group.token)
		return groups
	}

	/** Replace a group's link in the cloud; the old link dies. `undefined` when not logged in. */
	async rotate(threadId: string): Promise<string | undefined> {
		const token = await this.sendRotate(threadId)
		if (token !== undefined) this.tokens.set(threadId, token)
		return token
	}

	/** The panel link of a group, once a push has told us its token. */
	linkOf(threadId: string): string | undefined {
		const token = this.tokens.get(threadId)
		return token ? `${this.cloudOrigin().replace(/\/+$/, '')}/panel/g/${token}` : undefined
	}

	/** Whether this issue's card or timeline changed since it was last sent. */
	changed(issueId: string, fingerprint: string): boolean {
		return this.sent.get(issueId) !== fingerprint
	}

	rememberSent(issueId: string, fingerprint: string): void {
		this.sent.set(issueId, fingerprint)
	}

	protected abstract send(batch: PanelBatch): Promise<{ threadId: string; token: string }[] | undefined>
	protected abstract sendRotate(threadId: string): Promise<string | undefined>
	protected abstract cloudOrigin(): string
}
