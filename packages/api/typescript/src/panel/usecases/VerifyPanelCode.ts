import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { PanelIdentityStore } from '../services/PanelIdentityStore'
import { PANEL_IDENTITY, newPanelDeviceToken, panelCodeMatches, panelDeviceTokenHash } from '../utils/panelIdentity'
import { PanelMemberSchema } from './SyncPanelRoster'
import type { ApplicationErrors } from '../errors'

export const VerifyPanelCodeInputSchema = z.object({
	token: z.string().min(16).max(128),
	memberId: z.string().min(1).max(64),
	code: z.string().regex(/^\d{6}$/),
})
export const VerifyPanelCodeOutputSchema = z.object({
	/** The device session token — the controller puts it in an HttpOnly cookie and never in the body. */
	deviceToken: z.string(),
	member: PanelMemberSchema,
})

/**
 * The person typed the code WhatsApp delivered (fase 2, item 6a). Right code → this browser is that
 * member for 30 days.
 *
 * Only the member's LATEST issued code counts. The try is SPENT before comparing, by one conditional
 * statement that commits on its own — never inside the transaction a refusal rolls back, or a wrong
 * code would cost nothing and the 5-try cap would be decoration. Consuming is likewise conditional, so
 * of two tabs racing with the same code exactly one opens a session.
 */
@injectable()
export class VerifyPanelCode extends Handler<typeof VerifyPanelCodeInputSchema, typeof VerifyPanelCodeOutputSchema> {
	readonly name = 'verify_panel_code' as const
	readonly inputSchema = VerifyPanelCodeInputSchema
	readonly outputSchema = VerifyPanelCodeOutputSchema

	constructor(private readonly store: PanelIdentityStore) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const group = await this.store.groupByToken(input.token)
		if (!group) throw new BaseError<ApplicationErrors>('PANEL_NOT_FOUND', 'no panel for this link')
		const member = group.members.find(candidate => candidate.memberId === input.memberId)
		if (!member) throw new BaseError<ApplicationErrors>('PANEL_MEMBER_NOT_FOUND', 'not a member of this group')

		const request = await this.store.latestIssued(group.threadId, input.memberId)
		// Nothing delivered yet (the daemon has not pulled the request): not a try, just not a code.
		if (!request?.codeHash || !request.expiresAt) throw new BaseError<ApplicationErrors>('PANEL_CODE_INVALID', 'no code for this member')
		const now = new Date()
		if (request.usedAt || request.expiresAt <= now) throw new BaseError<ApplicationErrors>('PANEL_CODE_EXPIRED', 'code expired or used')

		if ((await this.store.spendAttempt(request.id, PANEL_IDENTITY.maxAttempts)) === undefined) {
			throw new BaseError<ApplicationErrors>('PANEL_CODE_ATTEMPTS_EXCEEDED', 'too many wrong tries')
		}
		if (!panelCodeMatches(request.id, input.code, request.codeHash)) {
			throw new BaseError<ApplicationErrors>('PANEL_CODE_INVALID', 'wrong code')
		}

		const deviceToken = newPanelDeviceToken()
		await this.withTransaction(tx, async tx => {
			if (!(await this.store.consume(request.id, now, tx)))
				throw new BaseError<ApplicationErrors>('PANEL_CODE_EXPIRED', 'code already used')
			await this.store.insertSession(
				{
					tokenHash: panelDeviceTokenHash(deviceToken),
					ownerId: group.ownerId,
					threadId: group.threadId,
					memberId: member.memberId,
					createdAt: now,
					expiresAt: new Date(now.getTime() + PANEL_IDENTITY.sessionTtlMs),
				},
				tx,
			)
		})
		return { deviceToken, member }
	}
}
