import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { PanelIdentityStore } from '../services/PanelIdentityStore'
import { PANEL_IDENTITY, newPanelCode, panelCodeHash } from '../utils/panelIdentity'

/**
 * One person of a group as the panel may know them. `memberId` is OPAQUE — an HMAC the daemon derives
 * from the group and the person's WhatsApp address with a key that never leaves the machine — so no
 * phone number or JID ever reaches the cloud. Bounded so a phone-shaped string has nowhere to hide in
 * an id (base64url only).
 */
export const PanelMemberSchema = z.object({
	memberId: z
		.string()
		.min(16)
		.max(64)
		.regex(/^[A-Za-z0-9_-]+$/),
	name: z.string().trim().min(1).max(120),
	/** The "pode liberar" grant — whether this person may release a stop (fase 2, item 6b enforces it). */
	canRelease: z.boolean(),
})

export const SyncPanelRosterInputSchema = z.object({
	ownerId: z.uuid(),
	groups: z.array(z.object({ threadId: z.uuid(), members: z.array(PanelMemberSchema).max(1024) })).max(200),
})
export const SyncPanelRosterOutputSchema = z.object({
	/**
	 * The codes the daemon must deliver NOW, each by WhatsApp DM to that member. Minted at this moment;
	 * the plain code exists only in this response — the cloud keeps its HMAC.
	 */
	deliveries: z.array(
		z.object({
			requestId: z.uuid(),
			threadId: z.uuid(),
			memberId: z.string(),
			code: z.string().regex(/^\d{6}$/),
		}),
	),
})

/**
 * The daemon's people-side pull (fase 2, item 6a — `.specs/2026-11-16-falar-e-parar-na-hora-design.md`).
 *
 * Every 15 s the daemon pushes each group's roster and, in the same answer, receives the code requests
 * people made on the panel since. The cloud cannot call the daemon (a desktop app), so this pull IS the
 * channel. Rosters only land in groups the caller owns (`replaceMembers` is owner-scoped), and a request
 * is handed out at most once (`issue` stamps it conditionally).
 *
 * The code is minted HERE rather than at request time so the plain value is never at rest anywhere in
 * the cloud: between the person's click and this pull, only the request exists.
 */
@injectable()
export class SyncPanelRoster extends Handler<typeof SyncPanelRosterInputSchema, typeof SyncPanelRosterOutputSchema> {
	readonly name = 'sync_panel_roster' as const
	readonly inputSchema = SyncPanelRosterInputSchema
	readonly outputSchema = SyncPanelRosterOutputSchema

	constructor(private readonly store: PanelIdentityStore) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			for (const group of input.groups) await this.store.replaceMembers(input.ownerId, group.threadId, group.members, tx)

			const now = new Date()
			await this.store.purge(input.ownerId, new Date(now.getTime() - PANEL_IDENTITY.requestRetentionMs), now, tx)

			const pending = await this.store.pendingRequests(input.ownerId, new Date(now.getTime() - PANEL_IDENTITY.pendingWindowMs), tx)
			const deliveries: this['output']['deliveries'] = []
			for (const request of pending) {
				const code = newPanelCode()
				const expiresAt = new Date(now.getTime() + PANEL_IDENTITY.codeTtlMs)
				// A concurrent pull that stamped it first owns its delivery; this one must not send a code it did not store.
				if (!(await this.store.issue(request, panelCodeHash(request.id, code), now, expiresAt, tx))) continue
				deliveries.push({ requestId: request.id, threadId: request.threadId, memberId: request.memberId, code })
			}
			return { deliveries }
		})
	}
}
