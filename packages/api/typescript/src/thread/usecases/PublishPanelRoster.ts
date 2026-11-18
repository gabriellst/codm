import { injectable } from 'tsyringe-neo'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { Handler, LibSqlDatabaseDriver, LoggingService, tryCatchAsync, z } from '@codm/core-typescript'
import { channels, issues, remotes, threads } from '@codm/contracts/db'
import { ContactKind, PermissionPosture } from '@codm/contracts-typescript/wire/enums'
import { CloudSession } from '@shared/services/CloudSession'
import { resolveThreadLanguage } from '@shared/i18n/messages'
import { OPERATOR_PARTICIPANT_ID, type Thread } from '../entities/Thread'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ConsumedMessageRepository } from '../repositories/ConsumedMessageRepository'
import { ChannelSender } from '../services/ChannelSender'
import { GroupMemberReader } from '../services/GroupMemberReader'
import { PanelMemberKey } from '../services/PanelMemberKey'
import { PanelRosterRelay, type PanelCodeDelivery, type PanelRosterMember } from '../services/PanelRosterRelay'
import { PanelActionLedger } from '../repositories/PanelActionLedger'
import { THREAD_MESSAGES } from '../i18n/messages'
import { panelResolutionsForKind } from '../utils/StopResolutions'
import type { PanelActionDelivery, PanelOpenStop } from '@shared/schemas'
import { ExecutePanelAction } from './ExecutePanelAction'

export const PublishPanelRosterInputSchema = z.object({})
export const PublishPanelRosterOutputSchema = z.object({
	/** Whether the roster went out (false: not logged in, or the cloud could not be reached). */
	sent: z.boolean(),
	groups: z.number().int(),
	/** Identification codes DMed in this run. */
	delivered: z.number().int(),
	/** Panel actions executed (or refused) in this run — reported to the cloud on the next one. */
	acted: z.number().int(),
})

/** At most this many outcomes ride one pull; the rest go on the next. */
const OUTCOMES_PER_PULL = 500
/** Reported ledger rows are kept this long — far past the cloud's 2-minute hand-out window. */
const LEDGER_RETENTION_MS = 24 * 60 * 60 * 1000

/**
 * A display name that is really an address — a phone number or a JID. The roster JSON and unsynced
 * contacts carry exactly these, and they must never reach the cloud dressed up as a name.
 */
const ADDRESS_SHAPED = /@|^\+?[\d\s().-]{6,}$/

/** Where a member id points on THIS machine — never sent anywhere. */
interface LocalMember {
	externalId: string
	/** The roster id the grants are read under — the address, or `operator` for the account's own number. */
	participantId: string
	/** The contact-book name — the one the panel lists. */
	name: string
	thread: Thread
}

/**
 * The people-side pull of the cloud panel (fase 2, item 6a — `.specs/2026-11-16-falar-e-parar-na-hora-design.md`),
 * every 15 s.
 *
 * OUT: for each conversation that has issues (the ones with a board), its people — `memberId` (an HMAC
 * of the group and the address, `PanelMemberKey`), the contact-book name, and `canRelease`. The name
 * comes ONLY from `gateway_remotes`; a member with no real name stays off the list rather than going
 * out as a number. `canRelease` is the same rule every other door uses: `Thread.postureOf` (the "pode
 * liberar" grant), with the account's own number standing for the operator — on the channel its
 * `fromMe` IS the operator.
 *
 * IN: the codes people asked for on the panel, minted by the cloud at this pull. Each is DMed to that
 * member, resolved through the map this same run just built (by id, never by name), straight through
 * `ChannelSender` — NOT the command queue, whose row would keep the plain code at rest (and forever, if
 * it dead-lettered). A failed DM is logged without the code and dropped: the person asks again. The echo
 * is claimed like every SYSTEM delivery, so the DM never becomes a transcript entry or a turn.
 *
 * ACTIONS (fase 2, item 6b) ride the same pull. OUT, each group's open stops with the answers the panel
 * may give (`panelResolutionsForKind`), and the outcomes of actions already executed — read from the
 * ledger and marked reported only after the pull succeeded, so none is lost to a failed call or a
 * restart. IN, the actions people asked for: each is executed by `ExecutePanelAction` as the member the
 * id resolves to in the map this run just built (by id, never by name), at most once per action id.
 *
 * Not logged in → nothing is sent. A cloud that cannot be reached is a warning; the next run retries.
 */
@injectable()
export class PublishPanelRoster extends Handler<typeof PublishPanelRosterInputSchema, typeof PublishPanelRosterOutputSchema> {
	readonly name = 'publish_panel_roster' as const
	readonly inputSchema = PublishPanelRosterInputSchema
	readonly outputSchema = PublishPanelRosterOutputSchema

	static readonly repeat = { every: 15 * 1000 }

	constructor(
		private readonly driver: LibSqlDatabaseDriver,
		private readonly threads: ThreadRepository,
		private readonly groupMembers: GroupMemberReader,
		private readonly memberKey: PanelMemberKey,
		private readonly relay: PanelRosterRelay,
		private readonly sender: ChannelSender,
		private readonly consumed: ConsumedMessageRepository,
		private readonly session: CloudSession,
		private readonly logging: LoggingService,
		private readonly ledger: PanelActionLedger,
		private readonly executeAction: ExecutePanelAction,
	) {
		super()
	}

	protected async handle(): Promise<this['output']> {
		const boarded = await this.driver.db
			.selectDistinct({ threadId: threads.id })
			.from(threads)
			.innerJoin(issues, eq(issues.threadId, threads.id))
			.where(isNull(threads.deletedAt))

		const local = new Map<string, LocalMember>()
		const groups: { threadId: string; members: PanelRosterMember[]; openStops: PanelOpenStop[] }[] = []
		for (const { threadId } of boarded) {
			const thread = await this.threads.findById(threadId)
			if (!thread) continue
			groups.push({ threadId, members: await this.rosterOf(thread, local), openStops: await this.openStopsOf(thread) })
		}

		const unreported = await this.ledger.unreported(OUTCOMES_PER_PULL)
		const outcomes = unreported.map(row => ({ actionId: row.actionId, status: row.outcome, code: row.code }))
		const pulled = await tryCatchAsync(() => this.relay.sync({ groups, outcomes }))
		if (!pulled.success) {
			this.logging.warn({ content: { message: 'panel roster sync failed — the next run retries', error: pulled.error.message } })
			return { sent: false, groups: groups.length, delivered: 0, acted: 0 }
		}
		if (pulled.data === undefined) return { sent: false, groups: groups.length, delivered: 0, acted: 0 }

		// The cloud stored these outcomes in the same request that answered — they never need sending again.
		const now = new Date()
		await this.ledger.markReported(
			unreported.map(row => row.actionId),
			now,
		)
		await this.ledger.purge(new Date(now.getTime() - LEDGER_RETENTION_MS))

		let delivered = 0
		for (const delivery of pulled.data.deliveries) if (await this.deliver(delivery, local)) delivered += 1
		let acted = 0
		for (const action of pulled.data.actions) if (await this.act(action, local)) acted += 1
		return { sent: true, groups: groups.length, delivered, acted }
	}

	/** The issue stops of a conversation the panel may answer, each with the answers it admits there. */
	private async openStopsOf(thread: Thread): Promise<PanelOpenStop[]> {
		const open = await this.threads.openStops(thread.id.value)
		const answerable: PanelOpenStop[] = []
		for (const stop of open) {
			const resolutions = panelResolutionsForKind(stop.kind)
			// A thread-level stop (no issue) has no card on the board; a kind with no panel answer has no button.
			if (stop.issueId && resolutions.length > 0)
				answerable.push({ stopId: stop.stopId, issueId: stop.issueId, kind: stop.kind, resolutions })
		}
		return answerable
	}

	/** Execute one pulled action as the member its id resolves to here. Never throws: a failure is logged and the cloud re-delivers. */
	private async act(action: PanelActionDelivery, local: Map<string, LocalMember>): Promise<boolean> {
		const target = local.get(`${action.threadId}\n${action.memberId}`)
		const outcome = await tryCatchAsync(() =>
			this.executeAction.execute({
				actionId: action.actionId,
				threadId: action.threadId,
				member: target && { externalId: target.externalId, participantId: target.participantId, name: target.name },
				action: action.action,
			}),
		)
		if (!outcome.success) {
			this.logging.warn({
				content: { message: 'panel action failed — the cloud hands it out again', actionId: action.actionId, error: outcome.error.message },
			})
			return false
		}
		return outcome.data.executed
	}

	/** The people of one conversation as the panel may know them; fills `local` with where each id points. */
	private async rosterOf(thread: Thread, local: Map<string, LocalMember>): Promise<PanelRosterMember[]> {
		const threadId = thread.id.value
		// Same roster rule as GetThreadSettings: a group's LIVE membership; a 1:1 its recorded participants.
		const externalIds =
			thread.contactRef.kind === ContactKind.GROUP
				? (await this.groupMembers.listMembers(thread.channelId, thread.contactRef.externalId)).map(member => member.memberId)
				: thread.participants.map(participant => participant.participantId)
		const addresses = externalIds.filter(id => id !== OPERATOR_PARTICIPANT_ID)
		if (addresses.length === 0) return []

		const [contacts, [channel]] = await Promise.all([
			this.driver.db
				.select({ remoteId: remotes.remoteId, name: remotes.name })
				.from(remotes)
				.where(and(eq(remotes.channelId, thread.channelId), inArray(remotes.remoteId, addresses))),
			this.driver.db.select({ ownerRemoteId: channels.ownerRemoteId }).from(channels).where(eq(channels.id, thread.channelId)).limit(1),
		])
		const nameOf = new Map(contacts.map(contact => [contact.remoteId, contact.name.trim()]))

		const members: PanelRosterMember[] = []
		for (const externalId of addresses) {
			const name = nameOf.get(externalId)
			if (!name || ADDRESS_SHAPED.test(name)) continue
			const asParticipant = externalId === channel?.ownerRemoteId ? OPERATOR_PARTICIPANT_ID : externalId
			const memberId = this.memberKey.memberIdOf(threadId, externalId)
			local.set(`${threadId}\n${memberId}`, { externalId, participantId: asParticipant, name, thread })
			members.push({ memberId, name, canRelease: thread.postureOf(asParticipant) === PermissionPosture.BYPASS })
		}
		return members
	}

	private async deliver(delivery: PanelCodeDelivery, local: Map<string, LocalMember>): Promise<boolean> {
		const target = local.get(`${delivery.threadId}\n${delivery.memberId}`)
		if (!target) {
			this.logging.info({ content: { message: 'panel code for a member not on the roster — dropped', requestId: delivery.requestId } })
			return false
		}
		const { thread, externalId } = target
		const outcome = await tryCatchAsync(async () => {
			const ownerLanguage = thread.language ? undefined : (await this.session.identity())?.user.language
			const text = THREAD_MESSAGES.panelCode(resolveThreadLanguage(thread.language, ownerLanguage), { code: delivery.code })
			const { messageId } = await this.sender.send({ channelId: thread.channelId, remoteId: externalId, text }, thread.ownerId)
			// The echo of our own DM is not someone talking: claimed like every SYSTEM delivery.
			await this.consumed.claim({ ownerId: thread.ownerId, channelId: thread.channelId, platformMessageId: messageId })
		})
		if (!outcome.success) {
			this.logging.warn({
				content: { message: 'panel code DM failed — the person asks again', requestId: delivery.requestId, error: outcome.error.message },
			})
			return false
		}
		return true
	}
}
