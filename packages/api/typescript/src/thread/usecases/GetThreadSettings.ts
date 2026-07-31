import { injectable } from 'tsyringe-neo'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { Handler, z, BaseError, DrizzleClient } from '@codm/core-typescript'
import { threads, remotes } from '@codm/contracts/db'
import { BufferSize, ProviderKind } from '@codm/contracts-typescript/wire/enums'
// The LEAF, not the barrel — see `AttachThread` and that barrel's header.
import { AgentRunnerFactory } from '@agent/services/AgentRunnerFactory/AgentRunnerFactory'
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
	/**
	 * The providers this conversation DECLARES, each flagged against what the engine can actually drive.
	 *
	 * It is the WRITE guard's read-side counterpart, and it exists because that guard is deliberately
	 * only on the write (founder, 31-jul): a thread bound to CODEX before the guard existed keeps
	 * loading everywhere, so the operator has to be able to SEE why it never answers. Rendering it here
	 * — the one screen that already exists per conversation — beats failing the turn, which is the same
	 * "a screen too late" this whole change is closing.
	 *
	 * `comingSoon` is the catalog's word for exactly this fact (`DetectProviders`,
	 * `GetAttachThreadWizard`, `GetSettings` all carry it) and comes from the same
	 * `AgentRunnerFactory.supported`. Deliberately NOT `available`: the wizard's `available` composes
	 * detection with drivability, and this read does not probe the filesystem — what a bound thread
	 * knows is what it declared, not whether the binary is on PATH right now.
	 */
	providers: z.array(z.object({ provider: z.enum(ProviderKind), comingSoon: z.boolean() })),
})

/** Read — ThreadSettings (T10). The per-thread behavior modal: mention gate, participants +
 *  invocation rights, the context-buffer size, and the bound providers with their drivability. */
@injectable()
export class GetThreadSettings extends Handler<typeof GetThreadSettingsInputSchema, typeof GetThreadSettingsOutputSchema> {
	readonly name = 'get_thread_settings' as const
	readonly inputSchema = GetThreadSettingsInputSchema
	readonly outputSchema = GetThreadSettingsOutputSchema

	constructor(
		private readonly db: DrizzleClient,
		private readonly runners: AgentRunnerFactory,
	) {
		super()
	}

	protected async handle(input: this['input']): Promise<this['output']> {
		// Filtered on `deletedAt` like its sibling `GetSessionChat` (thread-deletion spec, decision 5). It
		// matters here in particular because THIS dialog is where the delete is triggered from: the settings
		// of a conversation that no longer exists must not keep rendering after the action succeeds.
		const [thread] = await this.db
			.select()
			.from(threads)
			.where(and(eq(threads.id, input.threadId), isNull(threads.deletedAt)))
			.limit(1)
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

		// NO GUARD HERE, on purpose. An undrivable provider is REPORTED, never refused: this read is the
		// one place a legacy thread's dead binding is visible, so throwing would hide the very fact the
		// field exists to show — and would take the mention gate, the roster and the delete action down
		// with it.
		const drivable = this.runners.supported

		return {
			mentionGate: thread.mentionGateEnabled ? { enabled: true, tag: thread.mentionGateTag ?? '' } : { enabled: false },
			participants: participants.map(p => ({ ...p, name: nameByRemoteId.get(p.participantId) ?? p.name })),
			invokerCount: participants.filter(p => p.canInvoke).length,
			bufferSize: thread.bufferSize as BufferSize,
			providers: (thread.providers as ProviderKind[]).map(provider => ({ provider, comingSoon: !drivable.includes(provider) })),
		}
	}
}
