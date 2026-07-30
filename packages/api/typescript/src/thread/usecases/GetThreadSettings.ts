import { injectable } from 'tsyringe-neo'
import { and, eq, inArray } from 'drizzle-orm'
import { Handler, z, BaseError, DrizzleClient } from '@codm/core-typescript'
import { threads, remotes } from '@codm/contracts/db'
import { BufferSize } from '@codm/contracts-typescript/wire/enums'
import { OPERATOR_PARTICIPANT_ID, type Participant } from '../entities/Thread'
import type { ApplicationErrors } from '../errors'

export const GetThreadSettingsInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })

export const GetThreadSettingsOutputSchema = z.object({
	mentionGate: z.discriminatedUnion('enabled', [
		z.object({ enabled: z.literal(false) }),
		z.object({ enabled: z.literal(true), tag: z.string() }),
	]),
	participants: z.array(z.object({ participantId: z.string(), name: z.string(), source: z.string(), canInvoke: z.boolean() })),
	invokerCount: z.number().int(),
	bufferSize: z.enum(BufferSize),
})

/** Read — ThreadSettings (T10). The per-thread behavior modal: mention gate, participants +
 *  invocation rights, and the context-buffer size. */
@injectable()
export class GetThreadSettings extends Handler<typeof GetThreadSettingsInputSchema, typeof GetThreadSettingsOutputSchema> {
	readonly name = 'get_thread_settings' as const
	readonly inputSchema = GetThreadSettingsInputSchema
	readonly outputSchema = GetThreadSettingsOutputSchema

	constructor(private readonly db: DrizzleClient) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		const [thread] = await this.db.select().from(threads).where(eq(threads.id, input.threadId)).limit(1)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		const participants = thread.participants as Participant[]

		/**
		 * Display names come from the gateway's CONTACT BOOK, not from the roster.
		 *
		 * The roster stores `name` as whatever the group snapshot supplied at attach time, and for a
		 * WhatsApp member that is the bare JID — so the settings dialog listed
		 * `558386387518@s.whatsapp.net` where it meant "Gabriel Araújo". `gateway_remotes` already holds
		 * the real name for every one of them.
		 *
		 * Resolved on READ rather than backfilled into the roster, for two reasons: it fixes threads that
		 * are already attached without a migration, and a contact who renames themselves on WhatsApp is
		 * reflected the next time this opens. `participantId` stays the identity; the name is only ever
		 * presentation. Falls back to the stored value, so a member with no contact entry still renders.
		 */
		const externalIds = participants.map(p => p.participantId).filter(id => id !== OPERATOR_PARTICIPANT_ID)
		const contacts = externalIds.length
			? await this.db
					.select({ remoteId: remotes.remoteId, name: remotes.name })
					.from(remotes)
					.where(and(eq(remotes.channelId, thread.channelId), inArray(remotes.remoteId, externalIds)))
			: []
		const nameByRemoteId = new Map(contacts.filter(c => c.name).map(c => [c.remoteId, c.name]))

		return {
			mentionGate: thread.mentionGateEnabled ? { enabled: true, tag: thread.mentionGateTag ?? '' } : { enabled: false },
			participants: participants.map(p => ({ ...p, name: nameByRemoteId.get(p.participantId) ?? p.name })),
			invokerCount: participants.filter(p => p.canInvoke).length,
			bufferSize: thread.bufferSize as BufferSize,
		}
	}
}
