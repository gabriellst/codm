import { injectable } from 'tsyringe-neo'
import { Handler, z } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { PanelActionDeliverySchema, PanelActionOutcomeSchema, PanelOpenStopSchema } from '@shared/schemas'
import { PanelIdentityStore } from '../services/PanelIdentityStore'
import { PanelActionStore } from '../services/PanelActionStore'
import { PANEL_IDENTITY, newPanelCode, panelCodeHash } from '../utils/panelIdentity'
import { PANEL_ACTIONS } from '../utils/panelActions'

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
	groups: z
		.array(
			z.object({
				threadId: z.uuid(),
				members: z.array(PanelMemberSchema).max(1024),
				/** The group's open stops the panel may answer (fase 2, item 6b). Absent = none. */
				openStops: z.array(PanelOpenStopSchema).max(200).optional(),
			}),
		)
		.max(200),
	/** What the daemon did with the actions it pulled before (fase 2, item 6b) — re-sent until a pull succeeds. */
	outcomes: z.array(PanelActionOutcomeSchema).max(500).optional(),
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
	/**
	 * The panel actions to execute NOW (fase 2, item 6b), oldest first, each as the member who asked. An
	 * action whose outcome does not come back is handed out again after a while — the daemon executes an
	 * action id at most once.
	 */
	actions: z.array(PanelActionDeliverySchema),
})

/**
 * The daemon's people-side pull (fase 2, item 6a — `.specs/2026-11-16-falar-e-parar-na-hora-design.md`).
 *
 * Every 15 s the daemon pushes each group's roster and, in the same answer, receives the code requests
 * people made on the panel since. The cloud cannot call the daemon (a desktop app), so this pull IS the
 * channel. Rosters only land in groups the caller owns (`replaceRoster` is owner-scoped), and a request
 * is handed out at most once (`issue` stamps it conditionally).
 *
 * The code is minted HERE rather than at request time so the plain value is never at rest anywhere in
 * the cloud: between the person's click and this pull, only the request exists.
 *
 * The same pull carries the panel ACTIONS (fase 2, item 6b) both ways: IN, the outcomes of actions the
 * daemon executed since its last pull (and each group's open stops, so the panel knows which answers a
 * stop admits); OUT, the actions people asked for since. An action is handed out only while it is fresh
 * (`PANEL_ACTIONS.liveMs`) — a daemon back from a long absence does not act on old clicks.
 */
@injectable()
export class SyncPanelRoster extends Handler<typeof SyncPanelRosterInputSchema, typeof SyncPanelRosterOutputSchema> {
	readonly name = 'sync_panel_roster' as const
	readonly inputSchema = SyncPanelRosterInputSchema
	readonly outputSchema = SyncPanelRosterOutputSchema

	constructor(
		private readonly store: PanelIdentityStore,
		private readonly actions: PanelActionStore,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			for (const group of input.groups) {
				await this.store.replaceRoster(input.ownerId, group.threadId, { members: group.members, openStops: group.openStops ?? [] }, tx)
			}

			const now = new Date()
			// Owner-scoped and first-wins: an outcome only lands on this owner's own pending action.
			for (const outcome of input.outcomes ?? []) await this.actions.recordOutcome(input.ownerId, outcome, now, tx)
			await this.store.purge(input.ownerId, new Date(now.getTime() - PANEL_IDENTITY.requestRetentionMs), now, tx)
			await this.actions.purge(input.ownerId, new Date(now.getTime() - PANEL_ACTIONS.retentionMs), tx)

			const pending = await this.store.pendingRequests(input.ownerId, new Date(now.getTime() - PANEL_IDENTITY.pendingWindowMs), tx)
			const deliveries: this['output']['deliveries'] = []
			for (const request of pending) {
				const code = newPanelCode()
				const expiresAt = new Date(now.getTime() + PANEL_IDENTITY.codeTtlMs)
				// A concurrent pull that stamped it first owns its delivery; this one must not send a code it did not store.
				if (!(await this.store.issue(request, panelCodeHash(request.id, code), now, expiresAt, tx))) continue
				deliveries.push({ requestId: request.id, threadId: request.threadId, memberId: request.memberId, code })
			}

			const due = await this.actions.handOut(
				input.ownerId,
				now,
				new Date(now.getTime() - PANEL_ACTIONS.liveMs),
				new Date(now.getTime() - PANEL_ACTIONS.redeliverAfterMs),
				tx,
			)
			const actions = due.map(row => ({ actionId: row.id, threadId: row.threadId, memberId: row.memberId, action: row.payload }))
			return { deliveries, actions }
		})
	}
}
