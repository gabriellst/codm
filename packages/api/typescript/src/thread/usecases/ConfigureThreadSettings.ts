import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { BufferSize, ProviderKind, AgentModelId, ContactKind } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { GroupMemberReader } from '../services/GroupMemberReader'
import { CUSTOM_PROMPT_MAX_LENGTH, MentionGateSchema } from '../schemas'
import type { ApplicationErrors } from '../errors'

// C12 ConfigureMentionGate — enabling requires a non-empty tag (enforced by the discriminated-union VO).
export const ConfigureMentionGateInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid(), mentionGate: MentionGateSchema })
export const ConfigureMentionGateOutputSchema = z.void()

@injectable()
export class ConfigureMentionGate extends Handler<typeof ConfigureMentionGateInputSchema, typeof ConfigureMentionGateOutputSchema> {
	readonly name = 'configure_mention_gate' as const
	readonly inputSchema = ConfigureMentionGateInputSchema
	readonly outputSchema = ConfigureMentionGateOutputSchema
	constructor(private readonly threads: ThreadRepository) {
		super()
	}
	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		thread.configureMentionGate(input.mentionGate)
		await this.withTransaction(tx, async tx => this.threads.save(thread, tx))
	}
}

// C13 SetParticipantInvocation — toggling the last invoker off is rejected (LAST_INVOKER).
export const SetParticipantInvocationInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	participantId: z.string().min(1),
	canInvoke: z.boolean(),
})
export const SetParticipantInvocationOutputSchema = z.void()

/**
 * C13 SetParticipantInvocation.
 *
 * ### Admitting a live member the JSON roster has never recorded
 * `GetThreadSettings` now renders a GROUP thread's roster from the LIVE `gateway_remote_memberships`
 * projection, unioned with the JSON for `canInvoke`/name-fallback/the operator sentinel — so the
 * dialog can show a toggle for someone the JSON has never heard of. Toggling that row used to explode
 * with `PARTICIPANT_NOT_FOUND` (`Thread.setParticipantInvocation` only ever knew the JSON). Before
 * calling it, this use case checks whether the target is already on the JSON roster; if not, it
 * verifies the id against the SAME live projection (`GroupMemberReader.isMember`) and, only if it
 * checks out, admits it (`Thread.admitParticipant`) before flipping the toggle.
 *
 * An id that is neither on the JSON roster nor a live group member falls through untouched — the
 * pre-existing `Thread.setParticipantInvocation` guard still raises `PARTICIPANT_NOT_FOUND` for it, so
 * the admission door does not become a way to grant invocation rights to an arbitrary id.
 */
@injectable()
export class SetParticipantInvocation extends Handler<
	typeof SetParticipantInvocationInputSchema,
	typeof SetParticipantInvocationOutputSchema
> {
	readonly name = 'set_participant_invocation' as const
	readonly inputSchema = SetParticipantInvocationInputSchema
	readonly outputSchema = SetParticipantInvocationOutputSchema
	constructor(
		private readonly threads: ThreadRepository,
		private readonly groupMembers: GroupMemberReader,
	) {
		super()
	}
	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		const onJsonRoster = thread.participants.some(p => p.participantId === input.participantId)
		if (!onJsonRoster && thread.contactRef.kind === ContactKind.GROUP) {
			const isLiveMember = await this.groupMembers.isMember(thread.channelId, thread.contactRef.externalId, input.participantId)
			if (isLiveMember) {
				thread.admitParticipant({
					participantId: input.participantId,
					name: input.participantId,
					source: 'Channel group member',
					canInvoke: false,
				})
			}
		}

		thread.setParticipantInvocation(input.participantId, input.canInvoke)
		await this.withTransaction(tx, async tx => this.threads.save(thread, tx))
	}
}

// C14 ConfigureContextBuffer — size ∈ {25,50,100,200} (BufferSize enum).
export const ConfigureContextBufferInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid(), bufferSize: z.enum(BufferSize) })
export const ConfigureContextBufferOutputSchema = z.void()

@injectable()
export class ConfigureContextBuffer extends Handler<typeof ConfigureContextBufferInputSchema, typeof ConfigureContextBufferOutputSchema> {
	readonly name = 'configure_context_buffer' as const
	readonly inputSchema = ConfigureContextBufferInputSchema
	readonly outputSchema = ConfigureContextBufferOutputSchema
	constructor(private readonly threads: ThreadRepository) {
		super()
	}
	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		thread.configureContextBuffer(input.bufferSize)
		await this.withTransaction(tx, async tx => this.threads.save(thread, tx))
	}
}

/**
 * C16 ConfigureModel — WHICH MODEL this conversation asks ONE of its CLIs for.
 *
 * ### Why the input carries a `provider`, and is not just a model
 * `providers` is an array and `opus` is vocabulary of one binary, so "the thread's model" is not a
 * well-formed idea — the choice only means something paired with the CLI it is for. The catalog of what
 * each provider offers is declared once (`contracts/catalog/agent-models.ts`) and `Thread.configureModel`
 * is what enforces both halves: the provider must be one this conversation runs, and the model must be
 * one that provider offers.
 *
 * ### Why the model is REQUIRED, unlike the custom prompt's optional text
 * `AgentModelId.DEFAULT` is a real member and a real option in the catalog — it is the instruction to
 * omit `--model` — so "back to automatic" already has a value to send and does not need absence to
 * spell it. The erase happens inside the aggregate (the key is deleted, never stored as `DEFAULT`),
 * which is why the door can stay total.
 */
export const ConfigureModelInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	provider: z.enum(ProviderKind),
	model: z.enum(AgentModelId),
})
export const ConfigureModelOutputSchema = z.void()

@injectable()
export class ConfigureModel extends Handler<typeof ConfigureModelInputSchema, typeof ConfigureModelOutputSchema> {
	readonly name = 'configure_model' as const
	readonly inputSchema = ConfigureModelInputSchema
	readonly outputSchema = ConfigureModelOutputSchema
	constructor(private readonly threads: ThreadRepository) {
		super()
	}
	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		thread.configureModel(input.provider, input.model)
		await this.withTransaction(tx, async tx => this.threads.save(thread, tx))
	}
}

/**
 * C15 ConfigurePrompt — the operator's own standing instructions for ONE conversation.
 *
 * ### Why the input is `string`, not `CustomPromptSchema`
 * The VO describes a PROMPT, and a prompt is non-empty by definition. What this operation accepts is
 * broader: the contents of a textarea, which includes the blank one that means "erase". Validating the
 * value shape here would make clearing the field a VALIDATION_ERROR — the operator's most ordinary
 * second action after writing one. `Thread.configurePrompt` is where blank becomes absence, and the
 * cap is still enforced (by `validate()` against the same `CustomPromptSchema`) on the way in, so the
 * looser door does not widen what can be STORED.
 *
 * The field stays optional so a caller may also erase by omission, which is what an MCP client with no
 * concept of an empty text box would send.
 */
export const ConfigurePromptInputSchema = z.object({
	ownerId: z.uuid(),
	threadId: z.uuid(),
	customPrompt: z.string().max(CUSTOM_PROMPT_MAX_LENGTH).optional(),
})
export const ConfigurePromptOutputSchema = z.void()

@injectable()
export class ConfigurePrompt extends Handler<typeof ConfigurePromptInputSchema, typeof ConfigurePromptOutputSchema> {
	readonly name = 'configure_prompt' as const
	readonly inputSchema = ConfigurePromptInputSchema
	readonly outputSchema = ConfigurePromptOutputSchema
	constructor(private readonly threads: ThreadRepository) {
		super()
	}
	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		thread.configurePrompt(input.customPrompt)
		await this.withTransaction(tx, async tx => this.threads.save(thread, tx))
	}
}
