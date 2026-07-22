import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ThreadPausedEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const PauseThreadInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })
export const PauseThreadOutputSchema = z.void()

/** C10 PauseThread — idempotent. Mutes agents; the composer flips to direct mode. */
@injectable()
export class PauseThread extends Handler<typeof PauseThreadInputSchema, typeof PauseThreadOutputSchema> {
	readonly name = 'pause_thread' as const
	readonly inputSchema = PauseThreadInputSchema
	readonly outputSchema = PauseThreadOutputSchema

	constructor(private readonly threads: ThreadRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		thread.pause()
		await this.withTransaction(tx, async tx => {
			await this.threads.save(thread, tx)
			await this.domainEventRepository.save(
				new ThreadPausedEvent({ entityId: thread.id.value, ownerId: thread.ownerId, payload: { threadId: thread.id.value } }),
				tx,
			)
		})
	}
}
