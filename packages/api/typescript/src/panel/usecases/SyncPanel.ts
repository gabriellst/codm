import { injectable } from 'tsyringe-neo'
import { randomBytes } from 'node:crypto'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { IssueLifeState, IssueStatus } from '@codm/contracts-typescript/wire/enums'
import { IssueTimelineItemSchema } from '@shared/schemas'
import { PanelStore } from '../services/PanelStore'

export const PanelGroupInputSchema = z.object({ threadId: z.uuid(), name: z.string().trim().min(1).max(200) })

export const PanelIssueInputSchema = z.object({
	issueId: z.uuid(),
	threadId: z.uuid(),
	key: z.string().min(1).max(120),
	title: z.string().max(400),
	status: z.enum(IssueStatus),
	lifeState: z.enum(IssueLifeState),
	waitingForProviderUntil: z.iso.datetime().optional(),
	archived: z.boolean(),
	timeline: z.array(IssueTimelineItemSchema).max(2000),
	/** When the daemon last saw this issue change — a late retry never overwrites a newer snapshot. */
	updatedAt: z.iso.datetime(),
})

export const SyncPanelInputSchema = z.object({
	ownerId: z.uuid(),
	groups: z.array(PanelGroupInputSchema).max(200),
	issues: z.array(PanelIssueInputSchema).max(500),
})
export const SyncPanelOutputSchema = z.object({
	/** The current link token of every group sent — new groups get one on their first sync. */
	groups: z.array(z.object({ threadId: z.uuid(), token: z.string() })),
})

/** A group link token: 32 random bytes, base64url. Possession IS access, so it has to be unguessable. */
export function newPanelToken(): string {
	return randomBytes(32).toString('base64url')
}

/**
 * The daemon reports its groups and the issues that changed (fase 1, `.specs/2026-11-13-painel-na-nuvem-design.md`).
 *
 * Everything is an upsert keyed by id, so a retry or a restart that resends the same snapshot changes
 * nothing. Rows are stamped with the CALLER's owner (from the session), never one from the body, and an
 * issue whose group is not in this same request is ignored — a daemon can only publish into groups it
 * just declared as its own.
 */
@injectable()
export class SyncPanel extends Handler<typeof SyncPanelInputSchema, typeof SyncPanelOutputSchema> {
	readonly name = 'sync_panel' as const
	readonly inputSchema = SyncPanelInputSchema
	readonly outputSchema = SyncPanelOutputSchema

	constructor(private readonly store: PanelStore) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const groups: { threadId: string; token: string }[] = []
			for (const group of input.groups) {
				const token = await this.store.upsertGroup(
					{ threadId: group.threadId, ownerId: input.ownerId, name: group.name },
					newPanelToken(),
					tx,
				)
				// An empty token means the thread id belongs to another owner: not ours, nothing to publish there.
				if (token) groups.push({ threadId: group.threadId, token })
			}
			const ours = new Set(groups.map(group => group.threadId))
			await this.store.upsertIssues(
				input.issues
					.filter(issue => ours.has(issue.threadId))
					.map(issue => ({
						issueId: issue.issueId,
						ownerId: input.ownerId,
						threadId: issue.threadId,
						key: issue.key,
						title: issue.title,
						status: issue.status,
						lifeState: issue.lifeState,
						waitingForProviderUntil: issue.waitingForProviderUntil ? new Date(issue.waitingForProviderUntil) : null,
						archived: issue.archived,
						timeline: issue.timeline,
						updatedAt: new Date(issue.updatedAt),
					})),
				tx,
			)
			await this.store.touchDaemon(input.ownerId, new Date(), tx)
			return { groups }
		})
	}
}
