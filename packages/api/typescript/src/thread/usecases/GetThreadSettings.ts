import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { Handler, z, BaseError, DrizzleClient } from '@codedm/core-typescript'
import { threads } from '@codedm/contracts/db'
import { BufferSize } from '@codedm/contracts-typescript/wire/enums'
import type { Participant } from '../entities/Thread'
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
		if (!thread || thread.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		const participants = thread.participants as Participant[]
		return {
			mentionGate: thread.mentionGateEnabled ? { enabled: true, tag: thread.mentionGateTag ?? '' } : { enabled: false },
			participants,
			invokerCount: participants.filter(p => p.canInvoke).length,
			bufferSize: thread.bufferSize as BufferSize,
		}
	}
}
