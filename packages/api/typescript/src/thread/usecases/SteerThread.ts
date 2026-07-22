import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { TranscriptKind } from '@template/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { TranscriptRepository } from '../repositories/TranscriptRepository'
import { ThreadSteeredEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const SteerThreadInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid(), text: z.string().trim().min(1) })
export const SteerThreadOutputSchema = z.object({ entryId: z.uuid() })

/**
 * C19 SteerThread — a whisper (never delivered to the channel). Rejected when paused (`THREAD_PAUSED`
 * — use direct mode instead). Appends a WHISPER transcript entry and fans out to every active issue's
 * agent context (via `thread.steered`).
 */
@injectable()
export class SteerThread extends Handler<typeof SteerThreadInputSchema, typeof SteerThreadOutputSchema> {
	readonly name = 'steer_thread' as const
	readonly inputSchema = SteerThreadInputSchema
	readonly outputSchema = SteerThreadOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly transcript: TranscriptRepository,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		if (thread.paused) throw new BaseError<ApplicationErrors>('THREAD_PAUSED', 'a paused thread uses direct mode')

		return this.withTransaction(tx, async tx => {
			const entry = await this.transcript.append(
				{ ownerId: thread.ownerId, threadId: thread.id.value, kind: TranscriptKind.WHISPER, text: input.text },
				tx,
			)
			await this.domainEventRepository.save(
				new ThreadSteeredEvent({
					entityId: thread.id.value,
					ownerId: thread.ownerId,
					payload: { threadId: thread.id.value, entryId: entry.entryId, text: input.text },
				}),
				tx,
			)
			return { entryId: entry.entryId }
		})
	}
}
