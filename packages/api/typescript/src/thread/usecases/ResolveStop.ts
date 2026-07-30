import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { StopResolution } from '@codm/contracts-typescript/wire/enums'
import { ThreadRepository } from '../repositories/ThreadRepository'
import type { ApplicationErrors } from '../errors'

export const ResolveStopInputSchema = z.object({ ownerId: z.uuid(), stopId: z.uuid(), resolution: z.enum(StopResolution) })
export const ResolveStopOutputSchema = z.void()

/**
 * C25 ResolveStop — the operator answers a stop.
 *
 * Orchestration only, which is the point of the change: the three rules that decide whether a
 * resolution is legal (the stop belongs to this thread, it is still open, the resolution applies to the
 * kind) are invariants of `Thread.resolveStop` now. This use case looks the stop up, checks tenancy,
 * hands both to the aggregate, and commits the write together with the fact the aggregate raised.
 * `RESOLUTION_NOT_APPLICABLE` used to be thrown HERE against a table imported from `issue/objects`.
 *
 * `thread.stop_resolved` → `integration.thread.stop_resolved` is bridged by
 * `PublishThreadIntegrationEvents`; TAKE_OVER additionally pauses the thread on the consuming side.
 */
@injectable()
export class ResolveStop extends Handler<typeof ResolveStopInputSchema, typeof ResolveStopOutputSchema> {
	readonly name = 'resolve_stop' as const
	readonly inputSchema = ResolveStopInputSchema
	readonly outputSchema = ResolveStopOutputSchema

	constructor(private readonly threads: ThreadRepository) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<void> {
		const stop = await this.threads.findStop(input.stopId)
		if (!stop || stop.ownerId !== input.ownerId) throw new BaseError<ApplicationErrors>('STOP_NOT_FOUND', `no stop ${input.stopId}`)

		const thread = await this.threads.findById(stop.threadId)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${stop.threadId}`)

		await this.withTransaction(tx, async tx => {
			thread.resolveStop(stop, input.resolution)
			await this.threads.save(thread, tx)
			// The aggregate raised the fact; the use case owns the transaction, so the drain happens here —
			// unlike Go, where the repository pulls. First TS call site of a mechanism `BaseEntity` has
			// always had.
			await this.domainEventRepository.saveMany(thread.pullDomainEvents(), tx)
		})
	}
}
