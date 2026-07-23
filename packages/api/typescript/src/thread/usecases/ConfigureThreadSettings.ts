import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codedm/core-typescript'
import type { Transaction } from '@codedm/core-typescript'
import { BufferSize } from '@codedm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { MentionGateSchema } from '../schemas'
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

@injectable()
export class SetParticipantInvocation extends Handler<
	typeof SetParticipantInvocationInputSchema,
	typeof SetParticipantInvocationOutputSchema
> {
	readonly name = 'set_participant_invocation' as const
	readonly inputSchema = SetParticipantInvocationInputSchema
	readonly outputSchema = SetParticipantInvocationOutputSchema
	constructor(private readonly threads: ThreadRepository) {
		super()
	}
	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId)
			throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
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
