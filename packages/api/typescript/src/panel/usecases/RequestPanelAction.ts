import { injectable } from 'tsyringe-neo'
import { randomUUID } from 'node:crypto'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { PanelActionKind, PanelActionStatus } from '@codm/contracts-typescript/wire/enums'
import { PanelActionBodySchema, type PanelActionBody } from '@shared/schemas'
import { PanelIdentityStore, type PanelIdentityGroup, type PanelMember } from '../services/PanelIdentityStore'
import { PanelActionStore } from '../services/PanelActionStore'
import { PanelStore } from '../services/PanelStore'
import { PANEL_ACTIONS } from '../utils/panelActions'
import type { ApplicationErrors } from '../errors'
import { resolvePanelDevice } from './panelDevice'

export const RequestPanelActionInputSchema = z.object({
	token: z.string().min(16).max(128),
	/** The device cookie's value, when the browser sent one. */
	deviceToken: z.string().min(1).max(256).optional(),
	action: PanelActionBodySchema,
})
export const RequestPanelActionOutputSchema = z.object({
	actionId: z.uuid(),
	status: z.literal(PanelActionStatus.PENDING),
})

/**
 * What each kind needs from the person beyond being identified — checked HERE for a fast answer, and
 * again by the daemon, which is the authority (the roster here can be 15 s old). A closed map over the
 * kind: a new kind fails compilation until somebody decides it.
 */
const KIND_GATE: Readonly<
	Record<
		PanelActionKind,
		(ctx: { action: PanelActionBody; member: PanelMember; group: PanelIdentityGroup }) => ApplicationErrors | undefined
	>
> = {
	[PanelActionKind.PAUSE]: () => undefined,
	[PanelActionKind.RESUME]: () => undefined,
	[PanelActionKind.STEER]: () => undefined,
	[PanelActionKind.ANSWER_STOP]: ({ action, member, group }) => {
		if (!member.canRelease) return 'PANEL_CANNOT_RELEASE'
		if (action.kind !== PanelActionKind.ANSWER_STOP) return undefined
		const stop = group.openStops.find(open => open.stopId === action.stopId && open.issueId === action.issueId)
		if (!stop) return 'PANEL_NOT_FOUND'
		return stop.resolutions.includes(action.resolution) ? undefined : 'PANEL_RESOLUTION_NOT_OFFERED'
	},
	// Fase 3: answering an ask from the panel. The body variant, the open asks on the roster snapshot and
	// the who-may-answer rule arrive together in slice S8b; until then the kind exists only in the
	// contract (the ledger's CHECK and this closed map), and is refused.
	[PanelActionKind.ANSWER_ASK]: () => 'PANEL_RESOLUTION_NOT_OFFERED',
}

/**
 * An identified person acts on one issue from the panel (fase 2, item 6b) — pause, resume, steer, answer
 * its stop. The cloud STORES the request; the daemon pulls it with the roster (≤ 15 s), executes it as
 * that member and reports back on its next pull (`GetPanelAction` shows where it stands).
 *
 * Every way of being wrong answers like the link or the identity being wrong: a device that is nobody here
 * is PANEL_MEMBER_NOT_FOUND (identify first); an issue of another group — or none — is PANEL_NOT_FOUND,
 * exactly like a foreign link. Answering a stop needs the "pode liberar" grant up front.
 *
 * Rate-limited per DEVICE (20/min): the actions table is the counter.
 */
@injectable()
export class RequestPanelAction extends Handler<typeof RequestPanelActionInputSchema, typeof RequestPanelActionOutputSchema> {
	readonly name = 'request_panel_action' as const
	readonly inputSchema = RequestPanelActionInputSchema
	readonly outputSchema = RequestPanelActionOutputSchema

	constructor(
		private readonly identities: PanelIdentityStore,
		private readonly panels: PanelStore,
		private readonly actions: PanelActionStore,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		return this.withTransaction(tx, async tx => {
			const { group, member, sessionHash } = await resolvePanelDevice(this.identities, input.token, input.deviceToken, tx)
			if (!group) throw new BaseError<ApplicationErrors>('PANEL_NOT_FOUND', 'no panel for this link')
			if (!member || !sessionHash) throw new BaseError<ApplicationErrors>('PANEL_MEMBER_NOT_FOUND', 'this device is nobody on this panel')

			const issue = await this.panels.findIssue(group.ownerId, group.threadId, input.action.issueId, tx)
			if (!issue || issue.archived) throw new BaseError<ApplicationErrors>('PANEL_NOT_FOUND', 'no panel for this link')

			const refusal = KIND_GATE[input.action.kind]({ action: input.action, member, group })
			if (refusal) throw new BaseError<ApplicationErrors>(refusal, `panel action ${input.action.kind} refused`)

			const now = new Date()
			const recent = await this.actions.requestTimes(sessionHash, new Date(now.getTime() - 60 * 1000), tx)
			if (recent.length >= PANEL_ACTIONS.perDevicePerMinute) {
				throw new BaseError<ApplicationErrors>('PANEL_ACTION_RATE_LIMITED', 'too many actions from this device')
			}

			const actionId = randomUUID()
			await this.actions.insert(
				{
					id: actionId,
					ownerId: group.ownerId,
					threadId: group.threadId,
					memberId: member.memberId,
					sessionHash,
					kind: input.action.kind,
					payload: input.action,
					requestedAt: now,
					deliveredAt: null,
					outcome: null,
					outcomeCode: null,
					outcomeAt: null,
				},
				tx,
			)
			return { actionId, status: PanelActionStatus.PENDING }
		})
	}
}
