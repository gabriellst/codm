import { injectable } from 'tsyringe-neo'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { Handler, z, BaseError, DrizzleClient } from '@codm/core-typescript'
import { threads, remotes } from '@codm/contracts/db'
import { BufferSize, ProviderKind, AgentModelId } from '@codm/contracts-typescript/wire/enums'
import { effectiveModel, modelsFor } from '@codm/contracts/catalog'
// The LEAF, not the barrel — see `AttachThread` and that barrel's header.
import { AgentRunnerFactory } from '@agent/services/AgentRunnerFactory/AgentRunnerFactory'
import { OPERATOR_PARTICIPANT_ID, type Participant } from '../entities/Thread'
import { CUSTOM_PROMPT_MAX_LENGTH } from '../schemas'
import type { ApplicationErrors } from '../errors'

export const GetThreadSettingsInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })

export const GetThreadSettingsOutputSchema = z.object({
	mentionGate: z.discriminatedUnion('enabled', [
		z.object({ enabled: z.literal(false) }),
		z.object({ enabled: z.literal(true), tag: z.string() }),
	]),
	/**
	 * The roster, each member carrying the address of their FACE alongside their name.
	 *
	 * `participantId` is already the platform's own id for them — the `externalId` half of
	 * `GET /ui/avatars/:channelId/:remoteId` — so the row only gains the channel and the flag. Same
	 * three facts `GetSessionChat.sender` carries, and for the same reason: the console addresses the
	 * daemon's cached copy through the SDK's generated query key, never the platform's signed url.
	 *
	 * `channelId` is the thread's own on every row (a roster cannot span channels) and repeats for that
	 * reason — the alternative is a sibling field the console has to zip back together per member.
	 *
	 * The OPERATOR sentinel has no entry in the contact book — it is a word, not a JID — so it reports
	 * `hasAvatar: false` and falls back to initials, exactly like a member the gateway sync has not
	 * written yet.
	 */
	participants: z.array(
		z.object({
			participantId: z.string(),
			name: z.string(),
			source: z.string(),
			canInvoke: z.boolean(),
			channelId: z.uuid(),
			hasAvatar: z.boolean(),
		}),
	),
	invokerCount: z.number().int(),
	bufferSize: z.enum(BufferSize),
	/**
	 * The operator's standing instructions for this conversation — `''` when they never wrote any.
	 *
	 * The one place absence is spelled as the empty string rather than as an absent field, and it is the
	 * READ that gets to do it: the consumer is a textarea, whose value is `''` in exactly that case. An
	 * optional field would make the console write `data.customPrompt ?? ''` and hold a controlled input
	 * that is briefly `undefined` — the React warning about switching an input from uncontrolled to
	 * controlled, earned for nothing. The WRITE keeps the distinction honest (`Thread.configurePrompt`
	 * turns blank back into absence), so nothing downstream of the DB sees an empty string.
	 */
	customPrompt: z.string(),
	/** The cap the textarea counts down to — the SAME number `ConfigurePrompt` validates against. */
	customPromptMaxLength: z.number().int().positive(),
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
	 *
	 * ### `model` and `models` ride HERE, on the provider entry, and not as a sibling field
	 * The choice is per CLI, so the pair belongs to the row that names the CLI — which is also the row
	 * the dialog already renders one of per provider. A parallel `models: Record<provider, …>` beside
	 * this array would be the same relation, spelled twice, for the console to zip back together.
	 *
	 * `model` is the EFFECTIVE one and never absent: `Thread.modelFor` collapses "no key" into `DEFAULT`
	 * server-side, so the console holds a `<Select>` with a value from the first render instead of a
	 * `?? DEFAULT` it has to remember. `models` is that provider's declared catalog — empty for a CLI
	 * this build has never driven, which is the console's cue that there is nothing to choose. It
	 * travels rather than being re-typed on the front for the same reason `customPromptMaxLength` does:
	 * a client that restates the contract is a client that can disagree with it.
	 */
	providers: z.array(
		z.object({
			provider: z.enum(ProviderKind),
			comingSoon: z.boolean(),
			model: z.enum(AgentModelId),
			models: z.array(z.enum(AgentModelId)),
		}),
	),
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
					.select({ remoteId: remotes.remoteId, name: remotes.name, avatarUrl: remotes.avatarUrl })
					.from(remotes)
					.where(and(eq(remotes.channelId, thread.channelId), inArray(remotes.remoteId, externalIds)))
			: []
		// ONE map, not two: the name and the photo are the same contact's, resolved by the same key, and a
		// second `avatarByRemoteId` would be the same lookup written twice.
		const contactByRemoteId = new Map(contacts.map(c => [c.remoteId, c]))

		// NO GUARD HERE, on purpose. An undrivable provider is REPORTED, never refused: this read is the
		// one place a legacy thread's dead binding is visible, so throwing would hide the very fact the
		// field exists to show — and would take the mention gate, the roster and the delete action down
		// with it.
		const drivable = this.runners.supported

		return {
			mentionGate: thread.mentionGateEnabled ? { enabled: true, tag: thread.mentionGateTag ?? '' } : { enabled: false },
			participants: participants.map(p => {
				const contact = contactByRemoteId.get(p.participantId)
				// `||`, not `??`: `gateway_remotes.name` is `NOT NULL DEFAULT ''`, so a synced-but-unnamed
				// contact stores the empty string — which `??` would accept as a name and render as a blank row.
				return { ...p, name: contact?.name || p.name, channelId: thread.channelId, hasAvatar: Boolean(contact?.avatarUrl) }
			}),
			invokerCount: participants.filter(p => p.canInvoke).length,
			bufferSize: thread.bufferSize as BufferSize,
			customPrompt: thread.customPrompt ?? '',
			customPromptMaxLength: CUSTOM_PROMPT_MAX_LENGTH,
			providers: (thread.providers as ProviderKind[]).map(provider => ({
				provider,
				comingSoon: !drivable.includes(provider),
				// The SAME collapse the aggregate uses (`Thread.modelFor` delegates to this function) — this
				// read holds a row, not an entity, and the two must not answer "no choice" differently.
				model: effectiveModel(thread.modelByProvider, provider),
				// `modelsFor`, not `drivable`: what a CLI OFFERS and whether this engine can drive it are two
				// declared facts that happen to agree today. Deriving one from the other would make binding a
				// runner silently invent a model list.
				models: [...modelsFor(provider)],
			})),
		}
	}
}
