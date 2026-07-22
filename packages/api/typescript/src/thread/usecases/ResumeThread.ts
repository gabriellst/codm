import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@template/core-typescript'
import type { Transaction } from '@template/core-typescript'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { ThreadResumedEvent } from '../events'
import type { ApplicationErrors } from '../errors'

export const ResumeThreadInputSchema = z.object({ ownerId: z.uuid(), threadId: z.uuid() })
export const ResumeThreadOutputSchema = z.void()

/** C11 ResumeThread — idempotent. Agents un-mute; the composer flips back to steer mode. */
@injectable()
export class ResumeThread extends Handler<typeof ResumeThreadInputSchema, typeof ResumeThreadOutputSchema> {
	readonly name = 'resume_thread' as const
	readonly inputSchema = ResumeThreadInputSchema
	readonly outputSchema = ResumeThreadOutputSchema

	constructor(private readonly threads: ThreadRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const thread = await this.threads.findById(input.threadId)
		if (!thread || thread.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)
		thread.resume()
		await this.withTransaction(tx, async tx => {
			await this.threads.save(thread, tx)
			await this.domainEventRepository.save(
				new ThreadResumedEvent({ entityId: thread.id.value, ownerId: thread.ownerId, payload: { threadId: thread.id.value } }),
				tx,
			)
		})
	}
}
