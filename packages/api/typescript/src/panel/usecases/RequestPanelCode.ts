import { injectable } from 'tsyringe-neo'
import { randomUUID } from 'node:crypto'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { PanelIdentityStore } from '../services/PanelIdentityStore'
import { PANEL_IDENTITY } from '../utils/panelIdentity'
import type { ApplicationErrors } from '../errors'

export const RequestPanelCodeInputSchema = z.object({ token: z.string().min(16).max(128), memberId: z.string().min(1).max(64) })
export const RequestPanelCodeOutputSchema = z.void()

/**
 * "Identificar-me" (fase 2, item 6a) — someone on the panel says "I am this member, send me a code".
 *
 * Only the REQUEST is stored; the daemon picks it up on its next roster pull (≤ 15 s), the cloud mints
 * the code at that moment and the daemon DMs it to that member's WhatsApp. Whoever clicked learns
 * nothing from here — the code goes to the person, not to the browser.
 *
 * Rate-limited per member (1/min, 5/h) and per group (15/h, so a link cannot turn the owner's number
 * into a spammer): the requests table IS the counter, so the limit holds across
 * cloud replicas without any extra state.
 */
@injectable()
export class RequestPanelCode extends Handler<typeof RequestPanelCodeInputSchema, typeof RequestPanelCodeOutputSchema> {
	readonly name = 'request_panel_code' as const
	readonly inputSchema = RequestPanelCodeInputSchema
	readonly outputSchema = RequestPanelCodeOutputSchema

	constructor(private readonly store: PanelIdentityStore) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		await this.withTransaction(tx, async tx => {
			const group = await this.store.groupByToken(input.token, tx)
			if (!group) throw new BaseError<ApplicationErrors>('PANEL_NOT_FOUND', 'no panel for this link')
			if (!group.members.some(member => member.memberId === input.memberId)) {
				throw new BaseError<ApplicationErrors>('PANEL_MEMBER_NOT_FOUND', 'not a member of this group')
			}

			const now = new Date()
			const lastHour = await this.store.requestTimes(group.threadId, input.memberId, new Date(now.getTime() - 60 * 60 * 1000), tx)
			const lastMinute = lastHour.filter(at => at.getTime() > now.getTime() - 60 * 1000)
			if (lastMinute.length >= PANEL_IDENTITY.perMinute || lastHour.length >= PANEL_IDENTITY.perHour) {
				throw new BaseError<ApplicationErrors>('PANEL_CODE_RATE_LIMITED', 'too many code requests for this member')
			}
			const groupLastHour = await this.store.requestTimes(group.threadId, undefined, new Date(now.getTime() - 60 * 60 * 1000), tx)
			if (groupLastHour.length >= PANEL_IDENTITY.perGroupPerHour) {
				throw new BaseError<ApplicationErrors>('PANEL_CODE_RATE_LIMITED', 'too many code requests for this group')
			}

			await this.store.insertRequest(
				{
					id: randomUUID(),
					ownerId: group.ownerId,
					threadId: group.threadId,
					memberId: input.memberId,
					requestedAt: now,
					codeHash: null,
					issuedAt: null,
					expiresAt: null,
					attempts: 0,
					usedAt: null,
				},
				tx,
			)
		})
	}
}
